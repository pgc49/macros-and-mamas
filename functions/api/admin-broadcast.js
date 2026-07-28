/* ==================================================================
   /functions/api/admin-broadcast.js
   Admin-only: post a Callie announcement into each mama's Messages
   thread and push (email fallback when no push subscription).
   Body: { body, audience?: "active" | "all_mamas" }
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const payload = await request.json().catch(() => ({}));
    const text = String(payload.body || "").trim().slice(0, 2000);
    const audience = String(payload.audience || "active").toLowerCase() === "all_mamas"
      ? "all_mamas"
      : "active";
    if (text.length < 1) return json({ error: "body required" }, 400);

    const recipients = await listMamaIds(env, audience);
    if (!recipients.length) {
      return json({ ok: true, recipients: 0, messages: 0, pushSent: 0, emailSent: 0 });
    }

    const preview = text.replace(/\s+/g, " ").trim().slice(0, 140);
    let messages = 0;
    let pushSent = 0;
    let emailSent = 0;

    // Insert one announcement per mama thread (service role — same as 1:1).
    for (const clientId of recipients) {
      const row = await insertAnnouncement(env, {
        clientId,
        senderId: user.id,
        body: text,
      });
      if (!row?.id) continue;
      messages += 1;

      const unreadCount = await countUnreadForMama(env, clientId);
      const n = await sendPushToProfile(env, clientId, {
        title: "Message from Callie",
        body: preview || "Open Messages in the app",
        url: "/dashboard?tab=messages",
        unreadCount: unreadCount || 1,
      });
      pushSent += n;
      if (n > 0) continue;

      const contact = await loadUserContact(env, clientId);
      const email = contact.email || "";
      if (!email) continue;
      const mail = await invokeEdgeFunction(env, "message-email", {
        email,
        name: contact.name || "Mama",
        preview: preview || "Callie posted an update in Messages.",
      });
      if (mail.ok) {
        emailSent += 1;
        await logEmailEvent(env, {
          profileId: clientId,
          emailType: "message",
          toEmail: email,
          meta: { messageId: row.id, announcement: true },
        });
      }
    }

    return json({
      ok: true,
      audience,
      recipients: recipients.length,
      messages,
      pushSent,
      emailSent,
    });
  } catch (e) {
    console.error("admin-broadcast failed", e);
    return json({ error: "broadcast failed" }, 500);
  }
}

async function listMamaIds(env, audience) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  // Active cohort by default; all_mamas = any non-admin non-refunded profile.
  const select = audience === "all_mamas"
    ? "id,role,status,refunded"
    : "id,role,status,refunded";
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=${select}&role=neq.admin`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  return (rows || [])
    .filter((r) => {
      if (String(r.role || "").toLowerCase() === "admin") return false;
      if (r.refunded) return false;
      if (audience === "active") return String(r.status || "") === "active";
      return true;
    })
    .map((r) => r.id)
    .filter(Boolean);
}

async function insertAnnouncement(env, { clientId, senderId, body }) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(`${base}/rest/v1/messages`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      client_id: clientId,
      sender_id: senderId,
      body,
      kind: "announcement",
    }),
  });
  if (!resp.ok) {
    console.error("insert announcement failed", resp.status, await resp.text().catch(() => ""));
    return null;
  }
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
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

async function countUnreadForMama(env, profileId) {
  if (!profileId) return 0;
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const qs = `select=id&client_id=eq.${encodeURIComponent(profileId)}&read_at=is.null&deleted_at=is.null&sender_id=neq.${encodeURIComponent(profileId)}`;
  try {
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
    console.warn("countUnreadForMama failed", e);
    return 0;
  }
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
