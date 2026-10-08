import { describe, expect, it } from "vitest";

import { macrosPlausible } from "./coachGuardrails.js";
import {
  alignReplyToMeals,
  buildCoachFallbackMeals,
  COACH_CHAIN_ASKS,
  ensureFoodMeals,
  fallbackMealReply,
  foodQuestionLead,
  hideCoachMealMacros,
  replyPlateContract,
} from "./coachFoodFallback.js";
import { extractAskConstraints, mealBreaksSavedPrefs, mealHaystack, mealLooksDairy } from "./coachMealFilter.js";

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

  it("accepts live custom-meal ingredients stored as text", () => {
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
    expect(meals.some((meal) => meal.name === "Mom's lasagna" && meal.fromSaved)).toBe(true);
    expect(meals.length).toBeGreaterThanOrEqual(2);
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
    )).toBe("Those leftovers can wait. Here's Turkey skillet and Salmon and rice.");
    expect(alignReplyToMeals(
      "Here's Grilled chicken and rice, Leftover chicken and rice, or Chicken thighs and rice.",
      meals,
    )).toBe("Here's Turkey skillet and Salmon and rice.");
    expect(alignReplyToMeals(
      "Eat the leftovers. Or turkey meatballs or turkey taco bowl.",
      meals,
    )).not.toMatch(/^Or | Or /);
  });
});

