import { describe, expect, it } from "vitest";

import { askedForMealOptions, isHalfAskMeal, limitAskMeals } from "./coachAskMeals.js";

const CHICKEN = { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, servings: 1 };
const CHICKEN_HALF = { name: "Chicken bowl", cal: 215, p: 22, c: 15, f: 6, servings: 0.5, title: "Chicken bowl · half portion" };
const SALMON = { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, servings: 1 };

describe("the ask parser caps plates", () => {
  it("keeps one plate when the model sent two full dishes", () => {
    expect(limitAskMeals([CHICKEN, SALMON]).map((m) => m.name)).toEqual(["Chicken bowl"]);
  });

  it("keeps the half portion of that same plate", () => {
    expect(limitAskMeals([CHICKEN, CHICKEN_HALF, SALMON]).map((m) => m.name)).toEqual([
      "Chicken bowl",
      "Chicken bowl",
    ]);
    expect(limitAskMeals([CHICKEN, CHICKEN_HALF])[1].servings).toBe(0.5);
    expect(isHalfAskMeal(CHICKEN, CHICKEN_HALF)).toBe(true);
    expect(isHalfAskMeal(CHICKEN, SALMON)).toBe(false);
  });

  it("gives up to three only when she asked for options", () => {
    expect(askedForMealOptions("give me a few options")).toBe(true);
    expect(askedForMealOptions("what should I eat tonight")).toBe(false);
    expect(limitAskMeals([CHICKEN, SALMON, CHICKEN_HALF], { askedForOptions: true })).toHaveLength(3);
    expect(limitAskMeals([CHICKEN, SALMON], { askedForOptions: false })).toHaveLength(1);
  });
});
