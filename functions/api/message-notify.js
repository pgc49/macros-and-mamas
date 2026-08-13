/* ==================================================================
   /functions/api/message-notify.js
   After a message insert: web push to the correct recipient only.
   Auth required (sender).

   Routing (tight — no cross-thread / no extra-admin fanout):
   - Mama → Callie: push ONLY (Callie already gets web push; no duplicate
     email). Never other admins (e.g. Tech Guy).
   - Callie/admin → mama: push, with email fallback ONLY that mama
     (client_id) when she has no push subscription.
   - Admin ↔ admin test DM: push/email ONLY the other admin(s) in that
     thread (never the sender; never mamas).
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";
import { isUuid } from "../_shared/credits.js";
import {
  authorizeCron,
  claimNotificationJob,
  finishNotificationJob,
} from "../_shared/messageOutbox.js";

const DEFAULT_CALLIE_EMAIL = "calista@nourishwithcalista.com";

export async function onRequestPost({ request, env }) {
  let job = null;
  try {
    const cronAuth = authorizeCron(request, env);
    const user = cronAuth ? null : await requireUser(request, env);
    if (!cronAuth && !user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const messageId = String(body.messageId || "").trim();
    if (!messageId || !isUuid(messageId)) return json({ error: "messageId required" }, 400);

    let msg;
    if (cronAuth) {
      job = await claimNotificationJob(env, "dm", messageId);
      if (!job) {
        return json({ ok: true, skipped: "queued_or_already_processed", pushSent: 0, emailSent: false });
      }
      msg = await loadMessage(env, messageId);
      if (!msg) {
        await finishNotificationJob(env, job, { success: true });
        return json({ ok: true, skipped: "source_missing", pushSent: 0, emailSent: false });
      }
    } else {
      msg = await loadMessage(env, messageId);
      if (!msg) return json({ error: "not found" }, 404);
      // Only the sender may notify — blocks admin re-notify spam loops.
      if (msg.sender_id !== user.id) {
        return json({ error: "forbidden" }, 403);
      }
      job = await claimNotificationJob(env, "dm", messageId);
    }
    if (!job) {
      return json({ ok: true, skipped: "queued_or_already_processed", pushSent: 0, emailSent: false });
    }

    // Never notify on soft-deleted / empty identity rows.
    if (msg.deleted_at) {
      await finishNotificationJob(env, job, { success: true });
      return json({ ok: true, skipped: "deleted", pushSent: 0, emailSent: false });
    }
    // Idempotent — one notify per message (survives client retries).
    if (msg.notified_at) {
      await finishNotificationJob(env, job, { success: true });
      return json({ ok: true, skipped: "already_notified", pushSent: 0, emailSent: false });
    }

    const sender = await loadProfile(env, msg.sender_id);
    const client = await loadProfile(env, msg.client_id);
    if (!sender || !client) throw new Error("profile missing");

    const senderIsAdmin = String(sender.role || "").toLowerCase() === "admin";
    const clientIsAdmin = String(client.role || "").toLowerCase() === "admin";
    const preview = messagePreview(msg);

    let pushSent = 0;
    let emailSent = false;
    let route = "unknown";

    if (!senderIsAdmin && !clientIsAdmin) {
      // Mama → Callie (thread owned by mama). Push only — no ops email.
      route = "mama_to_callie";
      const coachIds = await listCallieAdminIds(env);
      if (!coachIds.length) throw new Error("no Callie notification recipient configured");
      for (const coachId of coachIds) {
        if (coachId === msg.sender_id) continue;
        const unreadCount = await countUnreadForProfile(env, coachId, { asAdmin: true });
        pushSent += await sendPushToProfile(env, coachId, {
          title: firstName(client.name) || "Mama",
          body: preview || "Open Messages in admin",
          url: `/admin?tab=messages&client=${encodeURIComponent(msg.client_id)}`,
          unreadCount: unreadCount || 1,
        });
      }
    } else if (senderIsAdmin && !clientIsAdmin) {
      // Coach/admin → that mama only (never other admins, never other mamas).
      route = "admin_to_mama";
      if (msg.client_id !== msg.sender_id) {
        const unreadCount = await countUnreadForProfile(env, msg.client_id, { asAdmin: false });
        pushSent = await sendPushToProfile(env, msg.client_id, {
          title: "Callie",
          body: preview || "Open Messages in the app",
          url: "/dashboard?tab=messages",
          unreadCount: unreadCount || 1,
        });
        if (pushSent === 0) {
          const contact = await loadUserContact(env, msg.client_id, { strict: true });
          const email = contact.email || client.email || "";
          if (email) {
            const mail = await invokeEdgeFunction(env, "message-email", {
              email,
              name: contact.name || client.name || "Mama",
              preview,
            });
            if (mail.ok) {
              emailSent = true;
              await logEmailEvent(env, {
                profileId: msg.client_id,
                emailType: "message",
                toEmail: email,
                meta: { messageId, route },
              });
            } else {
              emailSent = await sendMamaEmailDirect(env, {
                email,
                name: contact.name || client.name || "Mama",
                preview,
              });
              if (emailSent) {
                await logEmailEvent(env, {
                  profileId: msg.client_id,
                  emailType: "message",
                  toEmail: email,
                  meta: { messageId, route, via: "resend-direct" },
                });
              }
            }
            if (!emailSent) throw new Error("mama email delivery failed");
          }
        }
      }
    } else if (senderIsAdmin && clientIsAdmin) {
      // Admin ↔ admin DM: only the other party in THIS thread (never every admin).
      route = "admin_to_admin";
      const recipients = await adminDmRecipients(env, msg);
      if (!recipients.length) throw new Error("admin DM recipient missing");
      for (const adminId of recipients) {
        const unreadCount = await countUnreadForProfile(env, adminId, { asAdmin: true });
        const n = await sendPushToProfile(env, adminId, {
          title: firstName(sender.name) || "Admin",
          body: preview || "Open Messages in admin",
          url: "/admin?tab=messages",
          unreadCount: unreadCount || 1,
        });
        pushSent += n;
        if (n > 0) continue;
        const contact = await loadUserContact(env, adminId, { strict: true });
        const email = contact.email || "";
        if (!email) continue;
        let delivered = false;
        const mail = await invokeEdgeFunction(env, "message-email", {
          email,
          name: contact.name || "Admin",
          preview,
        });
        if (mail.ok) delivered = true;
        else if (await sendMamaEmailDirect(env, {
          email,
          name: contact.name || "Admin",
          preview,
        })) {
          delivered = true;
        }
        if (!delivered) throw new Error("admin email delivery failed");
        emailSent = true;
      }
    } else {
      // Mama should never own an admin-as-client_id thread; ignore safely.
      route = "ignored";
    }

    await markMessageNotified(env, messageId);
    await finishNotificationJob(env, job, { success: true });
    return json({ ok: true, route, pushSent, emailSent });
  } catch (e) {
    console.error("message-notify failed", e);
    if (job) {
      try {
        await finishNotificationJob(env, job, {
          success: false,
          error: e?.message || e,
        });
      } catch (finishErr) {
        console.error("message outbox retry scheduling failed", finishErr);
      }
    }
    return json({ error: "notify failed" }, 500);
  }
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

function callieNotifyEmails(env) {
  return [env.CALLIE_NOTIFY_EMAIL || DEFAULT_CALLIE_EMAIL]
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Coach inbox recipients for mama→Callie — Callie only, never Tech Guy. */
async function listCallieAdminIds(env) {
  const emails = callieNotifyEmails(env);
  const admins = await listAdminProfiles(env);
  const matched = admins.filter((a) => emails.includes(String(a.email || "").toLowerCase()));
  if (matched.length) return matched.map((a) => a.id);
  // Fail closed: if emails don't match any admin, push nobody.
  console.warn("listCallieAdminIds: no admin matched CALLIE_NOTIFY_EMAIL", emails);
  return [];
}

