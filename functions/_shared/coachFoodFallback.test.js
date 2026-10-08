import { describe, expect, it } from "vitest";

import { macrosPlausible } from "./coachGuardrails.js";
import {
  buildCoachFallbackMeals,
  ensureFoodMeals,
  fallbackMealReply,
} from "./coachFoodFallback.js";

describe("buildCoachFallbackMeals", () => {
  it("builds a veggie scramble from eggs and vegetables", () => {
    const meals = buildCoachFallbackMeals({
      text: "I want something new. I just have eggs and vegetables in my fridge.",
      slot: "dinner",
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals[0].name).toMatch(/scramble|egg/i);
    for (const meal of meals) expect(macrosPlausible(meal), meal.name).toBe(true);
  });

  it("uses Callie's Italian plates", () => {
    const meals = buildCoachFallbackMeals({ text: "Italian tonight", slot: "dinner", topic: "italian" });
    expect(meals.map((meal) => meal.name).join(" ")).toMatch(/fish|meatball/i);
    expect(meals.length).toBeGreaterThanOrEqual(2);
  });

  it("offers simple safe plates when she is also handing off to Callie", () => {
    const meals = buildCoachFallbackMeals({
      text: "I've been dizzy all day, what should I eat",
      slot: "dinner",
      safe: true,
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.some((meal) => /chicken|yogurt|shake/i.test(meal.name))).toBe(true);
  });

  it("prefers a saved meal when she has one", () => {
    const meals = buildCoachFallbackMeals({
      text: "dinner ideas",
      slot: "dinner",
      customMeals: [{ name: "Sausage scramble", cal: 380, p: 32, c: 12, f: 18 }],
    });
    expect(meals[0].name).toBe("Sausage scramble");
  });
});

describe("ensureFoodMeals", () => {
  it("keeps a real model plate and fills an empty one", () => {
    const kept = ensureFoodMeals([{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }]);
    expect(kept.filled).toBe(false);
    expect(kept.meals).toHaveLength(1);

    const filled = ensureFoodMeals([], { text: "what should I have for dinner", slot: "dinner" });
    expect(filled.filled).toBe(true);
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(filled.reply).toMatch(/Here's /);
    expect(fallbackMealReply(filled.meals)).toMatch(filled.meals[0].name);
  });
});
