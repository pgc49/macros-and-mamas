import { describe, expect, it } from "vitest";
import {
  MEAL_LOG_ROUNDED_NOTE,
  mealLogMacrosWereRounded,
  roundMealLogMacro,
  roundMealLogMacros,
} from "./mealLogMacros";

describe("roundMealLogMacros", () => {
  it("rounds the rosemary-crackers label decimals before a meal_logs write", () => {
    expect(roundMealLogMacros({
      cal: 156,
      p: 1.2,
      c: 27.7,
      f: 4.2,
    })).toEqual({
      cal: 156,
      p: 1,
      c: 28,
      f: 4,
    });
  });

  it("uses Math.round, not truncation (1.5 → 2, 27.5 → 28)", () => {
    expect(roundMealLogMacros({ cal: 155.5, p: 1.5, c: 27.5, f: 4.5 }))
      .toEqual({ cal: 156, p: 2, c: 28, f: 5 });
  });

  it("leaves missing keys off the payload so a name-only patch does not zero macros", () => {
    expect(roundMealLogMacros({ name: "Snack", via: "manual" })).toEqual({});
    expect(roundMealLogMacros({ cal: 100.4 })).toEqual({ cal: 100 });
  });

  it("treats blank / non-numeric as 0", () => {
    expect(roundMealLogMacros({ cal: "", p: "x", c: null, f: undefined }))
      .toEqual({ cal: 0, p: 0, c: 0, f: 0 });
    expect(roundMealLogMacro("")).toBe(0);
    expect(roundMealLogMacro(NaN)).toBe(0);
  });

  it("accepts numeric strings from the I-know-them inputs", () => {
    expect(roundMealLogMacros({
      cal: "156",
      p: "1.2",
      c: "27.7",
      f: "4.2",
    })).toEqual({ cal: 156, p: 1, c: 28, f: 4 });
  });
});

describe("mealLogMacrosWereRounded", () => {
  it("is true when a label decimal would change (1.2 → 1)", () => {
    expect(mealLogMacrosWereRounded({ cal: 156, p: 1.2, c: 27.7, f: 4.2 })).toBe(true);
    expect(mealLogMacrosWereRounded({ cal: "156", p: "1.2", c: "27.7", f: "4.2" })).toBe(true);
  });

  it("is false when every present value is already a whole number", () => {
    expect(mealLogMacrosWereRounded({ cal: 156, p: 1, c: 28, f: 4 })).toBe(false);
    expect(mealLogMacrosWereRounded({ cal: "156", p: "1", c: "28", f: "4" })).toBe(false);
    expect(mealLogMacrosWereRounded({ cal: 156.0, p: 1.0 })).toBe(false);
  });

  it("ignores blank / non-numeric fields so empty P does not look rounded", () => {
    expect(mealLogMacrosWereRounded({ cal: 156, p: "", c: "", f: "" })).toBe(false);
    expect(mealLogMacrosWereRounded({ cal: 200, p: "x" })).toBe(false);
  });

  it("keeps the mama-facing note copy locked", () => {
    expect(MEAL_LOG_ROUNDED_NOTE).toBe("Rounded to nearest whole number");
  });
});
