/**
 * Maya leftover + Jordan honest-take replay. Deterministic builder +
 * classifyAsk. No live writes. Records p50/p95 of the fallback builder.
 */
import { describe, expect, it } from "vitest";

import { classifyAsk, isMealAsk } from "./coachGuardrails.js";
import {
  alignReplyToMeals,
  buildCoachFallbackMeals,
  ensureFoodMeals,
  hideCoachMealMacros,
  warmMealReply,
} from "./coachFoodFallback.js";
import { ingredientList, mealHaystack } from "./coachMealFilter.js";
import { sizeMealsForPersist, sourceTag } from "./coachPlateScale.js";
import { slotNamedInAsk } from "../../src/utils/coachIntent.js";
import { coachSlotFromTime } from "../../src/utils/mealSlots.js";
import { COACH_COPY } from "../../src/content/coachVoice.js";

function names(meals) {
  return (meals || []).map((meal) => meal.name);
}

function setKey(meals) {
  return names(meals).slice().sort().join("|");
}

function macrosOf(name, meals) {
  const meal = meals.find((row) => row.name === name);
  return meal ? { cal: meal.cal, p: meal.p, c: meal.c, f: meal.f } : null;
}

function time(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe("replay harness — Maya leftover + Jordan honest take", () => {
  const times = [];

  it("restaurant asks are order cards, not recipes (Thai + Chipotle)", () => {
    const thai = time(() => buildCoachFallbackMeals({
      text: "Thai takeout tonight, what should I order?",
      slot: "dinner",
    }));
    times.push(thai.ms);
    expect(thai.value.length).toBeGreaterThanOrEqual(2);
    expect(thai.value.length).toBeLessThanOrEqual(3);
    expect(names(thai.value).join(" ")).toMatch(/krapow|larb|curry/i);
    expect(thai.value.every((meal) => meal.source === "menu" && meal.orderOnly)).toBe(true);
    expect(warmMealReply(thai.value, "Thai takeout tonight")).toMatch(/For Thai/i);
    expect(warmMealReply(thai.value, "Thai takeout tonight")).not.toBe(
      "Here's Pad krapow chicken, Chicken larb, or Lighter Thai curry.",
    );

    const chip = time(() => buildCoachFallbackMeals({
      text: "what's a good order at Chipotle",
      slot: "lunch",
    }));
    times.push(chip.ms);
    expect(chip.value.length).toBeGreaterThanOrEqual(2);
    expect(names(chip.value).join(" ")).toMatch(/chipotle/i);
    expect(chip.value.some((meal) => /double chicken|fajita|half rice/i.test(mealHaystack(meal)))).toBe(true);
    expect(chip.value.every((meal) => meal.source === "menu")).toBe(true);
    const sized = sizeMealsForPersist(chip.value, { cal: 900, pNeed: 70, f: 40 }, "lunch", "new");
    expect(sized.every((meal) => meal.servings === 1)).toBe(true);
    expect(sized.every((meal) => !/servings/i.test(meal.title))).toBe(true);
    expect(sized.every((meal) => meal.source === "menu")).toBe(true);
  });

  it("not-tracking hides numbers on the card payload, not only the flag", () => {
    const built = buildCoachFallbackMeals({ text: "dinner ideas, I'm not tracking", slot: "dinner" });
    expect(built.length).toBeGreaterThanOrEqual(2);
    const hidden = hideCoachMealMacros(built);
    expect(hidden.every((meal) => meal.hideMacros && meal.cal > 0 && meal.p > 0)).toBe(true);
    const sized = sizeMealsForPersist(hidden, null, "dinner", "new");
    expect(sized.every((meal) => meal.hideMacros && meal.cal > 0)).toBe(true);
  });

  it("late-night 70g protein gap is no-cook, not a 683-cal dinner", () => {
    const meals = buildCoachFallbackMeals({
      text: "I have 70g of protein left and it's 9pm, I don't want to cook",
      slot: "dinner",
    });
    times.push(0);
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.every((meal) => meal.cal < 500)).toBe(true);
    expect(names(meals).join(" ")).not.toMatch(/halibut/i);
    expect(names(meals).join(" ")).toMatch(/yogurt|tuna|turkey|shake|cottage|jerky/i);
  });

  it("never repeats the same card set, and the same plate keeps its numbers", () => {
    const first = buildCoachFallbackMeals({ text: "what should I eat for dinner", slot: "dinner" });
    const second = buildCoachFallbackMeals({
      text: "something else",
      slot: "dinner",
      skipNames: names(first),
    });
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(second.length).toBeGreaterThanOrEqual(2);
    expect(setKey(second)).not.toBe(setKey(first));
    expect(second.every((meal) => !names(first).includes(meal.name))).toBe(true);

    const tunaA = sizeMealsForPersist(
      buildCoachFallbackMeals({ text: "no cooking, one-handed", slot: "dinner" }),
      { cal: 900, pNeed: 70, f: 40 },
      "dinner",
      "new",
    );
    const tunaB = sizeMealsForPersist(
      buildCoachFallbackMeals({ text: "no cooking, one-handed", slot: "snack" }),
      { cal: 400, pNeed: 20, f: 15 },
      "snack",
      "new",
    );
    const name = "Tuna and crackers";
    const a = macrosOf(name, tunaA);
    const b = macrosOf(name, tunaB);
    if (a && b) expect(a).toEqual(b);
  });

  it("no eggs this week carries forward and drops protein pancakes", () => {
    const meals = buildCoachFallbackMeals({
      text: "something new for breakfast",
      slot: "breakfast",
      priorAsks: ["no eggs this week"],
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.every((meal) => !/\begg/i.test(mealHaystack(meal)))).toBe(true);
    expect(names(meals)).not.toContain("Protein pancakes");
  });

  it("something new skips plates she has already seen", () => {
    const seen = ["Callie's chicken teriyaki", "Salmon + potatoes", "Halibut + rice"];
    const meals = buildCoachFallbackMeals({
      text: "something new",
      slot: "dinner",
      skipNames: seen,
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.every((meal) => !seen.includes(meal.name))).toBe(true);
  });

  it("eat-in-the-car is handheld with no spoon", () => {
    const meals = buildCoachFallbackMeals({
      text: "I have to eat in the car, no spoon",
      slot: "lunch",
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.every((meal) => !/\b(soup|bowl|yogurt|cottage|oatmeal)\b/i.test(meal.name))).toBe(true);
    expect(names(meals).join(" ")).toMatch(/roll-up|wrap|chicken|tuna|jerky/i);
  });

  it("6:40pm and 3am grab get the right slot tag", () => {
    const dinner = new Date("2026-10-08T01:40:00.000Z"); // 6:40pm PDT
    expect(coachSlotFromTime(dinner)).toBe("dinner");
    expect(sourceTag("new", "dinner")).toBe(COACH_COPY.sourceNewBySlot.dinner);
    expect(sourceTag("new", "dinner")).not.toBe(COACH_COPY.sourceNewBySlot.lunch);
    expect(slotNamedInAsk("3am grab")).toBe("snack");
    const threeAm = new Date("2026-10-08T10:00:00.000Z"); // 3:00am PDT
    expect(coachSlotFromTime(threeAm)).toBe("snack");
    expect(sourceTag("new", "snack")).toBe(COACH_COPY.sourceNewBySlot.snack);
  });

  it("warmth ties the intro to what she said", () => {
    const kitchen = buildCoachFallbackMeals({
      text: "I have leftover rotisserie chicken, spinach, and rice",
      slot: "dinner",
    });
    const reply = warmMealReply(kitchen, "I have leftover rotisserie chicken, spinach, and rice");
    expect(reply).toMatch(/since you've got chicken and rice already/i);
    expect(reply).not.toMatch(/^Here's [^.]+\.$/);
  });

  it("tacos get taco plates; meal slots are not padded with toast", () => {
    const tacos = buildCoachFallbackMeals({ text: "can I have tacos?", slot: "dinner" });
    expect(tacos.length).toBeGreaterThanOrEqual(2);
    expect(tacos.filter((meal) => /taco/i.test(meal.name)).length).toBeGreaterThanOrEqual(2);
    expect(names(tacos)).not.toContain("Toast and peanut butter");
  });

  it("inventory and kitchen text drive the first card", () => {
    const meals = buildCoachFallbackMeals({
      text: "I have leftover rotisserie, spinach, and rice — what can I make",
      slot: "dinner",
      mode: "kitchen",
    });
    expect(meals[0].name).toMatch(/rotisserie|chicken/i);
    expect(ingredientList(meals[0]).length).toBeGreaterThanOrEqual(2);
  });

  it("had-chicken is current-ask only, so a later Chipotle ask still has chicken", () => {
    const meals = buildCoachFallbackMeals({
      text: "what's good at Chipotle",
      slot: "dinner",
      priorAsks: ["I had chicken at lunch"],
    });
    expect(meals.some((meal) => /chicken/i.test(mealHaystack(meal)))).toBe(true);
  });

  it("unclear Callie questions are not meal asks", () => {
    for (const text of [
      "I keep crying and I don't know why",
      "I feel really down lately",
      "my c-section scar is oozing",
      "I have a UTI",
      "how do I get my baby to sleep",
    ]) {
      expect(isMealAsk(text), text).toBe(false);
      expect(["mood", "off_topic", "urgent"].includes(classifyAsk(text).scope), text).toBe(true);
    }
    expect(isMealAsk("what should I eat for dinner")).toBe(true);
    expect(isMealAsk("kitchen photo", { mode: "kitchen" })).toBe(true);
  });

  it("alignReplyToMeals never names a plate that is not shown", () => {
    const shown = [{ name: "Chicken tacos" }, { name: "Steak tacos" }];
    const reply = alignReplyToMeals(
      "Here's Halibut + rice, Salmon + potatoes, or Callie's chicken teriyaki.",
      shown,
    );
    expect(reply).not.toMatch(/Halibut|Salmon \+|teriyaki/i);
    expect(reply).toMatch(/Chicken tacos|Steak tacos/);
  });

  it("accepts live custom-meal ingredient text without throwing", () => {
    const meals = buildCoachFallbackMeals({
      text: "we're going to an italian place tonight",
      slot: "dinner",
      topic: "italian",
      customMeals: [{
        name: "Mom's lasagna",
        cal: 520,
        p: 28,
        c: 48,
        f: 22,
        ingredients: "noodles; ricotta; beef; sauce",
      }],
    });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.some((meal) => meal.fromSaved && meal.name === "Mom's lasagna")).toBe(true);
  });

  it("records builder p50/p95 under 50ms", () => {
    const asks = [
      "what should I eat for dinner",
      "Thai takeout tonight",
      "Chipotle bowl",
      "no eggs this week, breakfast",
      "eat in the car",
      "70g protein left, no cooking",
      "something new",
      "can I have tacos?",
      "kitchen leftovers chicken rice",
      "one-handed holding the baby",
    ];
    for (const text of asks) {
      const start = performance.now();
      buildCoachFallbackMeals({ text, slot: "dinner" });
      times.push(performance.now() - start);
    }
    const sorted = times.filter((n) => n > 0).sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const p50 = at(0.5);
    const p95 = at(0.95);
    expect(p50).toBeLessThan(50);
    expect(p95).toBeLessThan(80);
  });

  it("ensureFoodMeals still returns 2–3 after a filter wipe", () => {
    const filled = ensureFoodMeals(
      [{ name: "Toast and peanut butter", cal: 250, p: 10, c: 26, f: 12 }],
      { text: "dinner ideas", profile: { allergens: ["gluten", "peanuts"] }, slot: "dinner" },
    );
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(filled.meals.every((meal) => !/toast|peanut|cracker|bread/i.test(mealHaystack(meal)))).toBe(true);
  });
});
