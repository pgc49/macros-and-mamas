/**
 * Checkout price tiers.
 *
 * Cloudflare env (Price IDs from Stripe Dashboard):
 *   STRIPE_PRICE_ID_FOUNDING  — $149 (falls back to legacy STRIPE_PRICE_ID)
 *   STRIPE_PRICE_ID_WAITLIST  — $249 early waitlist
 *   STRIPE_PRICE_ID_FULL      — $299 full price
 *
 * Resolution order:
 *   1. Account created before ENROLLMENT_CLOSED_AT → founding
 *   2. Email on cohort_waitlist for current cohort → waitlist
 *   3. ENROLLMENT_OPEN=true → full
 *   4. else → closed (no checkout)
 */

export const PRICE_TIERS = {
  founding: { tier: "founding", amount: 149, label: "Founding" },
  waitlist: { tier: "waitlist", amount: 249, label: "Waitlist early" },
  full: { tier: "full", amount: 299, label: "Full" },
};

export function enrollmentIsOpen(env) {
  return String(env.ENROLLMENT_OPEN || "").toLowerCase() === "true";
}

export function enrollmentClosedAt(env) {
  return env.ENROLLMENT_CLOSED_AT || "2026-07-26T02:00:00.000Z";
}

export function waitlistCohort(env) {
  return String(env.WAITLIST_COHORT || "cohort_2").slice(0, 40);
}

export function isFoundingAccount(createdAtIso, env) {
  if (!createdAtIso) return false;
  const closed = Date.parse(enrollmentClosedAt(env));
  const created = Date.parse(createdAtIso);
  return Number.isFinite(created) && Number.isFinite(closed) && created < closed;
}

export function priceIdForTier(env, tier) {
  if (tier === "founding") {
    return env.STRIPE_PRICE_ID_FOUNDING || env.STRIPE_PRICE_ID || "";
  }
  if (tier === "waitlist") {
    return env.STRIPE_PRICE_ID_WAITLIST || "";
  }
  if (tier === "full") {
    return env.STRIPE_PRICE_ID_FULL || "";
  }
  return "";
}

/**
 * Resolve which offer a signed-in unpaid user gets.
 * @returns {{ ok: true, tier, amount, label, priceId } | { ok: false, error: string, status: number }}
 */
export async function resolveCheckoutOffer(env, { email, createdAt }) {
  if (isFoundingAccount(createdAt, env)) {
    return offerOrMissing(env, "founding");
  }

  const onWaitlist = await emailOnCohortWaitlist(env, email);
  if (onWaitlist) {
    if (!enrollmentIsOpen(env)) {
      return { ok: false, error: "enrollment closed", status: 403 };
    }
    return offerOrMissing(env, "waitlist");
  }

  if (enrollmentIsOpen(env)) {
    return offerOrMissing(env, "full");
  }

  return { ok: false, error: "enrollment closed", status: 403 };
}

function offerOrMissing(env, tier) {
  const meta = PRICE_TIERS[tier];
  const priceId = priceIdForTier(env, tier);
  if (!priceId) {
    console.error("missing Stripe price id for tier", tier);
    return { ok: false, error: "checkout unavailable", status: 503 };
  }
  return {
    ok: true,
    tier: meta.tier,
    amount: meta.amount,
    label: meta.label,
    priceId,
  };
}

async function emailOnCohortWaitlist(env, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;

  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return false;

  const cohort = waitlistCohort(env);
  const url =
    `${base}/rest/v1/cohort_waitlist`
    + `?select=id`
    + `&email=eq.${encodeURIComponent(normalized)}`
    + `&cohort=eq.${encodeURIComponent(cohort)}`
    + `&limit=1`;

  try {
    const resp = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      console.error("waitlist lookup failed", resp.status, await resp.text());
      return false;
    }
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.error("waitlist lookup error", e);
    return false;
  }
}
