import { describe, expect, it } from "vitest";
import { assertNoMessageBodies, buildClientSummaryPayload } from "./clientSummaryPayload.js";

describe("buildClientSummaryPayload", () => {
  it("omits message bodies and photos", () => {
    const payload = buildClientSummaryPayload({
      client: { name: "Ava Stone", lastActiveDate: "2026-08-29" },
      progress: {
        mealHistoryByDate: {
          "2026-08-29": [{ cal: 1800, p: 120, c: 160, f: 60 }],
        },
        waterLogsByDate: { "2026-08-29": 64 },
        checksByWeek: {},
        goalItems: [],
      },
      weighins: [{ date: "2026-08-29", w: 170 }],
      macros: { cal: 1900, protein: 130, carbs: 170, fat: 65 },
    });
    expect(payload.ranges.cal).toBe(1900);
    expect(payload.meals[0].cal).toBe(1800);
    expect(assertNoMessageBodies(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/attachment|image|photo/i);
    expect(payload.started).toBe(false);
    expect(payload.week).toBeNull();
  });

  it("marks her as not started when ranges are not approved", () => {
    const payload = buildClientSummaryPayload({
      client: { name: "Kristen", programWeek: null, programStarted: false },
    });
    expect(payload.week).toBeNull();
    expect(payload.started).toBe(false);
  });

  it("rejects a payload that includes DM bodies", () => {
    expect(assertNoMessageBodies({ messages: [{ body: "hey mama" }] })).toBe(false);
    expect(assertNoMessageBodies({ summary: "ok" })).toBe(true);
  });
});
