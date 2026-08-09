/* ==================================================================
   /functions/api/admin-referrals.js — backfill / inspect referral codes
   ==================================================================
   POST { action: "backfill" } → create codes + Stripe promos for active paid
   GET ?userId= → code + referrals for one mama
   ================================================================== */

import {
  backfillReferralCodes,
  buildSharePayload,
  ensureReferralCode,
} from "../_shared/referrals.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const url = new URL(request.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (!userId) return json({ error: "userId required" }, 400);

    const payload = await buildSharePayload(env, userId);
    return json(payload, 200);
  } catch (e) {
    console.error("admin-referrals get failed", e);
    return json({ error: "admin referrals unavailable" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "backfill") {
      const stats = await backfillReferralCodes(env);
      return json({ ok: true, ...stats }, 200);
    }

    if (action === "ensure") {
      const userId = String(body.userId || "").trim();
      const name = String(body.name || "").trim();
      if (!userId) return json({ error: "userId required" }, 400);
      const row = await ensureReferralCode(env, { userId, name });
      return json({ ok: true, row }, 200);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("admin-referrals post failed", e);
    return json({ error: e?.message || "admin referrals failed" }, 500);
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
