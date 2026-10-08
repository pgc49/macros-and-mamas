import { describe, expect, it } from "vitest";

import { askedForMealOptions, askedMealCount, isHalfAskMeal, limitAskMeals } from "./coachAskMeals.js";

const CHICKEN = { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, servings: 1 };
const CHICKEN_HALF = { name: "Chicken bowl", cal: 215, p: 22, c: 15, f: 6, servings: 0.5, title: "Chicken bowl · half portion" };
const SALMON = { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, servings: 1 };

describe("the ask parser keeps 2–3 distinct plates", () => {
  it("keeps two full dishes and drops a half of one already shown", () => {
    expect(limitAskMeals([CHICKEN, SALMON]).map((m) => m.name)).toEqual(["Chicken bowl", "Salmon and rice"]);
    expect(limitAskMeals([CHICKEN, CHICKEN_HALF, SALMON]).map((m) => m.name)).toEqual([
      "Chicken bowl",
      "Salmon and rice",
    ]);
    expect(isHalfAskMeal(CHICKEN, CHICKEN_HALF)).toBe(true);
    expect(isHalfAskMeal(CHICKEN, SALMON)).toBe(false);
  });

  it("defaults food asks to three plates", () => {
    expect(askedForMealOptions("give me a few options")).toBe(true);
    expect(askedForMealOptions("what should I eat tonight")).toBe(false);
    expect(askedMealCount("give me 3 options for dinner")).toBe(3);
    expect(askedMealCount("what should I eat tonight")).toBe(3);
    expect(askedMealCount("give me 1 option")).toBe(2);
  });
});
