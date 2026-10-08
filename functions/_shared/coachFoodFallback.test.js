import { describe, expect, it } from "vitest";

import { macrosPlausible } from "./coachGuardrails.js";
import {
  alignReplyToMeals,
  buildCoachFallbackMeals,
  ensureFoodMeals,
  fallbackMealReply,
} from "./coachFoodFallback.js";
import { mealHaystack } from "./coachMealFilter.js";

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

  it("prefers a saved meal when she has one and marks it fromSaved", () => {
    const meals = buildCoachFallbackMeals({
      text: "dinner ideas",
      slot: "dinner",
      customMeals: [{ name: "Sausage scramble", cal: 380, p: 32, c: 12, f: 18 }],
    });
    expect(meals[0].name).toBe("Sausage scramble");
    expect(meals[0].fromSaved).toBe(true);
    expect(meals.length).toBeGreaterThanOrEqual(2);
  });

  it("never returns peanut butter when she has a peanut allergy", () => {
    const meals = buildCoachFallbackMeals({
      text: "dinner ideas",
      slot: "dinner",
      profile: { allergens: ["peanuts"] },
    });
    expect(meals.length).toBeGreaterThanOrEqual(1);
    expect(meals.every((meal) => !/peanut/i.test(`${meal.name} ${meal.desc}`))).toBe(true);
  });

  it("uses thread-wide constraints when the phone drops already-suggested plates", () => {
    const chickenSkip = [
      "Grilled chicken and rice",
      "Leftover chicken and rice",
      "Chicken thighs and rice",
    ];
    const noChicken = buildCoachFallbackMeals({
      text: "something else, I had chicken at lunch too",
      slot: "dinner",
      skipNames: chickenSkip,
      priorAsks: ["chicken dinner"],
    });
    expect(noChicken.length).toBeGreaterThanOrEqual(2);
    expect(noChicken.every((meal) => !/chicken/i.test(mealHaystack(meal)))).toBe(true);

    const noEggs = buildCoachFallbackMeals({
      text: "no eggs, what about breakfast",
      slot: "breakfast",
      skipNames: ["Sausage, egg + whites", "Veggie scramble"],
      priorAsks: ["I had leftover chicken last night"],
    });
    expect(noEggs.length).toBeGreaterThanOrEqual(2);
    expect(noEggs.every((meal) => !/\begg/i.test(mealHaystack(meal)))).toBe(true);
    expect(noEggs.every((meal) => !/leftover chicken/i.test(meal.name))).toBe(true);
  });

  it("includes a no-prep plate when her hands are full", () => {
    const meals = buildCoachFallbackMeals({
      text: "one-handed, I'm holding the baby and too tired to cook",
      slot: "dinner",
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.some((meal) => /rotisserie|tuna|apple|cracker/i.test(meal.name))).toBe(true);
  });
});

describe("ensureFoodMeals", () => {
  it("keeps a real model plate and fills an empty one", () => {
    const kept = ensureFoodMeals([{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }]);
    expect(kept.filled).toBe(true);
    expect(kept.meals.length).toBeGreaterThanOrEqual(2);
    expect(kept.meals[0].name).toBe("Chicken bowl");

    const filled = ensureFoodMeals([], { text: "what should I have for dinner", slot: "dinner" });
    expect(filled.filled).toBe(true);
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(new Set(filled.meals.map((meal) => meal.name)).size).toBe(filled.meals.length);
    expect(filled.reply).toMatch(/Here's |Here are a few easy ones that work for today/);
  });

  it("never puts a custom meal name in the reply body", () => {
    const filled = ensureFoodMeals([], {
      text: "dinner ideas",
      slot: "dinner",
      customMeals: [{ name: "Grandma's Secret Casserole XYZ", cal: 380, p: 32, c: 12, f: 18 }],
    });
    expect(filled.meals.some((meal) => meal.fromSaved)).toBe(true);
    expect(filled.reply).toBe("Here are a few easy ones that work for today.");
    expect(filled.reply).not.toMatch(/Grandma's Secret Casserole XYZ/);
    expect(fallbackMealReply(filled.meals)).not.toMatch(/Grandma's Secret/);
  });
});

describe("alignReplyToMeals", () => {
  it("keeps warm prose and only rewrites a trailing offer that names a dropped plate", () => {
    const meals = [
      { name: "Turkey skillet" },
      { name: "Salmon and rice" },
    ];
    expect(alignReplyToMeals(
      "Those leftovers can wait. Here's Grilled chicken and rice, Turkey skillet, or Salmon and rice.",
      meals,
    )).toBe("Those leftovers can wait. Or Turkey skillet or Salmon and rice.");
    expect(alignReplyToMeals(
      "Here's Grilled chicken and rice, Leftover chicken and rice, or Chicken thighs and rice.",
      meals,
    )).toBe("Here's Turkey skillet, or Salmon and rice.");
  });
});
