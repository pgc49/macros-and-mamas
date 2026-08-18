/**
 * Complimentary (comp) members are paid=true for dashboard access
 * but did not pay through Stripe. Do not treat them as Stripe customers.
 */

export function isComplimentary(profile) {
  return !!profile?.comp;
}

/** Money was collected (or refunded after a real charge) — not complimentary. */
export function isStripeCollected(profile) {
  return !!profile?.paid && !profile?.refunded && !profile?.comp;
}

/** Customer Portal needs a real Stripe customer, never a comp row. */
export function stripePortalAvailable(profile, { stripeSecret } = {}) {
  if (profile?.comp) return false;
  if (stripeSecret !== undefined && !stripeSecret) return false;
  return !!profile?.stripe_customer_id;
}

/**
 * Last-resort Payments history when Stripe has no charges.
 * Comps must not get a fake succeeded row (that looks like backfill).
 */
export function billingFallbackPayments(profile) {
  if (!profile?.paid || profile.comp) return [];
  return [{
    id: profile.stripe_payment_intent || "program",
    created: profile.paid_at,
    amount: null,
    currency: "usd",
    status: "succeeded",
    description: "8-week program",
    receiptUrl: null,
    brand: null,
    last4: null,
  }];
}
