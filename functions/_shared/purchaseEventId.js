/**
 * Purchase Pixel + CAPI must share Stripe Checkout session.id (`cs_…`).
 * Do not reuse the InitiateCheckout id (`ic_…`) — Meta then counts one pay twice.
 */
export function purchaseEventIdFromStripeSession(session) {
  return String(session?.id || "").trim();
}
