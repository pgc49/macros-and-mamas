/**
 * Purchase Pixel + CAPI must share Stripe Checkout session.id (`cs_…`).
 * Do not reuse the InitiateCheckout id (`ic_…`) — Meta then counts one pay twice.
 */
export function purchaseEventId(stripeCheckoutSessionId) {
  return String(stripeCheckoutSessionId || "").trim();
}

export function purchaseEventIdFromWelcomeSearch(search) {
  return purchaseEventId(new URLSearchParams(search).get("session_id"));
}

export function purchaseEventIdFromStripeSession(session) {
  return purchaseEventId(session?.id);
}
