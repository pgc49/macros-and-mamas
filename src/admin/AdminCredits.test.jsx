// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

import { AdminCredits } from "./AdminCredits.jsx";

const MEGAN = "11111111-1111-4111-8111-111111111111";
const JENNIFER = "22222222-2222-4222-8222-222222222222";

const meganBoard = {
  view: "board",
  vestingDays: 3,
  pending: [{
    ledgerId: "44444444-4444-4444-8444-444444444444",
    userId: MEGAN,
    firstName: "Megan",
    amountCents: 2500,
    amountLabel: "$25",
    why: "Referral",
    landsOn: "Aug 21",
    fromName: "Jennifer",
  }],
  available: [],
  referrals: [{
    id: "33333333-3333-4333-8333-333333333333",
    refereeUserId: JENNIFER,
    advocateUserId: MEGAN,
    refereeName: "Jennifer",
    advocateName: "Megan",
    code: "MEGAN25",
    status: "paid",
    amountPaidLabel: "$25",
  }],
  shareCodes: { paidWithCode: 12, paidWithoutCode: 2 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const href = String(url);
    if (href.includes("/api/admin-credits") && !href.includes("userId=") && !href.includes("email=")) {
      return { ok: true, json: async () => meganBoard };
    }
    return { ok: false, json: async () => ({ error: "not mocked" }) };
  }));
});

describe("AdminCredits board", () => {
  it("shows Megan's pending $25 on open without a search", async () => {
    render(<AdminCredits roster={[]} />);

    expect(screen.getByText(/Credits apply to membership or Lab Review/)).toBeTruthy();
    expect(screen.queryByText(/credits-cron/i)).toBeNull();
    expect(screen.queryByText(/ledger rows/i)).toBeNull();

    await waitFor(() => {
      expect(screen.getByText(/Megan · \$25/)).toBeTruthy();
    });
    expect(screen.getByText(/Referral · lands Aug 21 · from Jennifer/)).toBeTruthy();
    expect(screen.getByText(/MEGAN25/)).toBeTruthy();
    expect(screen.getByText("Give everyone a share code")).toBeTruthy();
    expect(screen.queryByText("Backfill referral codes")).toBeNull();
    expect(screen.queryByText("Find mama")).toBeNull();
  });

  it("shows the empty pending copy when nothing is waiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...meganBoard,
        pending: [],
        available: [],
        referrals: [],
      }),
    })));

    render(<AdminCredits roster={[]} />);
    await waitFor(() => {
      expect(screen.getByText("No credits waiting.")).toBeTruthy();
    });
  });
});
