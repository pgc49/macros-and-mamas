/**
 * POST /api/intake-waitlist
 * Writes public.waitlist (pregnant / early-nursing eligibility holds).
 * Service-role insert + WAITLIST KV rate limit (fail closed if unbound).
 *
 * The live marketing / SPA form is POST /api/waitlist → cohort_waitlist.
 * This path exists so leftover joinWaitlist() callers do not write the table
 * with the anon key.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED = new Set(["pregnant", "early_nursing"]);
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** @returns {"ok"|"limited"|"unavailable"} */
async function rateLimitStatus(env, ip) {
  if (!env.WAITLIST) return "unavailable";
  const key = `intake-wl-rl:${ip}`;
  const raw = await env.WAITLIST.get(key);
  const now = Date.now();
  let hits = [];
  if (raw) {
    try {
      hits = JSON.parse(raw).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    } catch {
      hits = [];
    }
  }
  if (hits.length >= RATE_LIMIT_MAX) return "limited";
  hits.push(now);
  await env.WAITLIST.put(key, JSON.stringify(hits), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return "ok";
}

function eligibleOnFor(reason, monthsPp) {
  if (reason !== "early_nursing" || monthsPp == null || Number.isNaN(Number(monthsPp))) {
    return null;
  }
  const monthsUntil = Math.max(0, 3 - Number(monthsPp));
  const d = new Date();
  d.setMonth(d.getMonth() + Math.ceil(monthsUntil));
  return d.toISOString().slice(0, 10);
}

async function optionalUserId(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const resp = await fetch(`${base}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  const user = await resp.json().catch(() => null);
  return user?.id || null;
}

async function insertWaitlist(env, row) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("missing_supabase");
  const resp = await fetch(`${base}/rest/v1/waitlist`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (resp.ok || resp.status === 201) return;
  throw new Error(`supabase_insert_${resp.status}: ${await resp.text()}`);
}

export async function onRequestPost({ request, env }) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  try {
    const rl = await rateLimitStatus(env, ip);
    if (rl === "unavailable") {
      console.error("intake-waitlist rate limit unavailable (WAITLIST KV unbound)");
      return json({ ok: false, error: "unavailable" }, 503);
    }
    if (rl === "limited") {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    const body = await request.json().catch(() => ({}));
    if (body.website_url) return json({ ok: true });

    const email = String(body.email || "").trim().toLowerCase();
    let reason = String(body.reason || "").trim();
    if (reason === "early") reason = "early_nursing";
    const monthsRaw = body.months_pp ?? body.monthsPp;
    const monthsPp =
      monthsRaw == null || monthsRaw === ""
        ? null
        : Number(monthsRaw);

    if (!email || !EMAIL_RE.test(email) || email.length > 200) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    if (!ALLOWED.has(reason)) {
      return json({ ok: false, error: "invalid_reason" }, 400);
    }
    if (monthsPp != null && !Number.isFinite(monthsPp)) {
      return json({ ok: false, error: "invalid_months_pp" }, 400);
    }

    const profileId = await optionalUserId(request, env);
    await insertWaitlist(env, {
      email: email.slice(0, 200),
      reason,
      months_pp: monthsPp,
      eligible_on: eligibleOnFor(reason, monthsPp),
      profile_id: profileId,
    });

    return json({ ok: true });
  } catch (err) {
    console.error("[intake-waitlist] error", err);
    return json({ ok: false, error: "server_error" }, 500);
  }
}
