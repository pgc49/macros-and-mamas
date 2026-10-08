import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEAL_SHARES,
  budgetAsRemaining,
  computeSlotBudget,
  coachTakenSlots,
  deriveMealShares,
  snackHabitFromHistory,
  isOverDay,
  laterSlotsAfter,
  skippedSlotsBefore,
  loggedSlotsFromEntries,
  nextCoachSlot,
  attachDayHighs,
  remainingForCoach,
  resolveCoachShares,
  unmatchedCoachPencils,
} from "./coachBudget.js";
import { buildCoachCard, cardsWithShownReason, coachReason, firstPaintPlates, pickScale, plateTiedReason, rankBankCards, proteinOverNote, shownCoachReason } from "./coachRank.js";
import { sizeMealsForPersist } from "./coachPlateScale.js";
import { buildCoachAnswer, pruneStaleMyMealCards, replayCoachMessages, resolveCoachSlot } from "./coachSession.js";
import { nextCustomMeals } from "./coachMyMeals.js";
import { coachSlotFromTime } from "./mealSlots.js";
import { coachLogFromCard, coachPlanFieldsFromCard, unscaleRankedCard } from "./coachScale.js";
import {
  coachPrefsFromProfile,
  mealAllowedForDiet,
  mealHitsDislike,
  namesMatch,
  primaryProtein,
} from "./coachPrefs.js";
import { coachEntryHint, coachRead, leftLine, macroStanding, shownCoachLead, slotLeftRead, tightestMacro, budgetSentence } from "./coachLines.js";
import { formatRangeProgress } from "./rangeProgress.js";
import { mealFitsRemaining } from "./eatingOutImpact.js";
import { targetBands } from "./weekPlan.js";
import { COACH_COPY, skipMealCopy } from "../content/coachVoice.js";

const MACROS = { cal: 1750, protein: 140, carbs: 160, fat: 55 };
const BANDS = targetBands(MACROS);

/**
 * Pacific wall clock as absolute instants. Host timezone must not matter:
 * 8:00am PDT, 1:00pm PDT, 3:00pm PDT, 6:30pm PDT, and the lived 9:07pm PDT.
 */
const MORNING = new Date("2026-09-04T15:00:00.000Z");
const ONE_PM = new Date("2026-09-04T20:00:00.000Z");
const AFTERNOON = new Date("2026-09-04T22:00:00.000Z");
const EVENING = new Date("2026-09-05T01:30:00.000Z");
const LIVED_EVENING = new Date("2026-10-01T04:07:00.000Z");

function budgetFor(totals, opts = {}) {
  return attachDayHighs(
    computeSlotBudget({
      totals,
      bands: BANDS,
      slot: opts.slot || "dinner",
      plannedMeals: opts.plannedMeals || [],
      shares: opts.shares || DEFAULT_MEAL_SHARES,
      loggedSlots: opts.loggedSlots || loggedSlotsFromEntries(opts.entries || []),
      snackCount: opts.snackCount ?? 1,
      // Late enough that an unlogged breakfast reads as skipped rather than
      // still to come, which is what most of these cases are about.
      now: opts.now || EVENING,
    }),
    BANDS,
  );
}

