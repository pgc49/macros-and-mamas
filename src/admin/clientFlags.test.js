import { describe, expect, it } from "vitest";
import { buildClientFlagChips, daysSinceIso, losingTooFast } from "./clientFlags.js";

describe("daysSinceIso", () => {
  it("counts calendar days", () => {
    expect(daysSinceIso("2026-08-28", "2026-08-30")).toBe(2);
    expect(daysSinceIso(null, "2026-08-30")).toBeNull();
  });
});

describe("losingTooFast", () => {
  it("flags more than 1.5 lb/wk", () => {
    expect(losingTooFast([
      { date: "2026-08-01", w: 180 },
      { date: "2026-08-15", w: 172 },
    ])).toBe(true);
    expect(losingTooFast([
      { date: "2026-08-01", w: 180 },
      { date: "2026-08-15", w: 178 },
    ])).toBe(false);
  });
});

describe("buildClientFlagChips", () => {
  it("adds quiet and unread chips from roster facts", () => {
    const chips = buildClientFlagChips({
      client: {
        stage: "active",
        status: "active",
        lastActiveDate: "2026-08-26",
        lastAdminAt: "2026-08-01",
        unreadFromMama: 1,
      },
      todayIso: "2026-08-30",
    });
    expect(chips.some((c) => c.id === "quiet")).toBe(true);
    expect(chips.some((c) => c.id === "replied")).toBe(true);
  });
});
