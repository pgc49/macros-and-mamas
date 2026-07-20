/* ==================================================================
   /functions/api/macros-approved.js — email #5 after Callie approves
   ==================================================================
   Admin-only. Body: { clientId }
   Approves if not already, then sends "Your ranges are ready".
   ================================================================== */

import { loadUserContact, sendApprovedEmail } from "../_shared/supabaseEmail.js";

export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireUser(request, env);
    if (!admin) return json({ error: "unauthorized" }, 401);

    const isAdmin = await checkAdmin(env, admin.id);
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const clientId = body.clientId;
    if (!clientId) return json({ error: "missing clientId" }, 400);

    // Ensure approved in DB (idempotent)
    await approveClient(env, clientId);

    const contact = await loadUserContact(env, clientId);
    await sendApprovedEmail(env, {
      email: contact.email,
      name: contact.name || contact.profile?.name,
      userId: clientId,
    });

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("macros-approved failed", e);
    return json({ error: "approve notify failed" }, 500);
  }
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) return null;

  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function checkAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

async function approveClient(env, clientId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing supabase config");

  const mResp = await fetch(
    `${base}/rest/v1/macros?profile_id=eq.${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({ approved: true }),
    }
  );
  if (!mResp.ok) {
    const detail = await mResp.text();
    throw new Error(`macros approve failed: ${mResp.status} ${detail}`);
  }

  const pResp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "active", week: 1 }),
    }
  );
  if (!pResp.ok) {
    const detail = await pResp.text();
    throw new Error(`profile activate failed: ${pResp.status} ${detail}`);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
