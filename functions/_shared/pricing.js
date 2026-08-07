/**
 * Checkout price tiers.
 *
 * Cloudflare env (Price IDs from Stripe Dashboard):
 *   STRIPE_PRICE_ID_FOUNDING  — $149 (falls back to legacy STRIPE_PRICE_ID)
 *   STRIPE_PRICE_ID_WAITLIST  — $249 early / quiz-unlock rate
 *   STRIPE_PRICE_ID_FULL      — $299 full price
 *   STRIPE_PRICE_ID_LAB_ADDON — $299 The Lab Review (optional line item)
 *
 * Resolution order:
 *   1. Account created before ENROLLMENT_CLOSED_AT → founding ($149)
 *   2. Email completed the ranges quiz (eligible segment on marketing_leads) → early ($249)
 *   3. else → 403 `quiz_required` (pre-sales stay open; price unlocks only after the quiz)
 *
 * To sell without the quiz gate later, set OPEN_WITHOUT_QUIZ=true (uses waitlist Price ID).
 * Flip the open tier to `full` ($299) when you retire the early rate.
 */

export const PRICE_TIERS = {
  founding: { tier: "founding", amount: 149, label: "Founding" },
  waitlist: { tier: "waitlist", amount: 249, label: "Early rate" },
  full: { tier: "full", amount: 299, label: "Full" },
};

/** Optional Lab Review add-on (one-time). */
export const LAB_ADDON_AMOUNT = 299;
export const LAB_ADDON_LABEL = "The Lab Review";

/** Segments that may unlock the $249 early rate after the quiz. */
const QUIZ_UNLOCK_SEGMENTS = new Set([
  "main",
  "early_pp_nurture",
]);

export function labAddonPriceId(env) {
  return String(env.STRIPE_PRICE_ID_LAB_ADDON || "").trim();
}

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
  // Founding finish-pay path (accounts started before the close cutoff).
  if (isFoundingAccount(createdAt, env)) {
    return offerOrMissing(env, "founding");
  }

  // Quiz unlock: completed ranges quiz with an eligible segment.
  if (await emailHasQuizUnlock(env, email)) {
    return offerOrMissing(env, "waitlist");
  }

  // Escape hatch: public checkout with no quiz (off by default).
  if (String(env.OPEN_WITHOUT_QUIZ || "").toLowerCase() === "true") {
    return offerOrMissing(env, "waitlist");
  }

  return { ok: false, error: "quiz_required", status: 403 };
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

/**
 * True when this email completed the marketing quiz and is eligible to pay
 * the early rate (not pregnant nurture / vegan hold).
 * needs_review rows still unlock pay — Callie reviews ranges separately.
 */
export async function emailHasQuizUnlock(env, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;

  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return false;

  const url =
    `${base}/rest/v1/marketing_leads`
    + `?select=segment,needs_review`
    + `&email=ilike.${encodeURIComponent(normalized)}`
    + `&limit=1`;

  try {
    const resp = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      console.error("marketing_leads lookup failed", resp.status, await resp.text());
      return false;
    }
    const rows = await resp.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return false;
    const segment = String(row.segment || "");
    // Allow needs_review on an otherwise eligible path (segment still main/early_pp).
    if (QUIZ_UNLOCK_SEGMENTS.has(segment)) return true;
    return false;
  } catch (e) {
    console.error("marketing_leads lookup error", e);
    return false;
  }
}
