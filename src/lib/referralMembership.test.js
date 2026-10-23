import { describe, expect, it } from "vitest";
import {
  MEMBERSHIP_MONTH_CENTS,
  REFERRAL_CREDIT_CENTS,
  referralNudgeCopy,
  referralStackSummary,
} from "./referralMembership";

describe("referral membership stack", () => {
  it("prices a free month as two $25 referrals against the $49 invoice", () => {
    expect(REFERRAL_CREDIT_CENTS).toBe(2500);
    expect(MEMBERSHIP_MONTH_CENTS).toBe(4900);
    const copy = referralNudgeCopy();
    expect(copy.title).toBe("Two friends cover a month");
    expect(copy.lead).toMatch(/8-week program/);
    expect(copy.lead).toMatch(/\$25/);
    expect(copy.stack).toMatch(/one free month of the \$49 membership/);
    expect(copy.stack).toMatch(/Credits stack/);
    expect(copy.stack).toMatch(/pays for itself/);
  });

  it("starts at two friends and counts each $25 toward the next month", () => {
    expect(referralStackSummary({ availableCents: 0, pendingCents: 0 })).toMatchObject({
      monthsCovered: 0,
      referralsToGo: 2,
      headline: "Nothing stacked yet. Two friends cover your first free month.",
      pendingNote: "",
    });

    expect(referralStackSummary({ availableCents: 0, pendingCents: 2500, vestingDays: 3 })).toMatchObject({
      monthsCovered: 0,
      referralsToGo: 1,
      headline: "$25 stacked. One more friend covers a free month.",
    });
    expect(referralStackSummary({ pendingCents: 2500 }).pendingNote).toMatch(/\$25 is pending and vests in 3 days/);

    expect(referralStackSummary({ availableCents: 5000 })).toMatchObject({
      monthsCovered: 1,
      referralsToGo: 2,
      headline: "$50 stacked — 1 free month of membership. Two more friends cover the next one.",
    });

    expect(referralStackSummary({ availableCents: 7500 })).toMatchObject({
      monthsCovered: 1,
      referralsToGo: 1,
      headline: "$75 stacked — 1 free month of membership, and you're one friend from the next.",
    });

    expect(referralStackSummary({ availableCents: 10000 })).toMatchObject({
      monthsCovered: 2,
      referralsToGo: 2,
    });
  });

  it("keeps a leftover dollar from a covered month from pretending to be a referral", () => {
    expect(referralStackSummary({ availableCents: 100 })).toMatchObject({
      monthsCovered: 0,
      referralsToGo: 2,
    });
    expect(referralStackSummary({ availableCents: 5100 })).toMatchObject({
      monthsCovered: 1,
      referralsToGo: 2,
    });
  });
});