describe("protein is a floor, not a wall", () => {
  it("keeps a lean high-protein meal that the day-level fit rule rejects", () => {
    // 120g of her 140-150g protein range is already logged, so only 30g of
    // headroom is left at the top. A 45g-protein chicken bowl is exactly the
    // meal she should be shown.
    const totals = { cal: 900, p: 120, c: 80, f: 25 };
    const meal = { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 };

    const dayRemaining = {
      cal: BANDS.calHi - totals.cal,
      p: BANDS.pHi - totals.p,
      c: BANDS.cHi - totals.c,
      f: BANDS.fHi - totals.f,
    };
    expect(mealFitsRemaining(meal, dayRemaining)).toBe(false);

    const budget = budgetFor(totals, { slot: "dinner", loggedSlots: new Set(["breakfast", "lunch"]) });
    expect(pickScale(meal, budget)).toBe(1);
  });

  it("never lets protein bound the fit check", () => {
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budgetAsRemaining(budget).p).toBe(Number.POSITIVE_INFINITY);
  });

  it("still rejects on calories and fat, and lets carbs go over", () => {
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budgetAsRemaining(budget).c).toBe(Number.POSITIVE_INFINITY);
    expect(pickScale({ name: "Huge", cal: 2000, p: 40, c: 40, f: 20 }, budget)).toBe(null);
    expect(pickScale({ name: "Fatty", cal: 400, p: 40, c: 10, f: 90 }, budget)).toBe(null);
    // High carb, fat in range: Callie said carbs can go over when fat does not.
    expect(pickScale({ name: "Carby", cal: 400, p: 10, c: 200, f: 5 }, budget)).toBe(1);
  });

  it("does not double the portion once the protein need is covered", () => {
    // With protein unbounded, nothing else stops a 2x upscale from eating the
    // whole evening's calories to chase protein she already has.
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budget.pNeed).toBeLessThan(45);
    expect(pickScale({ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }, budget)).toBe(1);
  });

  it("drops or sizes the same nine plates the screen would", () => {
    const dinner = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    const hungry = budgetFor({ cal: 300, p: 15, c: 25, f: 8 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    const cases = [
      { label: "1x fits, protein covered", meal: { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }, budget: dinner },
      { label: "1x fits, protein short so upscale", meal: { name: "Small plate", cal: 300, p: 22, c: 20, f: 8 }, budget: hungry },
      { label: "1x fits, stay 1 when protein is already covered", meal: { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }, budget: dinner },
      { label: "half when only half fits", meal: { name: "Big bowl", cal: dinner.cal + 40, p: 40, c: 40, f: Math.max(1, dinner.f - 2) }, budget: dinner },
      { label: "drop calories", meal: { name: "Huge", cal: 2000, p: 40, c: 40, f: 20 }, budget: dinner },
      { label: "drop fat", meal: { name: "Fatty", cal: 400, p: 40, c: 10, f: 90 }, budget: dinner },
      { label: "keep carby when fat fits", meal: { name: "Carby", cal: 400, p: 10, c: 200, f: 5 }, budget: dinner },
      { label: "drop when neither 1 nor 0.5 fits", meal: { name: "Giant", cal: 5000, p: 80, c: 80, f: 80 }, budget: dinner },
      { label: "no calorie budget keeps 1", meal: { name: "Anything", cal: 2000, p: 40, c: 40, f: 90 }, budget: { pNeed: 40 } },
    ];
    expect(cases).toHaveLength(9);
    for (const { label, meal, budget } of cases) {
      const scale = budget?.cal ? pickScale(meal, budget) : 1;
      const saved = sizeMealsForPersist([meal], budget, "dinner", "bank");
      if (scale == null) {
        expect(saved, label).toEqual([]);
      } else {
        expect(saved, label).toHaveLength(1);
        expect(saved[0].servings, label).toBe(scale);
      }
    }
  });

  it("still offers a bigger portion when the single serving leaves her short", () => {
    const budget = budgetFor({ cal: 300, p: 15, c: 25, f: 8 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budget.pNeed).toBeGreaterThan(40);
    expect(pickScale({ name: "Small plate", cal: 300, p: 22, c: 20, f: 8 }, budget)).toBeGreaterThan(1);
  });

  it("flags a card that runs past the top of protein, and says when it's too much", () => {
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    // Day high leftover is ~30g (150 - 120). 12g over is fine; 25g over is not.
    expect(proteinOverNote({ p: 42 }, budget)).toBe(COACH_COPY.proteinOver);
    expect(proteinOverNote({ p: 56 }, budget)).toBe(COACH_COPY.proteinOverMuch);
    expect(proteinOverNote({ p: 10 }, budget)).toBe(null);
  });

  it("reads the day's protein headroom, not the slot's share of it", () => {
    // 8:29am, one chocolate logged, asking about a snack. The snack's share of
    // what is left is ~12g of protein, so a 24g yogurt clears it easily — but
    // she is 137g short of her range and nothing about it is "over the top".
    const budget = budgetFor({ cal: 170, p: 3, c: 14, f: 11 }, {
      slot: "snack",
      loggedSlots: new Set(["snack"]),
      now: MORNING,
    });
    expect(budget.pHigh).toBeLessThan(20);
    expect(budget.remaining.pHigh).toBeGreaterThan(140);
    expect(proteinOverNote({ p: 24 }, budget)).toBe(null);
  });

  it("does not call a protein overshoot an over day", () => {
    expect(isOverDay(remainingForCoach({ cal: 900, p: 200, c: 80, f: 25 }, BANDS))).toBe(false);
    expect(isOverDay(remainingForCoach({ cal: 2000, p: 100, c: 80, f: 25 }, BANDS))).toBe(true);
    expect(isOverDay(remainingForCoach({ cal: 900, p: 100, c: 80, f: 90 }, BANDS))).toBe(true);
  });
});

describe("slot budget", () => {
  it("holds back room for later slots instead of spending the whole day", () => {
    const budget = budgetFor({ cal: 0, p: 0, c: 0, f: 0 }, { slot: "breakfast" });
    expect(budget.cal).toBeGreaterThan(0);
    expect(budget.cal).toBeLessThan(BANDS.calHi);
    expect(budget.laterSlots).toEqual(["lunch", "dinner"]);
  });

  it("gives the last meal of the day everything that is left", () => {
    const totals = { cal: 1200, p: 100, c: 110, f: 35 };
    const budget = budgetFor(totals, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch", "snack"]),
      snackCount: 0,
    });
    expect(budget.laterSlots).toEqual([]);
    expect(Math.round(budget.cal)).toBe(BANDS.calHi - totals.cal);
  });

  it("adds up: this slot plus everything held back equals what is left", () => {
    const totals = { cal: 640, p: 55, c: 60, f: 20 };
    const budget = budgetFor(totals, { slot: "lunch", loggedSlots: new Set(["breakfast"]) });
    const held = budget.reserve.cal;
    expect(budget.cal + held).toBeCloseTo(budget.remaining.cal, 5);
  });

  it("lets a pencilled dinner take its real macros out of the reserve", () => {
    const dinner = { slot: "dinner", via: "coach", name: "Steak", cal: 700, p: 55, c: 30, f: 30, qty: 1 };
    const withPencil = budgetFor({ cal: 500, p: 40, c: 50, f: 15 }, {
      slot: "lunch",
      loggedSlots: new Set(["breakfast"]),
      plannedMeals: [dinner],
    });
    expect(withPencil.reserve.bySlot.dinner.cal).toBe(700);
    expect(withPencil.reserve.bySlot.dinner.meal.name).toBe("Steak");
  });

  it("does not grow this slot's room when she adds another snack", () => {
    const totals = { cal: 1500, p: 120, c: 140, f: 45 };
    const one = budgetFor(totals, { slot: "dinner", loggedSlots: new Set(["breakfast", "lunch"]), snackCount: 1 });
    const two = budgetFor(totals, { slot: "dinner", loggedSlots: new Set(["breakfast", "lunch"]), snackCount: 2 });
    expect(two.cal).toBeLessThanOrEqual(one.cal + 1e-6);
  });

  it("zeroes everything once the day is spent", () => {
    const budget = budgetFor({ cal: 2200, p: 150, c: 200, f: 80 }, { slot: "dinner" });
    expect(budget.cal).toBe(0);
    expect(budget.reserve.cal).toBe(0);
  });
});

