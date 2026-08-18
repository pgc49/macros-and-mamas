import { describe, expect, it } from "vitest";
import {
  purchaseEventIdFromStripeSession,
  purchaseEventIdFromWelcomeSearch,
} from "./purchaseEventId";

describe("purchaseEventId", () => {
  it("uses Stripe session.id on /welcome, not an InitiateCheckout id", () => {
    expect(purchaseEventIdFromWelcomeSearch("?session_id=cs_test_abc")).toBe("cs_test_abc");
    expect(purchaseEventIdFromWelcomeSearch("?from=quiz")).toBe("");
  });

  it("uses Stripe session.id on the webhook, even if metadata still has the checkout click id", () => {
    expect(purchaseEventIdFromStripeSession({
      id: "cs_test_abc",
      metadata: { event_id: "ic_click_old" },
    })).toBe("cs_test_abc");
  });
});
