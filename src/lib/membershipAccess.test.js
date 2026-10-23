import { describe, expect, it } from "vitest";
import {
  membershipAccess,
  courtesyMonthCopy,
  membershipCheckoutFinePrint,
  membershipGateMessage,
  membershipOptInButtonLabel,
  membershipPayPromptCopy,
  needsMembershipPaywall,
} from "./membershipAccess";

const FOUNDING_FREE_END = "2026-10-21T00:00:00.000Z";

function mama(overrides = {}) {
  return {
    paid: true,
    refunded: false,
    role: "client",
    cohort_label: "2026-07",
    subscription_status: null,
    tier: null,
    ...overrides,
  };
}

describe("client membershipAccess", () => {
  it("keeps Founding in the free-month window without a sub", () => {
    expect(membershipAccess(mama(), "2026-10-01T12:00:00.000Z")).toMatchObject({
      allowed: true,
      reason: "free_month",
      paywall: false,
      freeMonthEndsAt: FOUNDING_FREE_END,
    });
    expect(needsMembershipPaywall(mama(), "2026-10-01T12:00:00.000Z")).toBe(false);
  });

  it("paywalls Founding after Oct 21 without a sub", () => {
    expect(needsMembershipPaywall(mama(), "2026-10-21T00:00:00.000Z")).toBe(true);
  });

  it("keeps August through the courtesy month and paywalls on Nov 25", () => {
    const august = mama({ cohort_label: "2026-08" });
    expect(membershipAccess(august, "2026-10-25T12:00:00.000Z")).toMatchObject({
      allowed: true,
      reason: "in_program",
      freeMonthEndsAt: "2026-11-25T00:00:00.000Z",
    });
    expect(membershipAccess(august, "2026-11-10T12:00:00.000Z")).toMatchObject({
      allowed: true,
      reason: "free_month",
      paywall: false,
    });
    expect(needsMembershipPaywall(august, "2026-11-25T00:00:00.000Z")).toBe(true);
    expect(needsMembershipPaywall(mama({ cohort_label: "2026-11" }), "2026-12-28T00:00:00.000Z")).toBe(true);
  });
});

describe("membership copy helpers", () => {
  it("keeps Founding gate copy and does not promise August a free month", () => {
    expect(membershipGateMessage(mama())).toMatch(/Pay \$49 a month/);
    expect(membershipGateMessage(mama())).toMatch(/free month has ended|Founding rate/);
    expect(membershipPayPromptCopy(mama())).toMatchObject({
      title: "Your free month has ended",
      price: "$49",
      button: "Pay $49/mo",
    });
    expect(membershipGateMessage(mama({ cohort_label: "2026-08" }))).toMatch(/courtesy month was one month free/);
    expect(membershipGateMessage(mama({ cohort_label: "2026-08" }))).not.toMatch(/free month/i);
    expect(membershipGateMessage(mama({ cohort_label: "2026-08" }))).not.toMatch(/Founding/);
    expect(membershipPayPromptCopy(mama({ cohort_label: "2026-08" })).title)
      .toBe("Your courtesy month has ended");
    expect(membershipGateMessage(mama({ cohort_label: "2026-11" }))).toBe(
      "Pay $49 a month to keep logging meals, your ranges, progress, and Alumni chat.",
    );
    expect(membershipGateMessage(mama({ cohort_label: "2026-11" }))).not.toMatch(/courtesy|free month/i);
  });

  it("explains Callie's courtesy month as one free month of the $49 tier", () => {
    const august = mama({ cohort_label: "2026-08" });
    const before = courtesyMonthCopy(august, "2026-10-23T18:00:00.000Z");
    expect(before).toMatchObject({
      phase: "in_program",
      eyebrow: "From Callie",
      title: "A courtesy month of the new membership",
      button: "Add my membership",
    });
    expect(before.lead).toMatch(/Callie is giving August Group one month of the monthly membership, free/);
    expect(before.lead).toMatch(/October 25/);
    expect(before.lead).toMatch(/October 26/);
    expect(before.lead).toMatch(/November 25/);
    expect(before.expectation).toMatch(/one month free of the new tier/);
    expect(before.expectation).toMatch(/\$49 a month if you keep it/);
    expect(before.includes).toEqual([
      "Your ranges, meal logging, and progress history",
      "Alumni chat with Callie and the other grads",
    ]);

    const during = courtesyMonthCopy(august, "2026-11-10T12:00:00.000Z");
    expect(during.phase).toBe("free_month");
    expect(during.title).toBe("You're in your courtesy month");
    expect(during.lead).toMatch(/through November 25/);

    expect(courtesyMonthCopy(august, "2026-11-25T00:00:00.000Z")).toBeNull();
    expect(courtesyMonthCopy(
      mama({ cohort_label: "2026-08", subscription_status: "active" }),
      "2026-10-23T18:00:00.000Z",
    )).toBeNull();
    expect(courtesyMonthCopy(mama(), "2026-08-18T12:00:00.000Z")).toBeNull();
    expect(courtesyMonthCopy(mama({ cohort_label: "2026-11" }), "2026-11-15T12:00:00.000Z")).toBeNull();
  });

  it("uses the free-month CTA only when the payload says she has one", () => {
    expect(membershipOptInButtonLabel({ status: "available", hasFreeMonth: true }))
      .toBe("Start free month — then $49/mo");
    expect(membershipOptInButtonLabel({ status: "available", hasFreeMonth: false }))
      .toBe("Subscribe — $49/mo");
    expect(membershipOptInButtonLabel({ status: "required", hasFreeMonth: true }))
      .toBe("Pay $49/mo");
    expect(membershipOptInButtonLabel({ status: "required", hasFreeMonth: false }))
      .toBe("Pay $49/mo");
    expect(membershipOptInButtonLabel({ status: "available", freeMonthKind: "courtesy" }))
      .toBe("Add membership — courtesy month, then $49/mo");
  });

  it("stops telling her the first charge is waiting once membership is required", () => {
    expect(membershipCheckoutFinePrint({ status: "required", hasFreeMonth: true }))
      .toBe("You'll confirm $49/mo in Stripe. Membership starts when you pay.");
    expect(membershipCheckoutFinePrint({ status: "required", hasFreeMonth: true }))
      .not.toMatch(/free month/i);
    expect(membershipCheckoutFinePrint({ status: "available", hasFreeMonth: true }))
      .toMatch(/free month ends/);
    expect(membershipCheckoutFinePrint({
      status: "available",
      freeMonthKind: "courtesy",
      hasFreeMonth: true,
    })).toMatch(/Callie's courtesy month ends/);
    expect(membershipCheckoutFinePrint({
      status: "required",
      freeMonthKind: "courtesy",
    })).toMatch(/courtesy month has ended/);
    expect(membershipCheckoutFinePrint({
      status: "available",
      hasFreeMonth: false,
      trialEndsAt: "2026-10-26T00:00:00.000Z",
    })).toMatch(/program ends/);
    expect(membershipCheckoutFinePrint({
      status: "available",
      hasFreeMonth: false,
      trialEndsAt: "2026-10-26T00:00:00.000Z",
    })).not.toMatch(/free month/i);
  });
});
