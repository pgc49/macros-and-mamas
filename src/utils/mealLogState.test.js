import { describe, expect, it } from "vitest";
import { entriesForLogDate, hydrateTodayLog } from "./mealLogState";

const chocolate = { id: "1", name: "Lindt Dark Chocolate", cal: 170 };

describe("entriesForLogDate", () => {
  it("prefers the week map so a wiped todayLog still shows saved meals", () => {
    expect(entriesForLogDate(
      "2026-09-03",
      { "2026-09-03": [chocolate] },
      { date: "2026-09-03", entries: [] },
    )).toEqual([chocolate]);
  });

  it("falls back to todayLog when the map has no key for that day", () => {
    expect(entriesForLogDate(
      "2026-09-03",
      {},
      { date: "2026-09-03", entries: [chocolate] },
    )).toEqual([chocolate]);
  });

  it("does not show another day's todayLog entries", () => {
    expect(entriesForLogDate(
      "2026-09-02",
      {},
      { date: "2026-09-03", entries: [chocolate] },
    )).toEqual([]);
  });
});

describe("hydrateTodayLog", () => {
  it("uses the week map when todayLog's date drifted off local today", () => {
    const next = hydrateTodayLog({
      todayLog: { date: "2026-09-02", entries: [] },
      mealLogsByDate: { "2026-09-03": [chocolate] },
    }, "2026-09-03");
    expect(next).toEqual({ date: "2026-09-03", entries: [chocolate] });
  });

  it("uses history when the current-week map omitted today", () => {
    const next = hydrateTodayLog({
      todayLog: { date: "2026-09-02", entries: [] },
      mealLogsByDate: {},
      mealHistoryByDate: { "2026-09-03": [chocolate] },
    }, "2026-09-03");
    expect(next).toEqual({ date: "2026-09-03", entries: [chocolate] });
  });

  it("keeps matching todayLog entries when no map row exists", () => {
    const next = hydrateTodayLog({
      todayLog: { date: "2026-09-03", entries: [chocolate] },
    }, "2026-09-03");
    expect(next).toEqual({ date: "2026-09-03", entries: [chocolate] });
  });
});