describe("slot order", () => {
  it("treats a coach pencil as a taken slot", () => {
    const taken = coachTakenSlots({
      entries: [{ slot: "breakfast" }],
      plannedMeals: [{ slot: "lunch", via: "coach" }],
    });
    expect([...taken].sort()).toEqual(["breakfast", "lunch"]);
  });

  it("ignores a plain week-plan meal when picking the next slot", () => {
    const next = nextCoachSlot({
      now: MORNING,
      entries: [{ slot: "breakfast" }],
      plannedMeals: [{ slot: "lunch", via: "recipe" }],
    });
    expect(next).toBe("lunch");
  });

  it("never hands back the slot she just answered", () => {
    const next = nextCoachSlot({
      now: MORNING,
      entries: [{ slot: "breakfast" }],
      plannedMeals: [{ slot: "lunch", via: "coach" }],
    });
    expect(next).toBe("dinner");
  });

  it("returns null when the day is answered", () => {
    expect(nextCoachSlot({
      now: EVENING,
      entries: [{ slot: "breakfast" }, { slot: "lunch" }, { slot: "dinner" }, { slot: "snack" }],
    })).toBe(null);
  });

  it("at night, lunch logged and breakfast empty is dinner, not breakfast", () => {
    expect(nextCoachSlot({
      now: EVENING,
      entries: [{ slot: "lunch", name: "Salad" }],
    })).toBe("dinner");
    expect(resolveCoachSlot({
      now: EVENING,
      entries: [{ slot: "lunch", name: "Salad" }],
    })).toBe("dinner");
    expect(nextCoachSlot({ now: EVENING, entries: [] })).toBe("dinner");
  });

  it("still offers breakfast in the morning, even if lunch is already logged", () => {
    expect(nextCoachSlot({
      now: MORNING,
      entries: [{ slot: "lunch" }],
    })).toBe("breakfast");
    expect(resolveCoachSlot({
      now: MORNING,
      entries: [{ slot: "lunch" }],
    })).toBe("breakfast");
  });

  it("after lunch in the afternoon the next plate is dinner, not a snack", () => {
    expect(nextCoachSlot({
      now: AFTERNOON,
      entries: [{ slot: "lunch" }],
    })).toBe("dinner");
  });

  it("at 9:07pm PDT, lunch logged and breakfast empty is dinner on any host zone", () => {
    expect(coachSlotFromTime(LIVED_EVENING)).toBe("dinner");
    expect(nextCoachSlot({
      now: LIVED_EVENING,
      entries: [{ slot: "lunch", name: "Salad" }],
    })).toBe("dinner");
    expect(resolveCoachSlot({
      now: LIVED_EVENING,
      entries: [{ slot: "lunch", name: "Salad" }],
    })).toBe("dinner");
    expect(coachSlotFromTime(MORNING)).toBe("breakfast");
    expect(nextCoachSlot({
      now: MORNING,
      entries: [{ slot: "lunch", name: "Salad" }],
    })).toBe("breakfast");
  });

  it("does not rewind to breakfast after dinner is already logged", () => {
    expect(nextCoachSlot({
      now: EVENING,
      entries: [{ slot: "lunch" }, { slot: "dinner" }],
    })).toBe("snack");
  });

  /**
   * She asked at 8am what dinner should be. Dinner is last in the day, so it
   * used to be handed everything left and came back with a 1,610-calorie
   * plate — she still has breakfast and lunch in front of her.
   */
  it("holds room for the meals still ahead of her, not only the later ones", () => {
    expect(laterSlotsAfter("dinner", new Set(), MORNING)).toEqual(["breakfast", "lunch"]);
    expect(laterSlotsAfter("breakfast", new Set(), MORNING)).toEqual(["lunch", "dinner"]);
  });

  it("holds earlier unlogged meals when nothing is logged, instead of treating them as skipped", () => {
    expect(laterSlotsAfter("dinner", new Set(), EVENING)).toEqual(["breakfast", "lunch"]);
    expect(laterSlotsAfter("lunch", new Set(), ONE_PM)).toEqual(["breakfast", "dinner"]);
    expect(laterSlotsAfter("dinner", new Set(["breakfast"]), EVENING)).toEqual([]);
    expect(laterSlotsAfter("lunch", new Set(["breakfast"]), ONE_PM)).toEqual(["dinner"]);
  });

  it("names a skipped meal only when she logged other meals or said she skipped", () => {
    const onePm = ONE_PM;
    expect(skippedSlotsBefore("lunch", new Set(), onePm)).toEqual([]);
    expect(skippedSlotsBefore("dinner", new Set(), EVENING)).toEqual([]);
    expect(skippedSlotsBefore("lunch", new Set(["breakfast"]), onePm)).toEqual([]);
    expect(skippedSlotsBefore("dinner", new Set(["breakfast"]), EVENING)).toEqual(["lunch"]);
    expect(skippedSlotsBefore("dinner", new Set(), EVENING, { saidSkipped: true })).toEqual(["breakfast", "lunch"]);
    // 8am, asking about lunch: breakfast has not been skipped yet.
    expect(skippedSlotsBefore("lunch", new Set(), MORNING)).toEqual([]);
  });

  it("sizes dinner to a normal dinner share when nothing is logged tonight", () => {
    const budget = budgetFor({ cal: 0, p: 0, c: 0, f: 0 }, {
      slot: "dinner",
      loggedSlots: new Set(),
      now: EVENING,
    });
    expect(budget.skipped).toEqual([]);
    expect(budget.laterSlots).toEqual(["breakfast", "lunch"]);
    expect(Math.round(budget.cal)).toBe(Math.round(BANDS.calHi * DEFAULT_MEAL_SHARES.dinner));
    expect(budget.cal).toBeLessThan(BANDS.calHi * 0.55);
    expect(budget.cal).toBeGreaterThan(BANDS.calHi * 0.25);
  });

  it("keeps a meal she hasn't eaten out of a snack's budget", () => {
    expect(laterSlotsAfter("snack", new Set(), AFTERNOON)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(laterSlotsAfter("snack", new Set(["lunch"]), AFTERNOON)).toEqual(["dinner"]);
    expect(laterSlotsAfter("snack", new Set(["breakfast", "lunch", "dinner"]), AFTERNOON)).toEqual([]);
  });
});

describe("shares from history", () => {
  it("falls back to defaults under five usable days", () => {
    const shares = deriveMealShares({
      "2026-01-01": [{ slot: "lunch", cal: 500 }],
      "2026-01-02": [{ slot: "lunch", cal: 500 }],
    });
    expect(shares.fromHistory).toBe(false);
    expect(shares.lunch).toBe(DEFAULT_MEAL_SHARES.lunch);
  });

  it("uses her real split once there is enough history", () => {
    const day = [
      { slot: "breakfast", cal: 300 },
      { slot: "lunch", cal: 500 },
      { slot: "dinner", cal: 900 },
      { slot: "snack", cal: 200 },
    ];
    const history = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`2026-01-0${n}`, day]));
    const shares = deriveMealShares(history);
    expect(shares.fromHistory).toBe(true);
    expect(shares.dinner).toBeGreaterThan(shares.lunch);
  });

  it("asks how many snacks when there is no habit yet", () => {
    expect(snackHabitFromHistory({
      "2026-01-01": [{ slot: "lunch", cal: 500 }],
    })).toEqual({ count: 1, ask: true });
  });

  it("offers two snacks when that is what she usually does", () => {
    const day = [
      { slot: "breakfast", cal: 300 },
      { slot: "snack", cal: 100 },
      { slot: "snack", cal: 100 },
      { slot: "dinner", cal: 700 },
    ];
    const history = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`2026-01-0${n}`, day]));
    expect(snackHabitFromHistory(history)).toEqual({ count: 2, ask: false });
  });

  it("offers one snack when that is the habit", () => {
    const day = [
      { slot: "breakfast", cal: 300 },
      { slot: "lunch", cal: 500 },
      { slot: "snack", cal: 150 },
      { slot: "dinner", cal: 700 },
    ];
    const history = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`2026-01-0${n}`, day]));
    expect(snackHabitFromHistory(history)).toEqual({ count: 1, ask: false });
  });

  it("ignores history that would starve a later slot", () => {
    const shares = { breakfast: 0.7, lunch: 0.3, dinner: 0, snack: 0, fromHistory: true };
    expect(resolveCoachShares(shares, ["dinner"]).fromHistory).toBe(false);
  });
});

