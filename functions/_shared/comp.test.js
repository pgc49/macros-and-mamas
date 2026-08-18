import { describe, expect, it } from "vitest";
import {
  billingFallbackPayments,
  isComplimentary,
  isStripeCollected,
  stripePortalAvailable,
} from "./comp.js";

const stripePaid = {
  paid: true,
  refunded: false,
  comp: false,
  stripe_customer_id: "cus_123",
  stripe_payment_intent: "pi_123",
  paid_at: "2026-08-01T00:00:00.000Z",
};

const compMama = {
  paid: true,
  refunded: false,
  comp: true,
  stripe_customer_id: null,
  stripe_payment_intent: null,
  paid_at: null,
};

describe("comp helpers", () => {
  it("treats comps as distinct from Stripe-collected", () => {
    expect(isComplimentary(compMama)).toBe(true);
    expect(isStripeCollected(compMama)).toBe(false);
    expect(isStripeCollected(stripePaid)).toBe(true);
    expect(isStripeCollected({ paid: true, refunded: true, comp: false })).toBe(false);
  });

  it("never offers Stripe portal for a comp, even if a customer id were present", () => {
    expect(stripePortalAvailable(compMama, { stripeSecret: "sk_test" })).toBe(false);
    expect(stripePortalAvailable({ ...compMama, stripe_customer_id: "cus_x" }, { stripeSecret: "sk_test" })).toBe(false);
    expect(stripePortalAvailable(stripePaid, { stripeSecret: "sk_test" })).toBe(true);
    expect(stripePortalAvailable(stripePaid, { stripeSecret: "" })).toBe(false);
  });

  it("does not invent a Stripe payment row for comps", () => {
    expect(billingFallbackPayments(compMama)).toEqual([]);
    expect(billingFallbackPayments(stripePaid)[0].id).toBe("pi_123");
    expect(billingFallbackPayments({ paid: false })).toEqual([]);
  });
});
