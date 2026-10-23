import { describe, expect, it } from "vitest";
import { creditsPayloadForUi, grantCredit, requireManualGrantNote } from "./credits.js";

const USER = "11111111-1111-4111-8111-111111111111";

describe("requireManualGrantNote", () => {
  it("requires a note for a manual grant", () => {
    expect(() => requireManualGrantNote("", "manual")).toThrow(/note required/);
    expect(() => requireManualGrantNote("   ", "manual")).toThrow(/note required/);
    expect(requireManualGrantNote("Callie said yes", "manual")).toBe("Callie said yes");
  });

  it("does not require a note for referral grants", () => {
    expect(requireManualGrantNote("", "referral")).toBe("");
  });
});

describe("grantCredit", () => {
  it("still rejects a manual grant without a note before any write", async () => {
    await expect(grantCredit({}, {
      userId: USER,
      amountCents: 2500,
      reason: "manual",
      note: "",
    })).rejects.toThrow(/note required/);

    await expect(grantCredit({}, {
      userId: USER,
      amountCents: 2500,
      reason: "manual",
      note: "   ",
    })).rejects.toThrow(/note required/);
  });
});

describe("creditsPayloadForUi", () => {
  it("tells her two referrals cover a month of the $49 membership", () => {
    const payload = creditsPayloadForUi([{
      id: "row-1",
      amount_cents: 2500,
      status: "pending",
      reason: "referral",
      vests_at: "2026-10-26T00:00:00.000Z",
      note: "",
    }]);
    expect(payload.copy).toMatch(/Two referrals are \$50/);
    expect(payload.copy).toMatch(/\$49 membership/);
    expect(payload.copy).toMatch(/Credits stack/);
  });
});