describe("live bank plates", () => {
  it("keeps Chipotle, Starbucks, and Trader Joe's plates on dairy-free", () => {
    const dairy = { allergens: ["dairy"], food_avoids: "cottage cheese", allergen_note: "dairy-free" };
    const chipotle = buildCoachFallbackMeals({ text: "what can I order at Chipotle", slot: "dinner", profile: dairy });
    expect(chipotle.length).toBeGreaterThanOrEqual(2);
    expect(chipotle.every((meal) => meal.orderOnly && meal.source === "menu")).toBe(true);
    expect(chipotle.every((meal) => !mealLooksDairy(meal))).toBe(true);

    const starbucks = buildCoachFallbackMeals({ text: "at Starbucks, what's a good option", slot: "dinner", profile: dairy });
    expect(starbucks.length).toBeGreaterThanOrEqual(2);
    expect(starbucks.every((meal) => meal.orderOnly)).toBe(true);

    const tjs = buildCoachFallbackMeals({ text: "Trader Joe's run, what should I grab for easy lunches", slot: "dinner", profile: dairy });
    expect(tjs.length).toBeGreaterThanOrEqual(2);
    expect(tjs.every((meal) => meal.source === "pantry")).toBe(true);
    expect(tjs.every((meal) => meal.source !== "menu")).toBe(true);
  });

  it("matches snack, walk, sweet, and eggs-and-veg plates to the ask", () => {
    const snack = buildCoachFallbackMeals({ text: "snack before bed?", slot: "dinner" });
    expect(snack.length).toBeGreaterThanOrEqual(2);
    expect(snack.every((meal) => !/teriyaki|taco|salmon/i.test(meal.name))).toBe(true);

    const walk = buildCoachFallbackMeals({ text: "what should I eat before a walk", slot: "dinner" });
    expect(walk.length).toBeGreaterThanOrEqual(2);
    expect(walk.every((meal) => !/teriyaki|meatball|salmon/i.test(meal.name))).toBe(true);

    const sweet = buildCoachFallbackMeals({
      text: "I want something sweet that still fits",
      slot: "dinner",
      profile: { allergens: ["dairy"] },
    });
    expect(sweet.length).toBeGreaterThanOrEqual(2);
    expect(sweet.every((meal) => !mealLooksDairy(meal))).toBe(true);
    expect(sweet.every((meal) => !/teriyaki|meatball|salmon/i.test(meal.name))).toBe(true);

    const eggs = ensureFoodMeals([], { text: "eggs and veggies, what can I make", slot: "dinner" });
    expect(eggs.meals.length).toBeGreaterThanOrEqual(2);
    expect(eggs.meals.every((meal) => /scramble|frittata|omelette|egg/i.test(meal.name))).toBe(true);
    expect(replyPlateContract(eggs.reply, eggs.meals).ok).toBe(true);
    expect(eggs.reply).not.toMatch(/^Here(?:'s| is| are) [^.]+\.\s*$/i);
  });

  it("never says the menu is missing and rewrites prose when a plate is dropped", () => {
    const chick = ensureFoodMeals([], { text: "what's good at Chick-fil-A", slot: "dinner" });
    expect(chick.meals.length).toBeGreaterThanOrEqual(2);
    expect(chick.reply).not.toMatch(/do not have|don'?t have .{0,24}menu|menu details on hand/i);
    expect(replyPlateContract(chick.reply, chick.meals).ok).toBe(true);

    const dropped = alignReplyToMeals(
      "Here's Tuna pouch wrap, Egg bites, and Protein box.",
      [{ name: "Egg bites" }, { name: "Chicken wrap" }],
    );
    expect(dropped).not.toMatch(/Tuna pouch wrap/i);
    expect(replyPlateContract(dropped, [{ name: "Egg bites" }, { name: "Chicken wrap" }]).ok).toBe(true);
  });
});

describe("diet plate matrix", () => {
  const asks = [
    "what should I have for dinner",
    "give me 3 options for dinner",
    "something new please",
    "what should I eat",
    "I'm hungry",
    "lunch ideas",
  ];
  const profiles = [
    { diet: "vegan" },
    { diet: "vegetarian" },
    { diet: "pescatarian" },
    { allergens: ["dairy"] },
    { allergens: ["gluten"] },
    { allergens: ["eggs"] },
    { diet: "vegan", allergens: ["gluten"] },
    { diet: "vegan", allergens: ["eggs"] },
    { diet: "vegetarian", allergens: ["dairy"] },
    { diet: "pescatarian", allergens: ["dairy"] },
    { diet: "vegan", allergens: ["dairy", "gluten"] },
  ];

  it.each(profiles.flatMap((profile) => asks.map((text) => [profile, text])))(
    "fills 3 plates of at least 15g for %j / %s",
    (profile, text) => {
      const meals = buildCoachFallbackMeals({ text, slot: "dinner", profile, count: 3 });
      expect(meals.length).toBeGreaterThanOrEqual(3);
      expect(meals.every((meal) => (Number(meal.p) || 0) >= 15)).toBe(true);
    },
  );
});

describe("hideCoachMealMacros", () => {
  it("keeps the real numbers on the object", () => {
    const hidden = hideCoachMealMacros([
      { name: "Grilled chicken and rice", cal: 430, p: 45, c: 30, f: 12 },
    ]);
    expect(hidden[0]).toMatchObject({ hideMacros: true, cal: 430, p: 45, c: 30, f: 12 });
  });
});

describe("reviewer bank and allergen contracts", () => {
  it("prints the guilt line once and hides card macros", () => {
    const guilt = ensureFoodMeals([], { text: "ugh I ate half a sleeve of cookies", slot: "dinner" });
    const copies = guilt.reply.split("One day doesn't change anything, and you still eat.").length - 1;
    expect(copies).toBe(1);
    expect(guilt.meals.every((meal) => meal.hideMacros && meal.cal > 0)).toBe(true);
    const appetite = ensureFoodMeals([], { text: "honestly I'm not hungry but I should eat?", slot: "dinner" });
    expect(appetite.reply.split("One day doesn't change anything, and you still eat.").length - 1).toBe(1);
    expect(appetite.meals.every((meal) => meal.hideMacros)).toBe(true);
  });

  it("never says Yes — that works on a 1000-calorie ask", () => {
    expect(foodQuestionLead("is it fine to eat 1000 calories a day?", [])).toBe("");
    expect(foodQuestionLead("is 1200 calories ok", [])).toBe("");
    expect(foodQuestionLead("should I skip meals", [])).toBe("");
    const finished = ensureFoodMeals([], {
      text: "is it fine to eat 1000 calories a day?",
      slot: "dinner",
      reply: "No — 1000 calories is too low.",
    });
    expect(finished.reply).not.toMatch(/^Yes — that works/i);
  });

  it("filters chain plates for dairy, vegan, and gluten-free", () => {
    const asks = COACH_CHAIN_ASKS;
    for (const profile of [
      { allergens: ["dairy"] },
      { diet: "vegan" },
      { allergens: ["gluten"] },
    ]) {
      for (const text of asks) {
        const meals = buildCoachFallbackMeals({ text, slot: "dinner", profile, count: 3 });
        expect(meals.length, `${JSON.stringify(profile)} / ${text}`).toBeGreaterThanOrEqual(2);
        expect(meals.every((meal) => !mealBreaksSavedPrefs(meal, profile)), `${JSON.stringify(profile)} / ${text} / ${meals.map((m) => m.name)}`).toBe(true);
      }
    }
  });

  it("builds Jordan Q12 from eggs and vegetables and names those cards", () => {
    const filled = ensureFoodMeals([
      { name: "Greek yogurt + protein powder", cal: 260, p: 40, c: 16, f: 2 },
      { name: "Cottage cheese + fruit", cal: 200, p: 22, c: 16, f: 4 },
      { name: "Protein shake + jerky", cal: 250, p: 36, c: 8, f: 6 },
    ], {
      text: "I want something new. I just have eggs and vegetables in my fridge.",
      slot: "dinner",
    });
    expect(filled.meals.every((meal) => /scramble|frittata|omelette|fried rice|egg/i.test(meal.name))).toBe(true);
    expect(filled.meals.every((meal) => meal.cal > 0 && meal.p > 0)).toBe(true);
    expect(replyPlateContract(filled.reply, filled.meals).ok).toBe(true);
    expect(filled.reply).toMatch(/scramble|frittata|omelette|fried rice/i);
  });

  it("joins Here's something… here's without a lowercase lead", () => {
    const filled = ensureFoodMeals([], { text: "at Starbucks, what's a good option", slot: "dinner" });
    expect(filled.reply).not.toMatch(/\. here's /i);
    expect(filled.reply).toMatch(/Starbucks|Egg bites|Protein|Oatmeal|Chicken wrap/i);
  });

  it("reads sweet, snack, and light from the current ask only", () => {
    const dinner = buildCoachFallbackMeals({
      text: "sweet potato dinner ideas",
      slot: "dinner",
      priorAsks: ["I want something sweet"],
    });
    expect(extractAskConstraints("sweet potato dinner ideas", null, { currentAsk: "sweet potato dinner ideas" }).sweet).toBe(false);
    expect(dinner.some((meal) => /potato|dinner|chicken|salmon|rice/i.test(meal.name + meal.desc))).toBe(true);
    const afterSweet = buildCoachFallbackMeals({
      text: "what should I eat for dinner",
      slot: "dinner",
      priorAsks: ["I want something sweet that still fits"],
    });
    expect(afterSweet.every((meal) => !/teriyaki/i.test(meal.name)) || afterSweet.length >= 2).toBe(true);
    expect(extractAskConstraints("what should I eat for dinner", null, {
      currentAsk: "what should I eat for dinner",
    }).sweet).toBe(false);
  });

  it("fills 3 plates for vegan+soy+gluten, low-carb, and no-cook restricted profiles", () => {
    const vegan = buildCoachFallbackMeals({
      text: "what should I eat for dinner",
      slot: "dinner",
      profile: { diet: "vegan", allergens: ["soy", "gluten"] },
      count: 3,
    });
    expect(vegan.length).toBeGreaterThanOrEqual(3);
    const low = buildCoachFallbackMeals({
      text: "low carb dinner idea",
      slot: "dinner",
      profile: { allergens: ["dairy"] },
      count: 3,
    });
    expect(low.length).toBeGreaterThanOrEqual(3);
    const nocook = buildCoachFallbackMeals({
      text: "no cooking tonight",
      slot: "dinner",
      profile: { allergens: ["dairy"] },
      count: 3,
    });
    expect(nocook.length).toBeGreaterThanOrEqual(3);
  });

  it("gives McDonald's, Subway, and Taco Bell three plates", () => {
    for (const text of ["what's good at McDonald's", "what's good at Subway", "what's good at Taco Bell"]) {
      const meals = buildCoachFallbackMeals({ text, slot: "lunch" });
      expect(meals.length, text).toBeGreaterThanOrEqual(3);
    }
  });
});
