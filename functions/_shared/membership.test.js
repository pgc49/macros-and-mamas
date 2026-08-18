import { describe, expect, it } from "vitest";
import {
  buildSubscriptionPayload,
  membershipAccess,
  trialEndUnixForCheckout,
} from "./membership.js";

const FOUNDING_FREE_END = "2026-10-21T00:00:00.000Z";
const AUGUST_PROGRAM_END = "2026-10-26T00:00:00.000Z";

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

describe("membershipAccess — August has no free month", () => {
  const august = () => mama({ cohort_label: "2026-08" });

  it("allows in-program access through the last program day", () => {
    const during = membershipAccess(august(), "2026-10-25T12:00:00.000Z");
    expect(during).toMatchObject({ allowed: true, reason: "in_program", paywall: false });
    expect(during.freeMonthEndsAt).toBeNull();
  });

  it("paywalls at programEnd with no 30-day window", () => {
    const access = membershipAccess(august(), "2026-10-26T00:00:00.000Z");
    expect(access).toMatchObject({
      allowed: false,
      reason: "membership_required",
      paywall: true,
    });
    expect(access.freeMonthEndsAt).toBeNull();
  });

  it("does not grant free_month in the 30 days after programEnd", () => {
    const access = membershipAccess(august(), "2026-11-10T12:00:00.000Z");
    expect(access.reason).toBe("membership_required");
    expect(access.paywall).toBe(true);
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

  it("pins August Checkout to programEnd when she opts in during the 8 weeks", () => {
    const expected = Math.floor(Date.parse(AUGUST_PROGRAM_END) / 1000);
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      "2026-09-15T12:00:00.000Z",
    )).toBe(expected);
  });

  it("does not give August a 30-day post-program trial", () => {
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      "2026-10-26T00:00:00.000Z",
    )).toBeNull();
    expect(trialEndUnixForCheckout(
      mama({ cohort_label: "2026-08" }),
      "2026-11-10T12:00:00.000Z",
    )).toBeNull();
  });
});

describe("buildSubscriptionPayload copy", () => {
  const env = { PRICE_ALUMNI_49: "price_alumni_membership_49" };

  it("tells Founding about the free month and does not tell August", async () => {
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
    expect(august.hasFreeMonth).toBe(false);
    expect(august.note).not.toMatch(/free month/i);
    expect(august.periodLabel).toBeNull();
    expect(august.trialEndsAt).toBe(AUGUST_PROGRAM_END);
    expect(august.status).toBe("available");
  });

  it("does not tell August the program ended with a free month", async () => {
    const founding = await buildSubscriptionPayload(
      env,
      mama(),
      "2026-10-22T00:00:00.000Z",
    );
    expect(founding.status).toBe("required");
    expect(founding.note).toMatch(/Your free month has ended/);

    const august = await buildSubscriptionPayload(
      env,
      mama({ cohort_label: "2026-08" }),
      "2026-10-26T00:00:00.000Z",
    );
    expect(august.status).toBe("required");
    expect(august.hasFreeMonth).toBe(false);
    expect(august.note).toBe("Your 8-week program has ended. Subscribe to keep using the app.");
    expect(august.note).not.toMatch(/free month/i);
    expect(august.trialEndsAt).toBeNull();
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
    expect(august.note).toBe("Nothing charges until the trial ends.");
    expect(august.note).not.toMatch(/free month/i);
    expect(august.periodLabel).toMatch(/First charge after/);
    expect(august.periodLabel).not.toMatch(/Free month/);
  });
});