describe("scaling a card", () => {
  const card = { name: "Bowl", title: "Bowl · 2 servings", cal: 800, p: 60, c: 60, f: 20, servings: 2 };

  it("unscales back to a single serving", () => {
    const base = unscaleRankedCard(card);
    expect(base.cal).toBe(400);
    expect(base.name).toBe("Bowl");
  });

  it("does not multiply an already-scaled card twice", () => {
    expect(coachLogFromCard(card).cal).toBe(800);
  });

  it("strips every portion suffix the app writes", () => {
    expect(unscaleRankedCard({ name: "Bowl · 2×", cal: 800, servings: 2 }).name).toBe("Bowl");
    expect(unscaleRankedCard({ name: "Bowl · 2 servings", cal: 800, servings: 2 }).name).toBe("Bowl");
    expect(unscaleRankedCard({ name: "Bowl · half portion", cal: 200, servings: 0.5 }).name).toBe("Bowl");
  });

  it("writes plan rows at qty 1 with card-scaled macros", () => {
    const fields = coachPlanFieldsFromCard(card);
    expect(fields.qty).toBe(1);
    expect(fields.cal).toBe(800);
    expect(fields.name).toBe("Bowl");
  });
});

describe("taste and safety gates", () => {
  it("keeps land meat away from a vegetarian", () => {
    expect(mealAllowedForDiet({ name: "Chicken bowl" }, "vegetarian")).toBe(false);
    expect(mealAllowedForDiet({ name: "Salmon bowl" }, "vegetarian")).toBe(false);
    expect(mealAllowedForDiet({ name: "Salmon bowl" }, "pescatarian")).toBe(true);
    expect(mealAllowedForDiet({ name: "Chicken bowl" }, "none")).toBe(true);
  });

  it("reads allergens out of the ingredient lines, not just the name", () => {
    const meal = { name: "Green bowl", ingredients: [{ amount: "2 tbsp", item: "tahini" }] };
    const prefs = coachPrefsFromProfile({ allergens: ["sesame"] }, "lunch");
    expect(mealHitsDislike(meal, prefs.dislikes)).toBe(true);
  });

  it("honours free-text avoids", () => {
    const prefs = coachPrefsFromProfile({ foodAvoids: "mushrooms, olives" }, "dinner");
    expect(mealHitsDislike({ name: "Mushroom risotto" }, prefs.dislikes)).toBe(true);
    expect(mealHitsDislike({ name: "Chicken rice" }, prefs.dislikes)).toBe(false);
  });

  it("matches names across portion suffixes", () => {
    expect(namesMatch("Bowl · 2×", "bowl")).toBe(true);
  });

  it("names the protein so three cards are not three chicken bowls", () => {
    expect(primaryProtein({ name: "Chicken bowl" })).toBe("chicken");
    expect(primaryProtein({ name: "Toast" })).toBe("other");
  });
});

