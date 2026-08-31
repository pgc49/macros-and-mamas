import { purchaseEventIdFromWelcomeSearch } from "./purchaseEventId";

/**
 * /welcome bounce rules after Stripe (or a leftover bookmark).
 * stay — already paid; same ready / intake path as today
 * poll — unpaid + checkout session_id; wait for the webhook
 * join — unpaid and no session_id; do not fake a payment wait
 */
export function welcomeCheckoutDecision({ paid, search } = {}) {
  if (paid) return "stay";
  if (purchaseEventIdFromWelcomeSearch(search)) return "poll";
  return "join";
}
