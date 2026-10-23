import { describe, expect, it } from "vitest";
import {
  buildSubscriptionPayload,
  membershipAccess,
  membershipCheckoutCancelPath,
  trialEndUnixForCheckout,
} from "./membership.js";

const FOUNDING_FREE_END = "2026-10-21T00:00:00.000Z";
const AUGUST_PROGRAM_END = "2026-10-26T00:00:00.000Z";
const AUGUST_COURTESY_END = "2026-11-25T00:00:00.000Z";

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

describe("membershipAccess — Founding free month", () => {
  it("allows unpaid-of-membership access during the Sep 21–Oct 21 window", () => {
    const access = membershipAccess(mama(), "2026-10-01T12:00:00.000Z");
    expect(access).toMatchObject({
      allowed: true,
      reason: "free_month",
      paywall: false,
      freeMonthEndsAt: FOUNDING_FREE_END,
    });
  });

  it("paywalls Founding after the free month without a sub", () => {
    const access = membershipAccess(mama(), "2026-10-21T00:00:00.000Z");
    expect(access).toMatchObject({
      allowed: false,
      reason: "membership_required",
      paywall: true,
      freeMonthEndsAt: FOUNDING_FREE_END,
    });
  });

  it("keeps access during the 8 weeks", () => {
    const access = membershipAccess(mama(), "2026-08-18T15:00:00.000Z");
    expect(access).toMatchObject({ allowed: true, reason: "in_program", paywall: false });
  });

  it("keeps access with an active or alumni_19 membership after the free month", () => {
    expect(membershipAccess(
      mama({ subscription_status: "active" }),
      "2026-10-22T00:00:00.000Z",
    ).allowed).toBe(true);
    expect(membershipAccess(
      mama({ subscription_status: "trialing" }),
      "2026-10-22T00:00:00.000Z",
    ).allowed).toBe(true);
    expect(membershipAccess(
      mama({ subscription_status: "past_due" }),
      "2026-10-22T00:00:00.000Z",
    ).allowed).toBe(true);
    expect(membershipAccess(
      mama({ tier: "alumni_19" }),
      "2026-10-22T00:00:00.000Z",
    ).allowed).toBe(true);
  });
});

describe("membershipAccess — August courtesy month", () => {
  const august = () => mama({ cohort_label: "2026-08" });

  it("allows in-program access through the last program day", () => {
    const during = membershipAccess(august(), "2026-10-25T12:00:00.000Z");
    expect(during).toMatchObject({
      allowed: true,
      reason: "in_program",
      paywall: false,
      freeMonthEndsAt: AUGUST_COURTESY_END,
    });
  });

  it("keeps August in the courtesy month after programEnd", () => {
    const access = membershipAccess(august(), "2026-10-26T00:00:00.000Z");
    expect(access).toMatchObject({
      allowed: true,
      reason: "free_month",
      paywall: false,
      freeMonthEndsAt: AUGUST_COURTESY_END,
    });
    expect(membershipAccess(august(), "2026-11-10T12:00:00.000Z")).toMatchObject({
      allowed: true,
      reason: "free_month",
      paywall: false,
    });
  });

  it("paywalls August after the courtesy month without a sub", () => {
    const access = membershipAccess(august(), AUGUST_COURTESY_END);
    expect(access).toMatchObject({
      allowed: false,
      reason: "membership_required",
      paywall: true,
      freeMonthEndsAt: AUGUST_COURTESY_END,
    });
  });

  it("does not give November a courtesy month", () => {
    const november = mama({ cohort_label: "2026-11" });
    expect(membershipAccess(november, "2026-12-28T00:00:00.000Z")).toMatchObject({
      allowed: false,
      reason: "membership_required",
      paywall: true,
      freeMonthEndsAt: null,
    });
  });

  it("still allows a subscribed August mama after programEnd", () => {
    expect(membershipAccess(
      mama({ cohort_label: "2026-08", subscription_status: "active" }),
      "2026-10-27T00:00:00.000Z",
    )).toMatchObject({ allowed: true, reason: "subscribed", paywall: false });
  });
});

describe("trialEndUnixForCheckout", () => {
  it("pins Founding Checkout to the free-month end during program and free month", () => {
    const expected = Math.floor(Date.parse(FOUNDING_FREE_END) / 1000);
    expect(trialEndUnixForCheckout(mama(), "2026-08-18T15:00:00.000Z")).toBe(expected);
    expect(trialEndUnixForCheckout(mama(), "2026-10-01T12:00:00.000Z")).toBe(expected);
  });

  it("does not pin Founding after the free month", () => {
    expect(trialEndUnixForCheckout(mama(), "2026-10-21T00:00:00.000Z")).toBeNull();
  });

  it("pins August Checkout to the courtesy-month end during the program and the courtesy month", () => {
    const expected = Math.floor(Date.parse(AUGUST_COURTESY_END) / 1000);
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      "2026-09-15T12:00:00.000Z",
    )).toBe(expected);
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      "2026-11-10T12:00:00.000Z",
    )).toBe(expected);
  });

  it("does not pin August after the courtesy month", () => {
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      AUGUST_COURTESY_END,
    )).toBeNull();
  });

  it("still pins November to programEnd and does not add 30 days", () => {
    const programEnd = "2026-12-28T00:00:00.000Z";
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-11" }),
      "2026-11-15T12:00:00.000Z",
    )).toBe(Math.floor(Date.parse(programEnd) / 1000));
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-11" }),
      programEnd,
    )).toBeNull();
  });
});