describe("ranking", () => {
  const bank = [
    { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, cat: "dinner" },
    { name: "Chicken wrap", cal: 400, p: 40, c: 35, f: 10, cat: "dinner" },
    { name: "Salmon plate", cal: 460, p: 38, c: 25, f: 20, cat: "dinner" },
    { name: "Tofu stir fry", cal: 380, p: 28, c: 40, f: 12, cat: "dinner" },
  ];

  const budget = () => budgetFor({ cal: 900, p: 90, c: 80, f: 25 }, {
    slot: "dinner",
    loggedSlots: new Set(["breakfast", "lunch"]),
  });

  it("returns three cards, with a half portion beside the full one at dinner", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), slot: "dinner" });
    expect(meals).toHaveLength(3);
    expect(meals[0].servings).toBe(1);
    expect(meals[1].servings).toBe(0.5);
    expect(meals[1].name).toBe(meals[0].name);
    expect(meals[1].title).toMatch(/half portion/);
    const fulls = meals.filter((m) => (m.servings || 1) >= 1);
    expect(new Set(fulls.map((m) => primaryProtein(m))).size).toBe(fulls.length);
  });

  it("drops anything her diet forbids", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), diet: "vegetarian", slot: "dinner" });
    expect(meals.every((m) => mealAllowedForDiet(m, "vegetarian"))).toBe(true);
  });

  it("puts the lightest first when she asks for lighter", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), prefer: "lighter", slot: "dinner" });
    const fulls = meals.filter((m) => (m.servings || 1) >= 1);
    expect(fulls[0].cal).toBeLessThanOrEqual(fulls[1].cal);
  });

  it("leads with protein when she asks for more of it", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), prefer: "protein", slot: "dinner" });
    expect(meals[0].p).toBeGreaterThanOrEqual(meals[1].p);
  });

  it("only tags My meals from the current live custom meal list", () => {
    const room = budgetFor({ cal: 400, p: 30, c: 40, f: 12 }, {
      slot: "snack",
      loggedSlots: new Set(["breakfast", "lunch", "dinner"]),
    });
    const myCandidates = [
      { id: "live-1", name: "Still saved meal", cal: 220, p: 18, c: 20, f: 8, cat: "Snack" },
      { id: "deleted-1", name: "Rosemary crackers", cal: 210, p: 7, c: 24, f: 9, cat: "Snack" },
    ];
    const { meals } = rankBankCards({
      bankMeals: [],
      myMeals: myCandidates,
      liveMyMeals: [{ id: "live-1", name: "Still saved meal" }],
      budget: room,
      slot: "snack",
    });
    expect(meals.some((m) => m.name === "Rosemary crackers" && m.source === "my")).toBe(false);
    expect(meals.some((m) => m.name === "Still saved meal" && m.source === "my")).toBe(true);
  });

  it("drops deleted customs from a replayed thread and keeps live and bank cards", () => {
    const messages = [{
      id: "m1",
      body: "Earlier answer.",
      cards: [
        { id: "deleted-1", name: "Rosemary crackers", source: "my", tag: "My meals", slot: "breakfast" },
        { id: "tag-only", name: "Old scramble", tag: "My meals", slot: "breakfast" },
        { id: "live-1", name: "Still saved meal", source: "my", tag: "My meals", slot: "lunch" },
        { name: "Greek yogurt bowl", source: "bank", tag: "Callie's bank", slot: "breakfast" },
      ],
    }];
    const live = [{ id: "live-1", name: "Still saved meal" }];
    const shown = replayCoachMessages(messages, live);
    expect(shown[0].cards.map((card) => card.name)).toEqual(["Still saved meal"]);
    expect(replayCoachMessages(messages, [])[0].cards.map((card) => card.name)).toEqual([
      "Greek yogurt bowl",
    ]);
    expect(replayCoachMessages(messages, live)[0].body).toBe("Earlier answer.");
  });

  it("strips a stock fit line on open cards and keeps a plate-tied why", () => {
    const messages = [{
      id: "m1",
      body: "Earlier answer.",
      cards: [
        { name: "Sheet pan chicken", source: "bank", reason: COACH_COPY.reasonGets },
        { name: "Turkey meatballs", source: "bank", reason: COACH_COPY.reasonFits, knowsYou: "One of your usuals at dinner" },
        { name: "Halibut + rice", source: "bank", reason: "Leaves 4g fat.", knowsYou: "One of your usuals at dinner" },
        { name: "Pulled chicken tacos", source: "bank", reason: "33g of protein still open." },
        { name: "Off-slot plate", source: "bank", reason: "Hits protein and keeps fat in range", knowsYou: "Usually breakfast" },
      ],
    }];
    const shown = replayCoachMessages(messages, []);
    expect(shown[0].cards.map((card) => card.name)).toEqual(["Sheet pan chicken"]);
    expect(shown[0].cards[0].reason).toMatch(/chicken/i);
    expect(shown[0].cards[0].reason).not.toMatch(/protein|fat in range|fits what's left|skipped a meal|hormonal/i);
    expect(JSON.stringify(shown[0].cards)).not.toContain(COACH_COPY.reasonGets);
    expect(JSON.stringify(shown[0].cards)).not.toContain(COACH_COPY.reasonFits);
  });

  it("opens a stored bank dump as one plate, one swap, and no leftover-math lead", () => {
    const lead = [
      COACH_COPY.skipNotice,
      "You need about 129g of protein tonight.",
      COACH_COPY.plenty,
    ].join(" ");
    const messages = [{
      id: "m1",
      role: "coach",
      kind: "cards",
      body: lead,
      cards: [
        { name: "Pulled chicken tacos", source: "bank", reason: COACH_COPY.reasonGets },
        { name: "Halibut + rice", source: "bank", reason: COACH_COPY.reasonFits },
        { name: "Turkey meatballs + rice", source: "bank", reason: COACH_COPY.proteinOverMuch },
      ],
    }];
    const shown = replayCoachMessages(messages, []);
    expect(shown[0].cards.map((card) => card.name)).toEqual(["Pulled chicken tacos"]);
    expect(shown[0].body).toContain("I noticed you skipped a meal");
    expect(shown[0].body).not.toMatch(/129g|of protein tonight|plenty of room|keep fat in its band/i);
    expect(shown[0].cards[0].reason).toMatch(/chicken|tortilla/i);
    expect(shown[0].cards[0].reason).not.toMatch(/skipped a meal|hormonal|cortisol|protein tonight|keep fat/i);
    expect(shownCoachReason({
      name: "Pulled chicken tacos",
      reason: COACH_COPY.skipNotice,
    })).toMatch(/chicken|tortilla/i);
    expect(shownCoachReason({
      name: "Halibut + rice",
      title: "Halibut + rice · 2 servings",
      reason: `${COACH_COPY.skipNotice} ${COACH_COPY.skipBreakfastHint}`,
    })).toMatch(/halibut|garlic|rice/i);
    expect(firstPaintPlates([
      { name: "Pulled chicken tacos", title: "Pulled chicken tacos · 2 servings", servings: 2, reason: COACH_COPY.reasonGets },
      { name: "Halibut + rice", title: "Halibut + rice · 2 servings", servings: 2, reason: COACH_COPY.reasonFits },
      { name: "Pulled chicken tacos", title: "Pulled chicken tacos · half portion", servings: 0.5, reason: "" },
    ]).map((card) => card.title)).toEqual([
      "Pulled chicken tacos · 2 servings",
      "Pulled chicken tacos · half portion",
    ]);
  });

  it("paints one plate when today's thread stored two suggestion sets", () => {
    const messages = [
      {
        id: "m1",
        role: "coach",
        body: "Earlier.",
        cards: [
          { name: "Sheet pan chicken", source: "bank", reason: COACH_COPY.reasonGets },
          { name: "Turkey meatballs + rice", source: "bank", reason: COACH_COPY.proteinOverMuch },
        ],
      },
      {
        id: "m2",
        role: "coach",
        body: "Later.",
        cards: [
          { name: "Pulled chicken tacos", source: "bank", servings: 2, reason: "" },
          { name: "Halibut + rice", source: "bank", servings: 2, reason: "" },
        ],
      },
    ];
    const shown = replayCoachMessages(messages, []);
    expect(shown[0].cards).toEqual([]);
    expect(shown[1].cards.map((card) => card.name)).toEqual(["Pulled chicken tacos"]);
    expect(shown[1].cards[0].reason).toMatch(/chicken|tortilla/i);
    expect(shown[1].cards[0].reason).not.toMatch(/skipped a meal|hormonal/);
  });

  it("stamps a food why on a Berry smoothie whose stored reason is blank", () => {
    const card = {
      kind: "meal",
      name: "Berry protein smoothie",
      title: "Berry protein smoothie",
      source: "bank",
      tag: "Callie's bank",
      cal: 270,
      p: 28,
      c: 34,
      f: 4,
      servings: 1,
      reason: "",
      knowsYou: "Usually breakfast",
      ingredients: ["salt", "oil"],
    };
    const essay = `${COACH_COPY.skipNotice} ${COACH_COPY.skipBreakfastHint}`;
    expect(shownCoachReason(card)).toBe("Protein powder, frozen berries, and medium banana.");
    expect(shownCoachReason(card)).not.toBe("");
    const painted = firstPaintPlates([card]);
    expect(painted).toHaveLength(1);
    expect(painted[0]).not.toBe(card);
    expect(painted[0].reason).toBe("Protein powder, frozen berries, and medium banana.");
    const replayed = replayCoachMessages([{
      role: "coach",
      body: essay,
      cards: [card],
    }], []);
    expect(replayed[0].body).toContain("I noticed you skipped a meal");
    expect(replayed[0].cards).toHaveLength(1);
    expect(replayed[0].cards[0].reason).toBe("Protein powder, frozen berries, and medium banana.");
    expect(cardsWithShownReason([card])[0].reason).not.toBe("");
  });

  it("drops a deleted custom wearing any chip and keeps the live custom and the bank meal", () => {
    const messages = [{
      id: "m1",
      body: "Earlier answer.",
      cards: [
        {
          name: "Sheet Pan Chicken with Sweet Potato",
          source: "new",
          tag: "Built for what's left",
          knowsYou: "Usually breakfast",
          basedOn: "Sheet Pan Chicken with Sweet Potato",
          slot: "breakfast",
        },
        {
          id: "sausage",
          name: "Sausage, egg + whites scramble",
          source: "my",
          tag: "My meals",
          slot: "breakfast",
        },
        { name: "Sheet pan chicken", source: "bank", tag: "Callie's bank", slot: "dinner" },
        { name: "Leftover Pasta", source: "new", tag: "Built for what's left", basedOn: null, slot: "dinner" },
      ],
    }];
    const live = [{ id: "sausage", name: "Sausage, egg + whites scramble" }];
    const snapshot = live.map((meal) => ({ ...meal }));
    expect(pruneStaleMyMealCards(messages[0].cards, live).map((card) => card.name)).toEqual([
      "Sheet Pan Chicken with Sweet Potato",
      "Sausage, egg + whites scramble",
      "Sheet pan chicken",
      "Leftover Pasta",
    ]);
    const shown = replayCoachMessages(messages, live);
    expect(shown[0].cards.map((card) => card.name)).toEqual(["Sheet Pan Chicken with Sweet Potato"]);
    expect(live).toEqual(snapshot);

    const afterDelete = replayCoachMessages(messages, []);
    expect(afterDelete[0].cards.map((card) => card.name)).toEqual(["Sheet Pan Chicken with Sweet Potato"]);
  });

  it("keeps the saved list when a custom meals fetch fails", () => {
    const saved = [{ id: "sausage", name: "Sausage, egg + whites scramble" }];
    expect(nextCustomMeals(saved, null)).toEqual(saved);
    expect(nextCustomMeals(saved, undefined)).toEqual(saved);
    expect(nextCustomMeals(saved, [])).toEqual([]);
    expect(nextCustomMeals([], [{ id: "sausage", name: "Sausage, egg + whites scramble" }])).toEqual([
      { id: "sausage", name: "Sausage, egg + whites scramble" },
    ]);
  });

  it("never promotes history-only meal names into My meals", () => {
    const room = budgetFor({ cal: 400, p: 30, c: 40, f: 12 }, {
      slot: "snack",
      loggedSlots: new Set(["breakfast", "lunch", "dinner"]),
    });
    const rosemary = { name: "Rosemary crackers", cal: 180, p: 6, c: 22, f: 8, cat: "Snack" };
    const { meals } = rankBankCards({
      bankMeals: [rosemary],
      myMeals: [],
      liveMyMeals: [],
      loggedRecentNames: ["Rosemary crackers"],
      anyHistoryNames: ["Rosemary crackers"],
      budget: room,
      slot: "snack",
    });
    expect(meals.length).toBeGreaterThan(0);
    expect(meals[0].name).toBe("Rosemary crackers");
    expect(meals[0].source).toBe("bank");
    expect(meals.some((m) => m.source === "my")).toBe(false);
  });

  it("skips a card she already turned down", () => {
    const { meals } = rankBankCards({
      bankMeals: bank,
      budget: budget(),
      skipNames: ["Chicken bowl"],
      slot: "dinner",
    });
    expect(meals.some((m) => namesMatch(m.name, "Chicken bowl"))).toBe(false);
  });

  it("gives back nothing rather than a card that does not fit", () => {
    const tiny = budgetFor({ cal: 1880, p: 138, c: 165, f: 60 }, {
      slot: "snack",
      loggedSlots: new Set(["breakfast", "lunch", "dinner"]),
      snackCount: 0,
    });
    const { meals } = rankBankCards({ bankMeals: bank, budget: tiny, slot: "snack" });
    expect(meals).toHaveLength(0);
  });

  it("offers a half portion when that is the only size that fits", () => {
    const snackRoom = { cal: 220, pNeed: 12, pHigh: 20, c: 18, f: 8, remaining: { pHigh: 120 } };
    const half = buildCoachCard(
      { name: "Big scramble", cal: 420, p: 36, c: 29, f: 14 },
      snackRoom,
      { slot: "snack" },
    );
    expect(half.servings).toBe(0.5);
    expect(half.title).toMatch(/half portion/);
  });

  it("never tells her a meal leaves 0g of fat", () => {
    const tight = { ...budgetFor({ cal: 900, p: 90, c: 80, f: 25 }, { slot: "dinner" }), f: 4, pNeed: 20 };
    const card = buildCoachCard({ name: "Lean plate", cal: 300, p: 30, c: 20, f: 6 }, tight, { slot: "dinner" });
    expect(card.reason).not.toMatch(/leaves 0g/i);
    expect(card.reason).toBe("Lean plate.");
    expect(card.reason).not.toBe(COACH_COPY.reasonGets);
  });

  it("names food on the plate and stays silent on leftover math", () => {
    expect(coachReason()).toBe("");
    expect(plateTiedReason(COACH_COPY.reasonGets)).toBe("");
    expect(plateTiedReason(COACH_COPY.reasonFits)).toBe("");
    expect(plateTiedReason(COACH_COPY.proteinOverMuch)).toBe("");
    expect(plateTiedReason("Hits protein and leaves 8g fat.")).toBe("");
    expect(plateTiedReason("Most of your protein — 12g short, easy to pick up later.")).toBe("");
    expect(plateTiedReason("Hits protein and keeps fat in range")).toBe("");
    expect(plateTiedReason("Leaves 4g fat.")).toBe("");
    expect(plateTiedReason("33g of protein still open.")).toBe("");
    expect(shownCoachReason({
      name: "Turkey meatballs + rice",
      reason: COACH_COPY.proteinOverMuch,
      proteinNote: COACH_COPY.proteinOverMuch,
    })).toBe("Turkey meatballs, marinara, and rice.");
    expect(shownCoachReason({
      name: "Turkey meatballs + rice",
      reason: COACH_COPY.proteinOverMuch,
    })).not.toMatch(/more protein than you need|keep fat in range/i);
    expect(shownCoachReason({
      reason: COACH_COPY.reasonGets,
      knowsYou: "One of your usuals at dinner",
    })).toBe("You've had this at dinner.");
    expect(shownCoachReason({
      reason: "Leaves 4g fat.",
      knowsYou: "You like salmon",
    })).toBe("You like salmon.");
    expect(shownCoachReason({
      reason: COACH_COPY.reasonFits,
      knowsYou: "Usually breakfast",
    })).toBe("");
  });

  it("dresses a built meal with the same fit check as a bank meal", () => {
    const card = buildCoachCard({ name: "Fridge scramble", cal: 380, p: 34, c: 18, f: 16 }, budget(), { slot: "dinner" });
    expect(card.name).toBe("Fridge scramble");
    expect(card.title).toContain("Fridge scramble");
    expect(plateTiedReason(card.reason)).not.toMatch(/hits protein and keeps fat in range/i);
    expect(plateTiedReason(card.reason)).not.toMatch(/fits what's left/i);
    expect(buildCoachCard({ name: "Whole cake", cal: 3000, p: 20, c: 400, f: 150 }, budget(), {})).toBe(null);
  });
});

