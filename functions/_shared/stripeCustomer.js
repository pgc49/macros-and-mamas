/* ==================================================================
   Stripe Customer ids
   ==================================================================
   Checkout can attach a guest customer (gcus_) when a one-time payment
   does not create a Customer. Those ids are not Customers: Stripe
   rejects them on a later Checkout Session ("No such customer"), which
   blocks membership opt-in. Only cus_ ids are reusable.
   ================================================================== */

const CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

/** Real Customers API id, or "" when missing / guest / malformed. */
export function reusableStripeCustomerId(id) {
  const value = String(id || "").trim();
  return CUSTOMER_ID.test(value) ? value : "";
}

/**
 * Customer id to persist. Keeps an existing real Customer.
 * Replaces a blank or guest id when the incoming id is a real Customer.
 * Returns null when the stored value should stay as-is.
 */
export function nextStoredStripeCustomerId(existingId, incomingId) {
  const incoming = reusableStripeCustomerId(incomingId);
  if (!incoming) return null;
  if (reusableStripeCustomerId(existingId)) return null;
  return incoming;
}

/** Stripe error when `customer` is not a Customer on this account. */
export function stripeReportedMissingCustomer(data) {
  const err = data?.error;
  if (!err || typeof err !== "object") return false;
  if (String(err.param || "") !== "customer") return false;
  const code = String(err.code || "");
  const message = String(err.message || "");
  return code === "resource_missing" || /no such customer/i.test(message);
}
