/* ==================================================================
   /functions/api/channel-notify.js
   After a conversation_messages insert: web push to eligible channel members.
   Auth: sender JWT, OR Bearer CRON_SECRET for system prompts.
   ================================================================== */

import { isUuid } from "../_shared/credits.js";
import { invokeEdgeFunction } from "../_shared/supabaseEmail.js";
import {
  authorizeCron,
  claimNotificationJob,
  finishNotificationJob,
  raceDeadline,
} from "../_shared/messageOutbox.js";

const CHANNEL_PUSH_CONCURRENCY = 8;

export async function onRequestPost({ request, env, signal }) {
  let job = null;
  try {
    const body = await request.json().catch(() => ({}));
    const messageId = String(body.messageId || "").trim();
    if (!messageId || !isUuid(messageId)) {
      return json({ error: "messageId required" }, 400);
    }

    const cronAuth = authorizeCron(request, env);
    const user = cronAuth ? null : await requireUser(request, env);
    if (!cronAuth && !user) return json({ error: "unauthorized" }, 401);

    let msg;
    if (cronAuth) {
      job = await claimNotificationJob(env, "channel", messageId);
      if (!job) {
        return json({ ok: true, skipped: "queued_or_already_processed", pushSent: 0 });
      }
    } else {
      msg = await loadChannelMessage(env, messageId);
      if (!msg) return json({ error: "not found" }, 404);
      if (!msg.sender_id || msg.sender_id !== user.id) {
        return json({ error: "forbidden" }, 403);
      }
      job = await claimNotificationJob(env, "channel", messageId);
    }
    if (!job) {
      return json({ ok: true, skipped: "queued_or_already_processed", pushSent: 0 });
    }

    const result = await raceDeadline(signal, () => processClaimedChannel({
      env,
      messageId,
      msg,
    }));
    await finishNotificationJob(env, job, { success: true });
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("channel-notify failed", e);
    if (job) {
      try {
        await finishNotificationJob(env, job, {
          success: false,
          error: e?.message || e,
        });
      } catch (finishErr) {
        console.error("channel outbox retry scheduling failed", finishErr);
      }
    }
    return json({ error: "notify failed" }, 500);
  }
}

async function processClaimedChannel({ env, messageId, msg }) {
  const loaded = msg || await loadChannelMessage(env, messageId);
  if (!loaded) {
    return { skipped: "source_missing", pushSent: 0 };
  }
  if (loaded.deleted_at) {
    return { skipped: "deleted", pushSent: 0 };
  }
  if (loaded.notified_at) {
    return { skipped: "already_notified", pushSent: 0 };
  }

  const [conversation, sender, members, replyTo, adminIds] = await Promise.all([
    loadConversation(env, loaded.conversation_id),
    loaded.sender_id ? loadProfile(env, loaded.sender_id) : Promise.resolve(null),
    listConversationMembers(env, loaded.conversation_id),
    loaded.reply_to_id ? loadChannelMessage(env, loaded.reply_to_id) : Promise.resolve(null),
    listAdminIds(env),
  ]);
  if (!conversation) throw new Error("channel missing");

  const senderIsAdmin = String(sender?.role || "").toLowerCase() === "admin";
  const preview = messagePreview(loaded);
  const senderLabel = loaded.kind === "system"
    ? "Macros and Mamas"
    : senderDisplayName(sender);
  const recipients = members.filter((member) => shouldNotifyMember({
    member,
    senderId: loaded.sender_id,
    senderIsAdmin,
    messageKind: loaded.kind,
    replyTo,
  }));
  const adminSet = new Set(adminIds);

  const pushSent = await sendChannelPushes(env, recipients, (member) => ({
    title: conversation.label || "Group chat",
    body: preview
      ? (loaded.kind === "system" ? preview : `${senderLabel}: ${preview}`)
      : `${senderLabel} posted in the group`,
    url: channelNotificationUrl(
      loaded.conversation_id,
      adminSet.has(member.user_id),
    ),
  }));

  await markChannelMessageNotified(env, messageId);
  return {
    route: "channel",
    conversationId: loaded.conversation_id,
    recipients: recipients.length,
    pushSent,
  };
}

