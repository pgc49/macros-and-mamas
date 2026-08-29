/* ==================================================================
   /functions/api/admin-voice-drop.js
   Admin-only: publish a Monday voice drop (single Storage object).
   Does NOT fan out into Messages — Today banner PSA only.

   Body JSON (publish): {
     caption?, audience?: "admins"|"active"|"all_mamas",
     cohortLabel?,  // required for audience=active so Founding PSAs skip C2
     audioPath, audioMime, audioBytes?, durationMs?,
     notify?: boolean  // push/email to audience (default false)
   }

   Body JSON (finish/retry notify for an already-live drop): {
     resendNotify: true, dropId
   }

   Designed for ~40+ recipients on Cloudflare Pages:
   - insert/publish returns immediately
   - notify runs in waitUntil (never fails the publish after the row exists)
   - small concurrency so fan-out finishes under subrequest/time limits
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";
import { filterVoiceDropNotifyRows, voiceDropSupersedeQuery } from "../_shared/voiceDropAudience.js";

const AUDIENCES = new Set(["admins", "active", "all_mamas"]);
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const payload = await request.json().catch(() => ({}));

    if (payload.resendNotify === true) {
      return resendNotify({ env, waitUntil, payload });
    }

    const caption = String(payload.caption || "").trim().slice(0, 500);
    const audience = AUDIENCES.has(String(payload.audience || "").toLowerCase())
      ? String(payload.audience).toLowerCase()
      : "active";
    const cohortLabel = String(payload.cohortLabel || payload.cohort_label || "").trim().slice(0, 40);
    const audioPath = String(payload.audioPath || "").trim().slice(0, 500);
    const audioMime = String(payload.audioMime || "").toLowerCase().split(";")[0].trim();
    const audioBytes = Number(payload.audioBytes) || null;
    const durationMs = Number(payload.durationMs) || null;
    const notify = payload.notify === true;

    if (!audioPath || audioPath.includes("..")) {
      return json({ error: "audioPath required" }, 400);
    }
    if (!audioMime.startsWith("audio/")) {
      return json({ error: "audioMime must be audio/*" }, 400);
    }

    const publishedAt = new Date();
    const expiresAt = new Date(publishedAt.getTime() + TTL_MS);

    await supersedeOpenDrops(env, { audience, cohortLabel });

    const row = await insertVoiceDrop(env, {
      createdBy: user.id,
      caption,
      audioPath,
      audioMime,
      audioBytes,
      durationMs,
      audience,
      cohortLabel,
      publishedAt: publishedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    if (!row?.id) return json({ error: "insert failed" }, 500);

    if (!notify) {
      return json({
        ok: true,
        drop: row,
        audience,
        notify: false,
        recipients: 0,
        pushSent: 0,
        emailSent: 0,
      });
    }

    const ids = await listNotifyIds(env, audience, cohortLabel);
    const preview = caption
      ? caption.replace(/\s+/g, " ").trim().slice(0, 140)
      : "Monday voice drop from Callie — open Today to listen.";
    const notifyPromise = notifyRecipients(env, {
      ids,
      preview,
      dropId: row.id,
      skipEmailedProfileIds: new Set(),
    });

    if (typeof waitUntil === "function") {
      waitUntil(notifyPromise.catch((e) => console.error("voice-drop notify failed", e)));
      return json({
        ok: true,
        drop: row,
        audience,
        notify: true,
        recipients: ids.length,
        pushSent: null,
        emailSent: null,
        notifying: true,
      });
    }

    const { pushSent, emailSent } = await notifyPromise;
    return json({
      ok: true,
      drop: row,
      audience,
      notify: true,
      recipients: ids.length,
      pushSent,
      emailSent,
    });
  } catch (e) {
    console.error("admin-voice-drop failed", e);
    return json({
      error: "voice drop failed",
      detail: String(e?.message || e).slice(0, 240),
    }, 500);
  }
}

async function resendNotify({ env, waitUntil, payload }) {
  const dropId = String(payload.dropId || "").trim();
  if (!dropId) return json({ error: "dropId required" }, 400);

  const drop = await loadVoiceDrop(env, dropId);
  if (!drop?.id) return json({ error: "drop not found" }, 404);
  if (drop.status !== "published") {
    return json({ error: "Only a live published drop can resend notifications." }, 400);
  }
  if (new Date(drop.expires_at).getTime() <= Date.now()) {
    return json({ error: "This drop has expired." }, 400);
  }

  const audience = AUDIENCES.has(String(drop.audience || "").toLowerCase())
    ? String(drop.audience).toLowerCase()
    : "active";
  const cohortLabel = String(drop.cohort_label || "").trim();
  const ids = await listNotifyIds(env, audience, cohortLabel);
  const alreadyEmailed = await emailedProfileIdsForDrop(env, drop.id);
  const preview = String(drop.caption || "").trim()
    ? String(drop.caption).replace(/\s+/g, " ").trim().slice(0, 140)
    : "Monday voice drop from Callie — open Today to listen.";

  const notifyPromise = notifyRecipients(env, {
    ids,
    preview,
    dropId: drop.id,
    skipEmailedProfileIds: alreadyEmailed,
  });

  if (typeof waitUntil === "function") {
    waitUntil(notifyPromise.catch((e) => console.error("voice-drop resend notify failed", e)));
    return json({
      ok: true,
      drop,
      audience,
      notify: true,
      recipients: ids.length,
      alreadyEmailed: alreadyEmailed.size,
      pushSent: null,
      emailSent: null,
      notifying: true,
      resent: true,
    });
  }

  const { pushSent, emailSent } = await notifyPromise;
  return json({
    ok: true,
    drop,
    audience,
    notify: true,
    recipients: ids.length,
    alreadyEmailed: alreadyEmailed.size,
    pushSent,
    emailSent,
    resent: true,
  });
}

async function notifyRecipients(env, {
  ids,
  preview,
  dropId,
  skipEmailedProfileIds = new Set(),
}) {
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
    let pushSent = 0;
    let emailSent = 0;
    while (queue.length) {
      const profileId = queue.shift();
      if (!profileId) continue;
      try {
        const n = await sendPushToProfile(env, profileId, {
          title: "Callie",
          body: preview,
          url: "/dashboard?tab=today",
          unreadCount: 1,
        });
        pushSent += n;
        if (n > 0) continue;
        if (skipEmailedProfileIds.has(profileId)) continue;

        const contact = await loadUserContact(env, profileId);
        const email = contact.email || "";
        if (!email) continue;
        const mail = await invokeEdgeFunction(env, "message-email", {
          email,
          name: contact.name || "Mama",
          preview,
        });
        if (mail.ok) {
          emailSent += 1;
          await logEmailEvent(env, {
            profileId,
            emailType: "message",
            toEmail: email,
            meta: { voiceDropId: dropId, voiceDrop: true },
          });
        }
      } catch (e) {
        console.warn("voice-drop notify one failed", profileId, e);
      }
    }
    return { pushSent, emailSent };
  });
  const parts = await Promise.all(workers);
  return parts.reduce(
    (acc, p) => ({ pushSent: acc.pushSent + p.pushSent, emailSent: acc.emailSent + p.emailSent }),
    { pushSent: 0, emailSent: 0 },
  );
}

async function supersedeOpenDrops(env, { audience, cohortLabel } = {}) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const now = new Date().toISOString();
  const filters = voiceDropSupersedeQuery({ audience, cohortLabel });
  // Missing cohort on an active publish must not take down the other group's drop.
  if (!filters) return;
  const params = new URLSearchParams(filters);
  await fetch(
    `${base}/rest/v1/voice_drops?${params.toString()}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "superseded", expires_at: now }),
    },
  );
}

async function insertVoiceDrop(env, row) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(`${base}/rest/v1/voice_drops`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      created_by: row.createdBy,
      caption: row.caption,
      audio_path: row.audioPath,
      audio_mime: row.audioMime,
      audio_bytes: row.audioBytes,
      duration_ms: row.durationMs,
      audience: row.audience,
      cohort_label: row.cohortLabel || null,
      status: "published",
      published_at: row.publishedAt,
      expires_at: row.expiresAt,
    }),
  });
  if (!resp.ok) {
    console.error("insert voice_drops failed", resp.status, await resp.text().catch(() => ""));
    return null;
  }
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function loadVoiceDrop(env, dropId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/voice_drops?id=eq.${encodeURIComponent(dropId)}&select=id,caption,audience,cohort_label,status,published_at,expires_at,audio_path`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function emailedProfileIdsForDrop(env, dropId) {
  const out = new Set();
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  // Filter JSON meta in app code — PostgREST JSON path filters vary by project config.
  const resp = await fetch(
    `${base}/rest/v1/email_events?select=profile_id,meta&email_type=eq.message&order=created_at.desc&limit=500`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return out;
  const rows = await resp.json().catch(() => []);
  for (const row of rows || []) {
    if (row?.meta?.voiceDropId === dropId && row.profile_id) {
      out.add(row.profile_id);
    }
  }
  return out;
}

async function listNotifyIds(env, audience, cohortLabel) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,role,status,refunded,cohort_label`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("listNotifyIds failed", resp.status, await resp.text().catch(() => ""));
    return [];
  }
  const rows = await resp.json().catch(() => []);
  return filterVoiceDropNotifyRows(rows, { audience, cohortLabel });
}

async function sendPushToProfile(env, profileId, payload) {
  const result = await invokeEdgeFunction(env, "send-push", {
    profileId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    unreadCount: payload.unreadCount,
  });
  if (!result.ok) {
    console.warn("send-push edge failed", result);
    return 0;
  }
  return Number(result.data?.sent) || 0;
}

async function isAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
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
