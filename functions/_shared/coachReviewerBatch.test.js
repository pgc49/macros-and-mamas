import { describe, expect, it } from "vitest";

import { classifyAsk, isSkipTonightAsk, isVeryLowCalorieAsk } from "./coachGuardrails.js";
import { currentRestoresFood, mealHaystack } from "./coachMealFilter.js";
import {
  allCoachChainPlates,
  alignReplyToMeals,
  buildCoachFallbackMeals,
  countShownCards,
  ensureFoodMeals,
  foodQuestionLead,
  joinLeadOffer,
  replyPlateContract,
} from "./coachFoodFallback.js";
import { followUpKind, pickLastCard, spicePlate } from "./coachFollowUp.js";
import { mealHitsToken } from "../../src/utils/coachPrefs.js";
import { localCoachTeach, teachBody } from "../../src/utils/coachTeach.js";
import { COACH_MOOD_FOOD, COACH_MOOD_WEEKS, coachDeflectLine } from "../../src/content/coachVoice.js";
import { deflectLine } from "../../src/admin/adminCoachThread.js";
import { fitCoachPlates } from "./coachPlateScale.js";

describe("restriction yes-lead and doors", () => {
  it("never says Yes — that works on restriction or skip-tonight asks", () => {
    const asks = [
      "is it ok to eat 1 meal a day while nursing?",
      "only 2 meals a day?",
      "just don't eat dinner tonight?",
      "is it fine to eat 1000 calories a day?",
      "fast 16 hours while nursing?",
    ];
    for (const ask of asks) {
      expect(foodQuestionLead(ask, [{ name: "Rice" }]), ask).not.toMatch(/Yes — that works/i);
    }
  });

  it("gives a fuel line and hidden-number plates for skip dinner tonight", () => {
    const filled = ensureFoodMeals([], { text: "just don't eat dinner tonight?", slot: "dinner" });
    expect(isSkipTonightAsk("just don't eat dinner tonight?")).toBe(true);
    expect(filled.reply).toMatch(/needs fuel/i);
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(filled.meals.every((meal) => meal.hideMacros)).toBe(true);
  });

  it("routes 1-2 meals a day and low calories to disordered", () => {
    expect(classifyAsk("is it ok to eat 1 meal a day while nursing?").scope).toBe("disordered");
    expect(classifyAsk("only 2 meals a day?").scope).toBe("disordered");
    expect(isVeryLowCalorieAsk("under 1400 calories a day ok?")).toBe(true);
    expect(isVeryLowCalorieAsk("is 1800 calories ok")).toBe(false);
  });
});

describe("follow-ups", () => {
  const last = [
    { name: "Veggie scramble", steps: ["Scramble the eggs."] },
    { name: "Veggie frittata", steps: ["Bake the frittata."] },
    { name: "Egg and veg fried rice", steps: ["Fry the rice."] },
  ];

  it("resolves first/second/third and close", () => {
    expect(followUpKind("no thanks")).toBe("close");
    expect(followUpKind("yes please")).toBe("more");
    expect(followUpKind("make it spicier")).toBe("spicier");
    expect(followUpKind("too much work")).toBe("easier");
    expect(pickLastCard("the second one sounds good, how do I make it", last).name).toBe("Veggie frittata");
    expect(spicePlate(last[0]).name).toMatch(/spicier/i);
  });
});

describe("copy joins", () => {
  const leads = [
    "At Chipotle, ",
    "For Thai tonight, ",
    "Here's something that fits what you asked. ",
    "you can whip these up in just a couple of minutes!",
  ];
  const offers = [
    "Here's Chipotle chicken bowl, Steak burrito bowl, and Chicken tacos.",
    "Chicken pad krapow, Chicken larb, and Chicken satay plate.",
    "Egg bites, Protein box, and Turkey bacon sandwich.",
  ];

  it.each(leads.flatMap((lead) => offers.map((offer) => [lead, offer])))(
    "joins %j × %j without , . or these of",
    (lead, offer) => {
      const joined = countShownCards(joinLeadOffer(lead, offer), [
        { name: "One" }, { name: "Two" }, { name: "Three" },
      ]);
      expect(joined).not.toMatch(/,\./);
      expect(joined).not.toMatch(/^[^.]+,\.\s/);
      expect(joined).not.toMatch(/these of minutes/i);
      expect(joined.charAt(0)).toBe(joined.charAt(0).toUpperCase());
    },
  );
});

describe("eggs override and kitchen / takeout / yogurt / spinach", () => {
  it("Jordan Q12: later I have eggs clears no eggs this week", () => {
    expect(currentRestoresFood("I just have eggs and vegetables", "eggs")).toBe(true);
    const filled = ensureFoodMeals([], {
      text: "I just have eggs and vegetables",
      slot: "dinner",
      priorAsks: ["no eggs this week", "something new for breakfast"],
    });
    expect(filled.meals.some((meal) => /scramble|frittata|omelette|fried rice|egg/i.test(meal.name))).toBe(true);
    expect(filled.meals.every((meal) => !/tuna pouch|protein bar|protein powder/i.test(meal.name))).toBe(true);
  });

  it("kitchen photo and takeout drive the right plates", () => {
    const kitchen = buildCoachFallbackMeals({
      text: "what can I make",
      slot: "dinner",
      mode: "kitchen",
    });
    expect(kitchen.length).toBeGreaterThanOrEqual(2);
    expect(kitchen.every((meal) => meal.source !== "menu")).toBe(true);

    const takeout = buildCoachFallbackMeals({
      text: "we're getting takeout, what's a good order",
      slot: "dinner",
    });
    expect(takeout.length).toBeGreaterThanOrEqual(2);
    expect(takeout.every((meal) => meal.orderOnly)).toBe(true);

    const thaiMex = buildCoachFallbackMeals({
      text: "for dinner im too tired to cook, partner can grab takeout, thai or mexican?",
      slot: "dinner",
    });
    expect(thaiMex.length).toBeGreaterThanOrEqual(3);
    expect(thaiMex.every((meal) => meal.orderOnly)).toBe(true);
    expect(replyPlateContract(ensureFoodMeals(thaiMex, { text: "thai or mexican?", slot: "dinner" }).reply, thaiMex.slice(0, 3)).ok).toBe(true);
  });

  it("answers yogurt and no-spinach asks on fallback", () => {
    const yogurt = buildCoachFallbackMeals({ text: "can I have yogurt?", slot: "snack" });
    expect(yogurt.some((meal) => /yogurt/i.test(meal.name))).toBe(true);
    const swap = buildCoachFallbackMeals({ text: "I don't have spinach, swap?", slot: "dinner" });
    expect(swap.every((meal) => !/spinach/i.test(mealHaystack(meal)))).toBe(true);
    expect(swap.length).toBeGreaterThanOrEqual(2);
  });
});

