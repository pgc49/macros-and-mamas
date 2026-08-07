/* ==================================================================
   /functions/api/checkout-quote.js — Which price this user would pay
   ==================================================================
   GET with Authorization: Bearer <user jwt>
   Returns { tier, amount, label } or 403 enrollment closed.
   ================================================================== */

import { resolveCheckoutOffer } from "../_shared/pricing.js";

export async function onRequestGet({ request, env }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const profile = await fetchProfile(env, user.id, authHeader);
    if (profile?.refunded) {
      return json({ error: "enrollment refunded" }, 403);
    }
    if (profile?.paid) {
      return json({ error: "already paid" }, 409);
    }

    const offer = await resolveCheckoutOffer(env, {
      email: user.email,
      createdAt: user.created_at || profile?.created_at,
    });
    if (!offer.ok) {
      return json({ error: offer.error }, offer.status || 403);
    }

    return json({
      tier: offer.tier,
      amount: offer.amount,
      label: offer.label,
    }, 200);
  } catch (e) {
    console.error("checkout-quote failed", e);
    return json({ error: "quote failed" }, 500);
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

async function fetchProfile(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const service = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !userId) return null;

  const apikey = service || anon;
  const authorization = service ? `Bearer ${service}` : authHeader;
  if (!apikey || !authorization) return null;

  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,created_at`,
    { headers: { apikey, authorization } }
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
