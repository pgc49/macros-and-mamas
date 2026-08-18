import { describe, expect, it } from "vitest";
import { purchaseEventIdFromStripeSession } from "./purchaseEventId.js";

describe("purchaseEventIdFromStripeSession", () => {
  it("ignores the InitiateCheckout metadata id", () => {
    expect(purchaseEventIdFromStripeSession({
      id: "cs_live_1",
      metadata: { event_id: "ic_click_1" },
    })).toBe("cs_live_1");
  });
});
