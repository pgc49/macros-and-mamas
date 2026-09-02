import { describe, expect, it } from "vitest";
import { removeDecidePencilMatchingLog, writeDecidePencil } from "./decidePencil.js";
import { decideDisplayMacros } from "./decideScale.js";
import { emptyWeekPlan } from "./weekPlan.js";

const TUNA_1X = {
  name: "Tuna salad lettuce wraps",
  cal: 245,
  p: 31,
  c: 28,
  f: 2,
  servings: 1,
};

/** Ranked card already shows 1.5× (368 / P47). */
const TUNA_15 = {
  name: "Tuna salad lettuce wraps",
  cal: 367.5,
  p: 46.5,
  c: 42,
  f: 3,
  servings: 1.5,
};

function lunchPencil(days) {
  return days.find((d) => d.day === "Wed")?.meals?.find((m) => m.slot === "lunch");
}

describe("writeDecidePencil add + replace", () => {
  it("add path stores sheet-scaled macros at qty 1", () => {
    const { days, replaced } = writeDecidePencil(emptyWeekPlan(), "Wed", TUNA_15, "lunch");
    expect(replaced).toBe(false);
    const row = lunchPencil(days);
    expect(row.via).toBe("decide");
    expect(row.qty).toBe(1);
    expect(row.cal).toBe(368);
    expect(row.p).toBe(47);
    const shown = decideDisplayMacros(row);
    expect(shown.cal).toBe(368);
    expect(shown.p).toBe(47);
  });

  it("replace path overwrites a leftover 1× pencil with sheet 1.5× totals", () => {
    const first = writeDecidePencil(emptyWeekPlan(), "Wed", TUNA_1X, "lunch");
    expect(lunchPencil(first.days).cal).toBe(245);
    const { days, replaced } = writeDecidePencil(first.days, "Wed", TUNA_15, "lunch");
    expect(replaced).toBe(true);
    const row = lunchPencil(days);
    expect(row.qty).toBe(1);
    expect(row.cal).toBe(368);
    expect(row.p).toBe(47);
    const shown = decideDisplayMacros(row);
    expect(shown.cal).toBe(368);
    expect(shown.p).toBe(47);
  });
});

describe("removeDecidePencilMatchingLog", () => {
  it("drops the via=decide row after a decide_bank log is deleted", () => {
    const { days } = writeDecidePencil(emptyWeekPlan(), "Wed", TUNA_15, "lunch");
    expect(lunchPencil(days)).toBeTruthy();
    const next = removeDecidePencilMatchingLog(days, "Wed", {
      name: "Tuna salad lettuce wraps · 1.5×",
      slot: "lunch",
      via: "decide_bank",
    });
    expect(lunchPencil(next)).toBeFalsy();
  });
});