async function sendChannelPushes(env, recipients, payloadFor) {
  const queue = [...recipients];
  let pushSent = 0;
  const workers = Array.from(
    { length: Math.min(CHANNEL_PUSH_CONCURRENCY, queue.length || 0) },
    async () => {
      while (queue.length) {
        const member = queue.shift();
        if (!member) break;
        pushSent += await sendPushToProfile(env, member.user_id, payloadFor(member));
      }
    },
  );
  await Promise.all(workers);
  return pushSent;
}

export function channelNotificationUrl(conversationId, isAdminRecipient) {
  const path = isAdminRecipient ? "/admin" : "/dashboard";
  return `${path}?tab=messages&channel=${encodeURIComponent(conversationId)}`;
}

function shouldNotifyMember({
  member,
  senderId,
  senderIsAdmin,
  messageKind,
  replyTo,
}) {
  if (!member?.user_id || member.removed_at) return false;
  if (senderId && member.user_id === senderId) return false;
  const level = String(member.notify_level || "highlights").toLowerCase();
  if (level === "mute") return false;
  if (level === "all") return true;
  if (level === "highlights") {
    return senderIsAdmin
      || String(messageKind || "") === "system"
      || (replyTo?.sender_id && replyTo.sender_id === member.user_id);
  }
  return false;
}

function messagePreview(msg) {
  const bodyPreview = String(msg.body || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (bodyPreview) return bodyPreview;
  if (msg.attachment_path) {
    const mime = String(msg.attachment_mime || "");
    if (mime.startsWith("image/")) return "Sent a photo";
    if (mime.startsWith("audio/")) return "Sent a voice memo";
    return "Sent an attachment";
  }
  return "";
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function senderDisplayName(profile) {
  if (!profile) return "Mama";
  const role = String(profile?.role || "").toLowerCase();
  const email = String(profile?.email || "").toLowerCase();
  const name = String(profile?.name || "").trim();
  if (role === "admin" && (/callie|calista/.test(name.toLowerCase()) || email.includes("calista@"))) {
    return "Callie";
  }
  return firstName(name) || (role === "admin" ? "Callie" : "Mama");
}

async function sendPushToProfile(env, profileId, payload) {
  if (!profileId) return 0;
  const result = await invokeEdgeFunction(env, "send-push", {
    profileId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  if (!result.ok) {
    throw new Error(`send-push edge failed (${result.status || "unknown"})`);
  }
  const sent = Number(result.data?.sent) || 0;
  const failures = Array.isArray(result.data?.failures) ? result.data.failures : [];
  const retryableFailure = failures.some((failure) => (
    ![404, 410].includes(Number(failure?.status))
  ));
  if (sent === 0 && retryableFailure) {
    throw new Error("push provider temporarily failed");
  }
  return sent;
}

async function loadChannelMessage(env, id) {
  const rows = await sbGet(
    env,
    `/rest/v1/conversation_messages?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] || null;
}

async function loadConversation(env, id) {
  const rows = await sbGet(
    env,
    `/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&select=id,type,cohort_label,label&limit=1`,
  );
  return rows[0] || null;
}

async function loadProfile(env, id) {
  if (!id) return null;
  const rows = await sbGet(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,name,email,role&limit=1`,
  );
  return rows[0] || null;
}

async function listConversationMembers(env, conversationId) {
  return sbGet(
    env,
    `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}`
      + "&removed_at=is.null&select=conversation_id,user_id,notify_level,removed_at",
  );
}

async function listAdminIds(env) {
  const rows = await sbGet(
    env,
    "/rest/v1/profiles?role=eq.admin&select=id",
  );
  return rows.map((row) => row.id).filter(Boolean);
}

async function markChannelMessageNotified(env, messageId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !messageId) throw new Error("missing notified configuration");
  const resp = await fetch(
    `${base}/rest/v1/conversation_messages?id=eq.${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    },
  );
  if (!resp.ok) {
    throw new Error(`mark channel notified failed (${resp.status})`);
  }
}

async function sbGet(env, path) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`supabase get failed (${resp.status}): ${detail.slice(0, 120)}`);
  }
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("supabase source payload invalid");
  return rows;
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base) return null;
  const resp = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!resp.ok) return null;
  return resp.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
