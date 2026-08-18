import { describe, expect, it } from "vitest";
import {
  membershipAccess,
  membershipGateMessage,
  membershipOptInButtonLabel,
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

  it("paywalls August at programEnd with no free month", () => {
    const august = mama({ cohort_label: "2026-08" });
    expect(membershipAccess(august, "2026-10-25T12:00:00.000Z")).toMatchObject({
      allowed: true,
      reason: "in_program",
    });
    expect(membershipAccess(august, "2026-10-26T00:00:00.000Z")).toMatchObject({
      allowed: false,
      reason: "membership_required",
      paywall: true,
      freeMonthEndsAt: null,
    });
    expect(needsMembershipPaywall(august, "2026-10-26T00:00:00.000Z")).toBe(true);
  });
});

describe("membership copy helpers", () => {
  it("keeps Founding gate copy and does not promise August a free month", () => {
    expect(membershipGateMessage(mama())).toMatch(/free month of Founding Mama membership has ended/);
    expect(membershipGateMessage(mama({ cohort_label: "2026-08" }))).toBe(
      "Your 8-week program has ended. Subscribe at $49/mo to keep logging meals, your ranges, progress history, and Alumni community access.",
    );
    expect(membershipGateMessage(mama({ cohort_label: "2026-08" }))).not.toMatch(/free month/i);
  });

  it("uses the free-month CTA only when the payload says she has one", () => {
    expect(membershipOptInButtonLabel({ status: "available", hasFreeMonth: true }))
      .toBe("Start free month — then $49/mo");
    expect(membershipOptInButtonLabel({ status: "available", hasFreeMonth: false }))
      .toBe("Subscribe — $49/mo");
    expect(membershipOptInButtonLabel({ status: "required", hasFreeMonth: false }))
      .toBe("Subscribe to continue — $49/mo");
  });
});
