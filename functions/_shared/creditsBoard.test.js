import { describe, expect, it } from "vitest";
import {
  buildCreditsBoard,
  formatLandsDate,
  formatMoneyCents,
  grantSuccessCopy,
} from "./creditsBoard.js";

const MEGAN = "11111111-1111-4111-8111-111111111111";
const JENNIFER = "22222222-2222-4222-8222-222222222222";
const REFERRAL = "33333333-3333-4333-8333-333333333333";
const LEDGER = "44444444-4444-4444-8444-444444444444";
const AVAIL = "55555555-5555-4555-8555-555555555555";

const meganPending = {
  id: LEDGER,
  user_id: MEGAN,
  amount_cents: 2500,
  status: "pending",
  reason: "referral",
  related_referral_id: REFERRAL,
  vests_at: "2026-08-21T19:00:00.000Z",
  created_at: "2026-08-18T19:00:00.000Z",
};

const profilesById = {
  [MEGAN]: { name: "Megan Onnelly", email: "megan@example.com" },
  [JENNIFER]: { name: "Jennifer", email: "jen@example.com" },
};

const referralsById = {
  [REFERRAL]: {
    id: REFERRAL,
    advocate_user_id: MEGAN,
    referred_user_id: JENNIFER,
    code: "MEGAN25",
    status: "paid",
    credit_ledger_id: LEDGER,
  },
};

const recentReferrals = [{
  id: REFERRAL,
  advocate_user_id: MEGAN,
  referred_user_id: JENNIFER,
  code: "MEGAN25",
  status: "paid",
  credit_ledger_id: LEDGER,
}];

describe("buildCreditsBoard", () => {
  it("lists Megan's pending $25 referral without a search", () => {
    const board = buildCreditsBoard({
      ledgerRows: [meganPending],
      profilesById,
      referralsById,
      recentReferrals,
    });

    expect(board.pending).toHaveLength(1);
    expect(board.pending[0]).toMatchObject({
      userId: MEGAN,
      firstName: "Megan",
      amountCents: 2500,
      amountLabel: "$25",
      why: "Referral",
      landsOn: "Aug 21",
      fromName: "Jennifer",
    });
    expect(board.available).toEqual([]);
    expect(board.referrals[0]).toMatchObject({
      refereeName: "Jennifer",
      advocateName: "Megan",
      code: "MEGAN25",
      amountPaidLabel: "$25",
    });
  });

  it("splits pending vs available and ignores redeemed rows", () => {
    const board = buildCreditsBoard({
      ledgerRows: [
        meganPending,
        {
          id: AVAIL,
          user_id: MEGAN,
          amount_cents: 2500,
          status: "available",
          reason: "manual",
          vests_at: "2026-08-10T19:00:00.000Z",
          created_at: "2026-08-10T19:00:00.000Z",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          user_id: MEGAN,
          amount_cents: 2500,
          status: "redeemed",
          reason: "redemption",
        },
      ],
      profilesById,
      referralsById,
    });

    expect(board.pending.map((r) => r.ledgerId)).toEqual([LEDGER]);
    expect(board.available).toHaveLength(1);
    expect(board.available[0]).toMatchObject({
      firstName: "Megan",
      amountLabel: "$25",
      why: "Manual",
    });
  });

  it("returns empty pending/available lists when there is nothing waiting", () => {
    const board = buildCreditsBoard({
      ledgerRows: [],
      profilesById,
      recentReferrals: [],
      shareCodes: { paidWithCode: 4, paidWithoutCode: 1 },
    });
    expect(board.pending).toEqual([]);
    expect(board.available).toEqual([]);
    expect(board.referrals).toEqual([]);
    expect(board.shareCodes).toEqual({ paidWithCode: 4, paidWithoutCode: 1 });
  });

  it("never puts emails on the board", () => {
    const board = buildCreditsBoard({
      ledgerRows: [meganPending],
      profilesById,
      referralsById,
      recentReferrals,
    });
    expect(JSON.stringify(board)).not.toMatch(/@/);
    expect(JSON.stringify(board)).not.toMatch(/example\.com/);
  });
});

describe("board copy helpers", () => {
  it("formats money and PT dates the way Callie reads them", () => {
    expect(formatMoneyCents(2500)).toBe("$25");
    expect(formatLandsDate("2026-08-21T19:00:00.000Z")).toBe("Aug 21");
    expect(grantSuccessCopy(meganPending)).toBe("Granted $25. It lands Aug 21.");
  });
});
