/* ==================================================================
   /functions/api/referrals.js — mama Share screen payload
   ==================================================================
   GET → ensure code + tally (friends enrolled, available/pending credits)
   Auth: Bearer Supabase JWT; paid clients (or admin)
   ================================================================== */

import { buildSharePayload } from "../_shared/referrals.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const profile = await fetchProfile(env, user.id);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);
    if (!profile.paid && profile.role !== "admin") {
      return json({ error: "not enrolled" }, 403);
    }

    // Client payload: no referred_email list (PII minimization).
    const payload = await buildSharePayload(env, user.id, {
      ensureCode: true,
      includeReferralDetails: false,
    });
    return json(payload, 200);
  } catch (e) {
    console.error("referrals get failed", e);
    return json({ error: "referrals unavailable" }, 500);
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

async function fetchProfile(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,paid,refunded`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