describe("chain allergen audit", () => {
  it("tags every chain plate from its ingredient words", () => {
    const plates = allCoachChainPlates();
    expect(plates.some((meal) => /egg white bite/i.test(meal.name))).toBe(false);
    for (const meal of plates) {
      const hay = mealHaystack(meal).toLowerCase();
      if (/\b(english muffin|bun|bread|tortilla|wrap|sandwich|muffin|wheat|flour)\b/.test(hay)) {
        expect(mealHitsToken(meal, "wheat") || mealHitsToken(meal, "bun") || mealHitsToken(meal, "bread") || mealHitsToken(meal, "tortilla") || mealHitsToken(meal, "wrap") || mealHitsToken(meal, "sandwich") || mealHitsToken(meal, "muffin"), meal.name).toBe(true);
      }
      if (/\b(soy sauce|teriyaki)\b/.test(hay)) {
        expect(mealHitsToken(meal, "soy") || mealHitsToken(meal, "soy sauce") || mealHitsToken(meal, "teriyaki"), meal.name).toBe(true);
      }
      if (/\b(anchovy|caesar|fish sauce)\b/.test(hay)) {
        expect(mealHitsToken(meal, "fish") || mealHitsToken(meal, "anchovy") || mealHitsToken(meal, "caesar"), meal.name).toBe(true);
      }
    }
  });
});

describe("restricted mama plate counts and budget cliff", () => {
  it("gives vegan+soy+gluten and vegetarian+dairy+eggs 3 plates on 5 asks", () => {
    const asks = [
      "what should I have for dinner",
      "something else please",
      "another dinner idea",
      "what else can I eat",
      "one more dinner",
    ];
    for (const profile of [
      { diet: "vegan", allergens: ["soy", "gluten"] },
      { diet: "vegetarian", allergens: ["dairy", "eggs"] },
    ]) {
      const skip = [];
      for (const text of asks) {
        const meals = buildCoachFallbackMeals({ text, slot: "dinner", profile, skipNames: skip, count: 3 });
        expect(meals.length, `${JSON.stringify(profile)} / ${text}`).toBeGreaterThanOrEqual(3);
        expect(meals.every((meal) => (Number(meal.p) || 0) >= 15 || /snack|light/i.test(text))).toBe(true);
        skip.push(...meals.map((meal) => meal.name));
      }
    }
  });

  it("refills a late-day leftover with light plates", () => {
    const meals = [
      { name: "Chicken soba stir fry", cal: 805, p: 70, c: 74, f: 25 },
      { name: "Turkey and rice", cal: 430, p: 32, c: 48, f: 10 },
      { name: "Apple and almonds", cal: 220, p: 6, c: 24, f: 12 },
    ];
    const fitted = fitCoachPlates(meals, { cal: 300, f: 20 }, "dinner");
    expect(fitted.length).toBeGreaterThanOrEqual(2);
    expect(alignReplyToMeals("Here's Chicken soba stir fry, Turkey and rice, and Apple and almonds.", fitted)).not.toMatch(/Here's .{0,80}, .{0,80}, and /);
  });
});

describe("teach stems, mood weeks, and symptom count", () => {
  it("matches nursing / breastfeeding on sushi and wine", () => {
    expect(localCoachTeach("can I have sushi while nursing")?.topic).toBe("sushiNursing");
    expect(localCoachTeach("is one glass of wine ok while breastfeeding")?.topic).toBe("alcoholNursing");
    expect(localCoachTeach("should i be eating more or drinking more water or something?")?.topic).toBe("waterEat");
    expect(teachBody("waterEat")).toMatch(/eat|water/i);
  });

  it("rebuilds the mood-with-food admin line and the weeks line", () => {
    const line = deflectLine({
      payload: {
        deflect: "mood",
        weeks: true,
        cards: [{ name: "Toast and peanut butter" }],
      },
    });
    expect(line).toMatch(/not behind|weeks/i);
    expect(line).toContain(COACH_MOOD_FOOD);
    expect(coachDeflectLine("mood", { weeks: true })).toBe(COACH_MOOD_WEEKS);
  });

  it("gives a symptom ask 1-2 snack cards", () => {
    const filled = ensureFoodMeals([], { text: "I've been dizzy, what can I eat", slot: "snack", safe: true, count: 2 });
    expect(filled.meals.length).toBeLessThanOrEqual(2);
    expect(filled.meals.length).toBeGreaterThanOrEqual(1);
  });
});
