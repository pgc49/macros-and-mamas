/* ==================================================================
   /functions/api/channel-members.js
   First-name labels for channel message senders.
   Auth required; requester must be an active member or admin.
   ================================================================== */

import { isUuid } from "../_shared/credits.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const conversationId = String(body.conversationId || "").trim();
    const userIds = Array.isArray(body.userIds)
      ? [...new Set(body.userIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!conversationId || !isUuid(conversationId)) {
      return json({ error: "conversationId required" }, 400);
    }
    if (!userIds.length) return json({ ok: true, labels: {} });
    if (userIds.length > 100) return json({ error: "too many userIds" }, 400);
    if (userIds.some((id) => !isUuid(id))) return json({ error: "invalid userIds" }, 400);

    const requester = await loadProfile(env, user.id);
    const requesterIsAdmin = String(requester?.role || "").toLowerCase() === "admin";
    if (!requesterIsAdmin && !(await isActiveMember(env, conversationId, user.id))) {
      return json({ error: "forbidden" }, 403);
    }

    const allowedSenderIds = await listConversationSenderIds(env, conversationId, userIds.slice(0, 100));
    const profiles = await listProfiles(env, allowedSenderIds);
    const labels = {};
    for (const profile of profiles) {
      if (!profile?.id) continue;
      labels[profile.id] = senderDisplayName(profile);
    }
    return json({ ok: true, labels });
  } catch (e) {
    console.error("channel-members failed", e);
    return json({ error: "channel members failed" }, 500);
  }
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function senderDisplayName(profile) {
  const role = String(profile?.role || "").toLowerCase();
  const email = String(profile?.email || "").toLowerCase();
  const name = String(profile?.name || "").trim();
  if (role === "admin" && (/callie|calista/.test(name.toLowerCase()) || email.includes("calista@"))) {
    return "Callie";
  }
  return firstName(name) || (role === "admin" ? "Callie" : "Mama");
}

async function isActiveMember(env, conversationId, userId) {
  const rows = await sbGet(
    env,
    `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}`
      + `&user_id=eq.${encodeURIComponent(userId)}&removed_at=is.null&select=user_id&limit=1`,
  );
  return rows.length > 0;
}

async function loadProfile(env, id) {
  if (!id) return null;
  const rows = await sbGet(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,name,email,role&limit=1`,
  );
  return rows[0] || null;
}

async function listProfiles(env, ids) {
  if (!ids.length) return [];
  const list = ids.map(encodeURIComponent).join(",");
  return sbGet(
    env,
    `/rest/v1/profiles?id=in.(${list})&select=id,name,email,role`,
  );
}

async function listConversationSenderIds(env, conversationId, ids) {
  if (!conversationId || !ids.length) return [];
  const requested = new Set(ids);
  const list = ids.map(encodeURIComponent).join(",");
  const rows = await sbGet(
    env,
    `/rest/v1/conversation_messages?conversation_id=eq.${encodeURIComponent(conversationId)}`
      + `&sender_id=in.(${list})&select=sender_id`,
  );
  return [...new Set((rows || [])
    .map((row) => row.sender_id)
    .filter((id) => id && requested.has(id)))];
}

async function sbGet(env, path) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    console.warn("supabase get failed", resp.status, await resp.text().catch(() => ""));
    return [];
  }
  return (await resp.json().catch(() => [])) || [];
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
