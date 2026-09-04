/* ==================================================================
   /functions/_shared/clientAiAccess.js — auth, enrollment and cost caps
   ==================================================================
   The same four things every client-facing AI endpoint has to do before
   it spends a token: prove who she is, prove she's paid, load the profile
   the prompt is built from, and stop her running up a bill.

   Written for /api/coach. The older endpoints each carry their own copy;
   this is where they should converge.
   ================================================================== */

export async function requireSupabaseUser(request, env) {
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

export async function fetchEnrollment(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon || !userId || !authHeader) return null;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,role`,
    { headers: { apikey: anon, authorization: authHeader } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

/** Everything the prompt needs about her, and the ranges Callie approved. */
export async function loadSelf(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon) throw new Error("missing supabase config");

  const [pResp, mResp] = await Promise.all([
    fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: { apikey: anon, authorization: authHeader },
    }),
    fetch(`${base}/rest/v1/macros?profile_id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: { apikey: anon, authorization: authHeader },
    }),
  ]);

  const profiles = await pResp.json().catch(() => []);
  const macrosRows = await mResp.json().catch(() => []);
  const row = profiles[0];
  if (!row) return { profile: null, macros: null };

  const m = macrosRows[0];
  return {
    profile: {
      name: row.name,
      diet: row.diet,
      prefB: row.pref_b,
      prefL: row.pref_l,
      prefD: row.pref_d,
      prefS: row.pref_s,
      seasonNote: row.season_note,
      allergens: Array.isArray(row.allergens) ? row.allergens : [],
      allergenNote: row.allergen_note || "",
      foodAvoids: row.food_avoids || "",
    },
    macros: m
      ? { cal: Number(m.cal), protein: Number(m.protein), carbs: Number(m.carbs), fat: Number(m.fat) }
      : null,
  };
}

/**
 * Rolling 24h cap on model calls, counted in estimate_calls.
 *
 * A failure to read the counter refuses the call rather than waving it
 * through: an outage that silently uncaps spending is worse than an
 * outage that tells her to try again in a minute.
 */
export async function checkAiLimit(env, userId, { type, max, busyMessage, spentMessage }) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error(`${type} rate limit missing service role`);
    return { ok: false, message: busyMessage, retryAfterSeconds: 60 };
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = `${base}/rest/v1/estimate_calls?profile_id=eq.${encodeURIComponent(userId)}`
    + `&type=eq.${encodeURIComponent(type)}&created_at=gte.${encodeURIComponent(dayAgo)}&select=id`;
  const resp = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "count=exact",
      "range-unit": "items",
      range: "0-0",
    },
  });
  if (!resp.ok) {
    console.error(`${type} rate limit count failed`, resp.status);
    return { ok: false, message: busyMessage, retryAfterSeconds: 60 };
  }

  const match = (resp.headers.get("content-range") || "").match(/\/(\d+|\*)/);
  const used = match && match[1] !== "*" ? Number(match[1]) || 0 : 0;
  if (used >= max) {
    return { ok: false, message: spentMessage, retryAfterSeconds: 86400 };
  }

  await fetch(`${base}/rest/v1/estimate_calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({ profile_id: userId, type }),
  }).catch(() => {});
  return { ok: true, used };
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
