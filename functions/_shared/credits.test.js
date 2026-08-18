import { describe, expect, it } from "vitest";
import { grantCredit, requireManualGrantNote } from "./credits.js";

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