describe("buildSubscriptionPayload copy", () => {
  const env = { PRICE_ALUMNI_49: "price_alumni_membership_49" };

  it("tells Founding about their free month and August about the courtesy month", async () => {
    const founding = await buildSubscriptionPayload(
      env,
      mama(),
      "2026-08-18T15:00:00.000Z",
    );
    expect(founding.hasFreeMonth).toBe(true);
    expect(founding.note).toMatch(/Founding Members get one month/);
    expect(founding.note).toMatch(/free month/);
    expect(founding.periodLabel).toMatch(/Free month covers/);
    expect(founding.trialEndsAt).toBe(FOUNDING_FREE_END);

    const august = await buildSubscriptionPayload(
      env,
      mama({ cohort_label: "2026-08" }),
      "2026-08-18T15:00:00.000Z",
    );
    expect(august.hasFreeMonth).toBe(true);
    expect(august.freeMonthKind).toBe("courtesy");
    expect(august.note).toMatch(/Callie is giving August Group/);
    expect(august.note).toMatch(/one month of the monthly membership, free/);
    expect(august.note).toMatch(/new tier/);
    expect(august.note).not.toMatch(/free month/i);
    expect(august.periodLabel).toMatch(/Courtesy month covers/);
    expect(august.trialEndsAt).toBe(AUGUST_COURTESY_END);
    expect(august.status).toBe("available");
  });

  it("keeps August's courtesy month separate from Founding's ended perk", async () => {
    const founding = await buildSubscriptionPayload(
      env,
      mama(),
      "2026-10-22T00:00:00.000Z",
    );
    expect(founding.status).toBe("required");
    expect(founding.note).toMatch(/Your free month has ended/);
    expect(founding.note).toMatch(/Pay \$49\/mo/);
    expect(founding.periodLabel).toBeNull();
    expect(founding.trialEndsAt).toBeNull();

    const duringCourtesy = await buildSubscriptionPayload(
      env,
      mama({ cohort_label: "2026-08" }),
      "2026-10-26T00:00:00.000Z",
    );
    expect(duringCourtesy.status).toBe("available");
    expect(duringCourtesy.note).toMatch(/You're in Callie's courtesy month/);
    expect(duringCourtesy.note).toMatch(/one month free of the \$49 monthly membership/);
    expect(duringCourtesy.trialEndsAt).toBe(AUGUST_COURTESY_END);

    const afterCourtesy = await buildSubscriptionPayload(
      env,
      mama({ cohort_label: "2026-08" }),
      AUGUST_COURTESY_END,
    );
    expect(afterCourtesy.status).toBe("required");
    expect(afterCourtesy.note).toMatch(/Your courtesy month has ended/);
    expect(afterCourtesy.note).toMatch(/one month free of this membership/);
    expect(afterCourtesy.note).not.toMatch(/free month/i);
    expect(afterCourtesy.trialEndsAt).toBeNull();
  });

  it("does not call August a free-month trial while she is trialing to programEnd", async () => {
    const august = await buildSubscriptionPayload(
      env,
      mama({
        cohort_label: "2026-08",
        subscription_status: "trialing",
        subscription_trial_end: AUGUST_PROGRAM_END,
        subscription_current_period_end: AUGUST_PROGRAM_END,
      }),
      "2026-09-15T12:00:00.000Z",
    );
    expect(august.note).toBe(
      "Callie's courtesy month is on this membership. Nothing charges until the trial ends.",
    );
    expect(august.note).not.toMatch(/free month/i);
    expect(august.periodLabel).toMatch(/Courtesy month through/);
    expect(august.periodLabel).toMatch(/first charge after/);
    expect(august.periodLabel).not.toMatch(/Free month/);
  });

  it("does not offer November a courtesy month", async () => {
    const november = await buildSubscriptionPayload(
      env,
      mama({ cohort_label: "2026-11" }),
      "2026-11-15T12:00:00.000Z",
    );
    expect(november.hasFreeMonth).toBe(false);
    expect(november.freeMonthKind).toBeNull();
    expect(november.note).not.toMatch(/courtesy|free month/i);
    expect(november.trialEndsAt).toBe("2026-12-28T00:00:00.000Z");
  });
});

describe("membershipCheckoutCancelPath", () => {
  it("returns the mama to Today, Payments, or the membership link", () => {
    expect(membershipCheckoutCancelPath({ cancelPath: "/dashboard" })).toBe("/dashboard");
    expect(membershipCheckoutCancelPath({ cancelPath: "/membership" })).toBe("/membership");
    expect(membershipCheckoutCancelPath({ cancelPath: "/account/payments" })).toBe("/account/payments");
  });

  it("ignores any other return path", () => {
    expect(membershipCheckoutCancelPath({ cancelPath: "https://evil.example" })).toBe("/account/payments");
    expect(membershipCheckoutCancelPath({})).toBe("/account/payments");
    expect(membershipCheckoutCancelPath(null)).toBe("/account/payments");
  });
});