/**
 * Halibut and rice fits a 582-calorie breakfast on every number, and offering
 * it at 7am is the difference between a coach and a filter.
 */
describe("a meal belongs at a meal", () => {
  const mixed = [
    { cat: "Breakfast", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4 },
    { cat: "Breakfast", name: "Greek yogurt bowl", cal: 350, p: 25, c: 49, f: 5 },
    { cat: "Dinner", name: "Halibut + rice", cal: 455, p: 44, c: 50, f: 7 },
    { cat: "Dinner", name: "Sheet pan chicken", cal: 440, p: 45, c: 35, f: 14 },
    { cat: "Snack", name: "Greek yogurt + berries", cal: 180, p: 24, c: 16, f: 2 },
  ];
  const roomyBreakfast = () => budgetFor({ cal: 0, p: 0, c: 0, f: 0 }, { slot: "breakfast" });

  it("answers breakfast with breakfast", () => {
    const { meals } = rankBankCards({ bankMeals: mixed, budget: roomyBreakfast(), slot: "breakfast" });
    expect(meals[0].cat).toBe("Breakfast");
    expect(meals.slice(0, 2).map((m) => m.cat)).toEqual(["Breakfast", "Breakfast"]);
  });

  it("keeps the slot when she asks for lighter or for more protein", () => {
    for (const prefer of ["lighter", "protein"]) {
      const { meals } = rankBankCards({ bankMeals: mixed, budget: roomyBreakfast(), prefer, slot: "breakfast" });
      expect(meals[0].cat).toBe("Breakfast");
    }
  });

  it("still offers a dinner at breakfast rather than nothing, and says it is one", () => {
    const { meals } = rankBankCards({
      bankMeals: mixed,
      budget: roomyBreakfast(),
      skipNames: ["Protein oatmeal", "Greek yogurt bowl"],
      slot: "breakfast",
    });
    expect(meals.length).toBeGreaterThan(0);
    expect(meals[0].cat).toBe("Dinner");
    expect(meals[0].knowsYou).toBe("Usually dinner");
  });

  it("counts a meal she has actually eaten at this slot as belonging there", () => {
    const { meals } = rankBankCards({
      bankMeals: mixed,
      budget: roomyBreakfast(),
      slotHistoryNames: ["Sheet pan chicken"],
      slot: "breakfast",
    });
    expect(meals.some((m) => m.name === "Sheet pan chicken")).toBe(true);
    expect(meals.find((m) => m.name === "Sheet pan chicken").knowsYou).not.toBe("Usually dinner");
  });

  it("answers a snack with a snack, not a block of chicken breast", () => {
    const budget = budgetFor({ cal: 400, p: 30, c: 40, f: 12 }, {
      slot: "snack",
      loggedSlots: new Set(["breakfast", "lunch", "dinner"]),
    });
    const { meals } = rankBankCards({
      bankMeals: mixed,
      pantryItems: [{ name: "Chicken breast, cooked, skinless", cal: 280, p: 53, c: 0, f: 6 }],
      budget,
      slot: "snack",
    });
    expect(meals[0].name).toBe("Greek yogurt + berries");
  });

  /**
   * She asked about dinner, went to Messages, came back, and the panel had
   * gone back to breakfast — the dinner she logged off the card still in front
   * of her was filed under breakfast. The card carries its own slot now.
   */
  it("stamps a named dinner on the cards, even when breakfast was never logged", () => {
    const answer = buildCoachAnswer({
      macros: MACROS,
      totals: { cal: 520, p: 42, c: 55, f: 16 },
      entries: [{ slot: "lunch", name: "Salad" }],
      slot: "dinner",
      now: EVENING,
    });
    expect(answer.slot).toBe("dinner");
    expect(answer.cards.length).toBeGreaterThan(0);
    expect(answer.cards.every((card) => card.slot === "dinner")).toBe(true);
  });

  it("stamps a card with the meal it was sized for", () => {
    const { meals } = rankBankCards({ bankMeals: mixed, budget: roomyBreakfast(), slot: "breakfast" });
    expect(meals.every((m) => m.slot === "breakfast")).toBe(true);

    const dinner = budgetFor({ cal: 900, p: 90, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    const built = buildCoachCard({ name: "Fridge scramble", cal: 380, p: 34, c: 18, f: 16 }, dinner, { slot: "dinner" });
    expect(built.slot).toBe("dinner");
  });

  it("never claims to know her when it doesn't", () => {
    const { meals } = rankBankCards({ bankMeals: mixed, budget: roomyBreakfast(), slot: "breakfast" });
    expect(meals.every((m) => !m.knowsYou || m.knowsYou !== "Close to what you usually eat")).toBe(true);
    expect(meals[0].knowsYou).toBe(null);
  });
});

describe("copy matches the rest of the app", () => {
  it("uses the same words the Today card uses", () => {
    expect(macroStanding(120, 140, 150, "g").text).toBe("20–30g");
    expect(formatRangeProgress(120, 140, 150, "g").detail).toBe("20–30g left");
    expect(macroStanding(145, 140, 150, "g").text).toBe("5g room");
    expect(formatRangeProgress(145, 140, 150, "g").detail).toBe("5g room");
    expect(macroStanding(162, 140, 150, "g").text).toBe("12g over");
    expect(formatRangeProgress(162, 140, 150, "g").detail).toBe("12g over");
    expect(macroStanding(150, 140, 150, "g").text).toBe("at the top");
  });

  it("writes one line covering all four numbers", () => {
    const line = leftLine({ cal: 905, p: 64, c: 33, f: 53 }, BANDS);
    expect(line).toBe("845–995 cal · P 76–86g · C 127–137g · F 2–12g");
  });

  it("never calls protein the tight one", () => {
    expect(tightestMacro({ cal: 200, p: 139, c: 20, f: 5 }, BANDS)?.key).not.toBe("p");
    expect(tightestMacro({ cal: 500, p: 20, c: 30, f: 60 }, BANDS).key).toBe("f");
    expect(tightestMacro({ cal: 0, p: 0, c: 0, f: 0 }, BANDS)).toBe(null);
  });

  it("explains the number it just gave her", () => {
    const budget = budgetFor({ cal: 640, p: 55, c: 60, f: 20 }, { slot: "lunch", loggedSlots: new Set(["breakfast"]) });
    const sentence = budgetSentence(budget);
    expect(sentence).toContain("Saving room for");
    expect(sentence).toContain("That leaves");
    expect(slotLeftRead(budget).title).toBe("Left for lunch");
  });

  /**
   * The strip is the last thing she reads before picking a meal, so it has to
   * say which numbers are targets and which are ceilings. Giving protein,
   * carbs and fat the same shape was telling her protein was a limit.
   */
  it("calls protein a target and the other two ceilings", () => {
    const budget = budgetFor({ cal: 640, p: 55, c: 60, f: 20 }, { slot: "lunch", loggedSlots: new Set(["breakfast"]) });
    const strip = slotLeftRead(budget);
    expect(strip.macros).toMatch(/^Aim for \d+g protein\. Up to \d+g carbs and \d+g fat\.$/);
  });

  it("says protein is covered rather than asking for 0g of it", () => {
    const budget = budgetFor({ cal: 400, p: 150, c: 30, f: 12 }, { slot: "dinner" });
    expect(slotLeftRead(budget).macros).toContain("Protein's already covered");
    expect(slotLeftRead(budget).macros).not.toContain("Aim for 0g");
  });

  it("holds back later slots by name, with the unit said once", () => {
    const budget = budgetFor({ cal: 0, p: 0, c: 0, f: 0 }, { slot: "breakfast" });
    const held = slotLeftRead(budget).held;
    expect(held).toMatch(/^Holding \d+ cal for lunch · \d+ for dinner/);
    expect(held).not.toMatch(/cal a snack/);
  });

  it("does not write a skip note when nothing is logged and she did not say she skipped", () => {
    expect(skipMealCopy(["breakfast", "lunch"])).toBe("");
    expect(skipMealCopy(["breakfast", "lunch"], { loggedOtherMeals: false, saidSkipped: false })).toBe("");
    expect(skipMealCopy(["lunch"], { loggedOtherMeals: true })).toBe(COACH_COPY.skipNotice);
    expect(skipMealCopy(["breakfast"], { saidSkipped: true })).toContain(COACH_COPY.skipNotice);
  });

  it("keeps the skip note and drops the leftover-math lead", () => {
    const lead = `${COACH_COPY.skipNotice} You need about 129g of protein tonight. ${COACH_COPY.plenty}`;
    const shown = shownCoachLead(lead);
    expect(shown).toContain("I noticed you skipped a meal");
    expect(shown).toContain("sex hormones");
    expect(shown).not.toMatch(/129g|keep fat in its band|plenty of room|hit your protein/i);
    expect(shownCoachLead(COACH_COPY.plenty)).toBe("");
    expect(shownCoachLead("You need about 40g of protein this morning.")).toBe("");
  });

  it("does not put leftover math on the Today door", () => {
    const evening = new Date("2026-10-01T04:07:00.000Z");
    const morning = new Date("2026-09-04T15:00:00.000Z");
    const read = { line1: "You need about 129g of protein tonight.", line2: COACH_COPY.plenty };
    expect(coachEntryHint({
      loggedSlots: new Set(),
      plannedMeals: [],
      read,
      now: evening,
    })).toBe("Looking for a dinner idea?");
    expect(coachEntryHint({
      loggedSlots: new Set(),
      plannedMeals: [],
      read,
      now: morning,
    })).toBe("Looking for a breakfast idea?");
    expect(coachEntryHint({
      loggedSlots: new Set(["lunch"]),
      plannedMeals: [],
      read,
      now: evening,
    })).toBe("Looking for a dinner idea? I'll size it to what's left.");
  });

  it("gives one protein number, not the strip's and a rounder one below it", () => {
    const budget = budgetFor({ cal: 300, p: 12, c: 30, f: 10 }, { slot: "lunch", loggedSlots: new Set(["breakfast"]) });
    const strip = slotLeftRead(budget).macros.match(/Aim for (\d+)g protein/);
    const read = coachRead({ budget, slot: "lunch" }).line1.match(/(\d+)g of protein/);
    expect(strip[1]).toBe(read[1]);
  });

  it("does not tell an over day it has 0g of carbs and 0g of fat", () => {
    const budget = budgetFor({ cal: 2000, p: 120, c: 200, f: 90 }, {
      slot: "snack",
      loggedSlots: new Set(["breakfast", "lunch", "dinner"]),
    });
    const strip = slotLeftRead(budget);
    expect(strip.over).toBe(true);
    expect(strip.macros).not.toMatch(/0g carbs/);
    expect(strip.macros).toMatch(/still eat/i);
  });
});

describe("reconciliation", () => {
  it("lists coach pencils she has not logged", () => {
    const plan = [
      { slot: "dinner", via: "coach", name: "Steak" },
      { slot: "lunch", via: "coach", name: "Wrap" },
      { slot: "breakfast", via: "recipe", name: "Oats" },
    ];
    const open = unmatchedCoachPencils(plan, [{ slot: "lunch", name: "Wrap · 1×" }]);
    expect(open.map((m) => m.name)).toEqual(["Steak"]);
  });
});
