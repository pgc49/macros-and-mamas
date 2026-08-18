import { describe, expect, it } from "vitest";
import {
  buildCreditsOverview,
  moneyCents,
  missingShareCodes,
} from "./creditsOverview.js";

const advocate = {
  id: "adv-1",
  role: "client",
  name: "Megan Onnelly",
  email: "megan@example.com",
  paid: true,
  refunded: false,
  status: "active",
  stage: "active",
};
const friend = {
  id: "friend-1",
  role: "client",
  name: "Jennifer A Stone",
  email: "jen@example.com",
  paid: true,
  refunded: false,
  status: "active",
  stage: "active",
};
const quiet = {
  id: "quiet-1",
  role: "client",
  name: "Ava Stone",
  email: "ava@example.com",
  paid: true,
  refunded: false,
  status: "active",
  stage: "active",
};

describe("moneyCents", () => {
  it("formats ledger cents", () => {
    expect(moneyCents(2500)).toBe("$25.00");
    expect(moneyCents(0)).toBe("$0.00");
  });
});

describe("missingShareCodes", () => {
  it("flags active paid mamas without a code", () => {
    expect(missingShareCodes([advocate, friend], [
      { user_id: "adv-1", code: "MEGANO25", active: true },
    ])).toEqual([
      { userId: "friend-1", name: "Jennifer A Stone", email: "jen@example.com" },
    ]);
  });

  it("ignores unpaid and admin rows", () => {
    expect(missingShareCodes([
      { ...friend, paid: false, status: "pending", stage: "signed_up" },
      { id: "admin-1", role: "admin", name: "Callie", paid: true, status: "active" },
    ], [])).toEqual([]);
  });
});

describe("buildCreditsOverview", () => {
  const ledgerRows = [
    { user_id: "adv-1", amount_cents: 2500, status: "pending" },
    { user_id: "adv-1", amount_cents: 2500, status: "available" },
    { user_id: "quiet-1", amount_cents: 2500, status: "reversed" },
  ];
  const referralRows = [
    {
      id: "ref-1",
      advocate_user_id: "adv-1",
      referred_user_id: "friend-1",
      referred_email: "jen@example.com",
      code: "megano25",
      status: "paid",
      created_at: "2026-08-18T12:00:00.000Z",
    },
    {
      id: "ref-old",
      advocate_user_id: "adv-1",
      referred_user_id: "friend-1",
      code: "MEGANO25",
      status: "refunded",
      created_at: "2026-08-01T12:00:00.000Z",
    },
  ];
  const codeRows = [
    { user_id: "adv-1", code: "MEGANO25", active: true },
    { user_id: "quiet-1", code: "AVA25", active: true },
  ];

  it("lists outstanding credits and omits reversed rows", () => {
    const overview = buildCreditsOverview({
      roster: [advocate, friend, quiet],
      ledgerRows,
      referralRows,
      codeRows,
    });
    expect(overview.outstanding).toEqual([
      {
        userId: "adv-1",
        name: "Megan Onnelly",
        email: "megan@example.com",
        availableCents: 2500,
        pendingCents: 2500,
        code: "MEGANO25",
      },
    ]);
    expect(overview.totals.availableCents).toBe(2500);
    expect(overview.totals.pendingCents).toBe(2500);
    expect(overview.totals.mamaCount).toBe(1);
  });

  it("lists live referrals with full names and skips refunded", () => {
    const overview = buildCreditsOverview({
      roster: [advocate, friend, quiet],
      ledgerRows,
      referralRows,
      codeRows,
    });
    expect(overview.referrals).toEqual([
      {
        id: "ref-1",
        code: "MEGANO25",
        status: "paid",
        createdAt: "2026-08-18T12:00:00.000Z",
        advocateUserId: "adv-1",
        advocateName: "Megan Onnelly",
        referredUserId: "friend-1",
        referredName: "Jennifer A Stone",
      },
    ]);
    expect(overview.totals.referralCount).toBe(1);
    expect(overview.totals.paidReferralCount).toBe(1);
  });

  it("returns empty lists when nothing is outstanding", () => {
    const overview = buildCreditsOverview({
      roster: [quiet],
      ledgerRows: [],
      referralRows: [],
      codeRows: [{ user_id: "quiet-1", code: "AVA25", active: true }],
    });
    expect(overview.outstanding).toEqual([]);
    expect(overview.referrals).toEqual([]);
    expect(overview.missingCodes).toEqual([]);
    expect(overview.totals.codeCount).toBe(1);
    expect(overview.totals.missingCodeCount).toBe(0);
  });
});