async function sendPushToProfile(env, profileId, payload) {
  if (!profileId) return 0;
  const result = await invokeEdgeFunction(env, "send-push", {
    profileId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    unreadCount: payload.unreadCount,
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

/**
 * Unread waiting for this profile.
 * Mama: any inbound in her thread.
 * Admin: mama→coach only (plus admin↔admin DMs) — never another admin’s
 * unreplied outbound sitting in a mama thread.
 */
async function countUnreadForProfile(env, profileId, { asAdmin }) {
  if (!profileId) return 0;
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (asAdmin) {
      const qs = "select=sender_id,client_id,recipient_id"
        + "&read_at=is.null&deleted_at=is.null"
        + `&sender_id=neq.${encodeURIComponent(profileId)}`;
      const adminIds = await listAdminIds(env);
      const adminSet = new Set(adminIds);
      const resp = await fetch(`${base}/rest/v1/messages?${qs}`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!resp.ok) throw new Error(`admin unread lookup failed (${resp.status})`);
      const rows = await resp.json();
      if (!Array.isArray(rows)) throw new Error("admin unread payload invalid");
      return rows.filter((row) => (
        adminSet.has(row.client_id)
          ? row.recipient_id === profileId
          : !adminSet.has(row.sender_id)
      )).length;
    }

    const qs = "select=id&read_at=is.null&deleted_at=is.null"
      + `&sender_id=neq.${encodeURIComponent(profileId)}`
      + `&client_id=eq.${encodeURIComponent(profileId)}`;
    const resp = await fetch(`${base}/rest/v1/messages?${qs}`, {
      method: "HEAD",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    const range = resp.headers.get("content-range") || "";
    const m = range.match(/\/(\d+)\s*$/);
    return m ? Math.max(0, Number(m[1]) || 0) : 0;
  } catch (e) {
    console.warn("countUnreadForProfile failed", e);
    return 0;
  }
}

async function sendMamaEmailDirect(env, { email, name, preview }) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key || !email) return false;
  const first = firstName(name) || "Mama";
  const snippet = String(preview || "").trim().slice(0, 160);
  const appUrl = String(env.APP_URL || "https://www.macrosandmamas.com").replace(/\/$/, "");
  const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#33272E">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Callie left you a message in Macros and Mamas.</p>
    ${snippet ? `<p><i>${escapeHtml(snippet)}</i></p>` : ""}
    <p><a href="${appUrl}/dashboard?tab=messages">Open Messages</a></p>
  </body></html>`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Callie · Macros and Mamas <calista@nourishwithcalista.com>",
      to: [email],
      subject: "Callie sent you a message",
      html,
    }),
  });
  if (!resp.ok) {
    console.error("resend mama email failed", resp.status, await resp.text().catch(() => ""));
    return false;
  }
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMessage(env, id) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/messages?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    throw new Error(`message source lookup failed (${resp.status})`);
  }
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("message source payload invalid");
  return rows[0] || null;
}

async function markMessageNotified(env, messageId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !messageId) return;
  try {
    const resp = await fetch(`${base}/rest/v1/messages?id=eq.${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
    if (!resp.ok) throw new Error(`mark notified failed (${resp.status})`);
  } catch (e) {
    console.warn("markMessageNotified failed", e);
    throw e;
  }
}

/** Peer for Patrick↔Callie DMs — never fan out to every admin. */
async function adminDmRecipients(env, msg) {
  if (msg.recipient_id && msg.recipient_id !== msg.sender_id) {
    return [msg.recipient_id];
  }
  if (msg.client_id && msg.client_id !== msg.sender_id) {
    return [msg.client_id];
  }
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const resp = await fetch(
      `${base}/rest/v1/messages?client_id=eq.${encodeURIComponent(msg.client_id)}`
      + `&sender_id=neq.${encodeURIComponent(msg.sender_id)}`
      + `&select=sender_id&limit=1`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    );
    if (resp.ok) {
      const rows = await resp.json().catch(() => []);
      if (rows[0]?.sender_id) return [rows[0].sender_id];
    }
  } catch (e) {
    console.warn("adminDmRecipients lookup failed", e);
  }
  // Brand-new thread owned by sender: notify Callie coach admins only.
  return (await listCallieAdminIds(env)).filter((id) => id !== msg.sender_id);
}

async function loadProfile(env, id) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,name,email,role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function listAdminProfiles(env) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?role=eq.admin&select=id,name,email,role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return [];
  return (await resp.json().catch(() => [])) || [];
}

async function listAdminIds(env) {
  return (await listAdminProfiles(env)).map((r) => r.id).filter(Boolean);
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
