import { purchaseEventIdFromWelcomeSearch } from "./purchaseEventId";

/**
 * /welcome bounce rules after Stripe (or a leftover bookmark).
 * stay — already paid; same ready / intake path as today
 * hold — profile row not loaded yet; paid is still the signed-out default
 * poll — unpaid + checkout session_id; wait for the webhook
 * join — unpaid and no session_id; do not fake a payment wait
 *
 * Do not send join while `loaded` is false — that is the same flash as
 * SignInGate calling homePathFor before paid is known.
 */
export function welcomeCheckoutDecision({ paid, loaded = true, search } = {}) {
  if (paid) return "stay";
  if (!loaded) return "hold";
  if (purchaseEventIdFromWelcomeSearch(search)) return "poll";
  return "join";
}
