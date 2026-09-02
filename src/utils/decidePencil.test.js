import { describe, expect, it } from "vitest";
import { writeDecidePencil } from "./decidePencil.js";
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
  it("add path stores 1.5× so grey / Ate it match the sheet", () => {
    const { days, replaced } = writeDecidePencil(emptyWeekPlan(), "Wed", TUNA_15, "lunch");
    expect(replaced).toBe(false);
    const row = lunchPencil(days);
    expect(row.qty).toBe(1.5);
    expect(row.via).toBe("decide");
    expect(row.cal).toBeCloseTo(245, 5);
    const shown = decideDisplayMacros(row);
    expect(shown.cal).toBe(368);
    expect(shown.p).toBe(47);
  });

  it("replace path overwrites a leftover qty:1 with the new 1.5×", () => {
    const first = writeDecidePencil(emptyWeekPlan(), "Wed", TUNA_1X, "lunch");
    expect(lunchPencil(first.days).qty).toBe(1);
    const { days, replaced } = writeDecidePencil(first.days, "Wed", TUNA_15, "lunch");
    expect(replaced).toBe(true);
    const row = lunchPencil(days);
    expect(row.qty).toBe(1.5);
    expect(row.cal).toBeCloseTo(245, 5);
    const shown = decideDisplayMacros(row);
    expect(shown.cal).toBe(368);
    expect(shown.p).toBe(47);
  });
});
