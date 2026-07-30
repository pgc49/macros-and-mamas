/* ==================================================================
   /functions/api/admin-voice-drop.js
   Admin-only: publish a Monday voice drop (single Storage object).
   Does NOT fan out into Messages — Today banner PSA only.
   Body JSON: {
     caption?, audience?: "admins"|"active"|"all_mamas",
     audioPath, audioMime, audioBytes?, durationMs?,
     notify?: boolean  // push/email to audience (default false)
   }
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";

const AUDIENCES = new Set(["admins", "active", "all_mamas"]);
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const payload = await request.json().catch(() => ({}));
    const caption = String(payload.caption || "").trim().slice(0, 500);
    const audience = AUDIENCES.has(String(payload.audience || "").toLowerCase())
      ? String(payload.audience).toLowerCase()
      : "admins";
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

    await supersedeOpenDrops(env);

    const row = await insertVoiceDrop(env, {
      createdBy: user.id,
      caption,
      audioPath,
      audioMime,
      audioBytes,
      durationMs,
      audience,
      publishedAt: publishedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    if (!row?.id) return json({ error: "insert failed" }, 500);

    let pushSent = 0;
    let emailSent = 0;
    let recipients = 0;

    if (notify) {
      const ids = await listNotifyIds(env, audience);
      recipients = ids.length;
      const preview = caption
        ? caption.replace(/\s+/g, " ").trim().slice(0, 140)
        : "Monday voice drop from Callie — open Today to listen.";

      for (const profileId of ids) {
        const n = await sendPushToProfile(env, profileId, {
          title: "Callie",
          body: preview,
          url: "/dashboard?tab=today",
          unreadCount: 1,
        });
        pushSent += n;
        if (n > 0) continue;

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
            meta: { voiceDropId: row.id, voiceDrop: true },
          });
        }
      }
    }

    return json({
      ok: true,
      drop: row,
      audience,
      notify,
      recipients,
      pushSent,
      emailSent,
    });
  } catch (e) {
    console.error("admin-voice-drop failed", e);
    return json({ error: "voice drop failed" }, 500);
  }
}

async function supersedeOpenDrops(env) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const now = new Date().toISOString();
  await fetch(
    `${base}/rest/v1/voice_drops?status=eq.published`,
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

async function listNotifyIds(env, audience) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,role,status,refunded`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  return (rows || [])
    .filter((r) => {
      if (r.refunded) return false;
      const role = String(r.role || "").toLowerCase();
      if (audience === "admins") return role === "admin";
      if (role === "admin") return false;
      if (audience === "active") return String(r.status || "") === "active";
      return true; // all_mamas
    })
    .map((r) => r.id)
    .filter(Boolean);
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
