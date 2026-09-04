import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEAL_SHARES,
  budgetAsRemaining,
  computeSlotBudget,
  coachTakenSlots,
  deriveMealShares,
  isOverDay,
  laterSlotsAfter,
  loggedSlotsFromEntries,
  nextCoachSlot,
  attachDayHighs,
  remainingForCoach,
  resolveCoachShares,
  unmatchedCoachPencils,
} from "./coachBudget.js";
import { buildCoachCard, pickScale, rankBankCards, proteinOverNote } from "./coachRank.js";
import { coachLogFromCard, coachPlanFieldsFromCard, unscaleRankedCard } from "./coachScale.js";
import {
  coachPrefsFromProfile,
  mealAllowedForDiet,
  mealHitsDislike,
  namesMatch,
  primaryProtein,
} from "./coachPrefs.js";
import { leftLine, macroStanding, slotLeftRead, tightestMacro, budgetSentence } from "./coachLines.js";
import { formatRangeProgress } from "./rangeProgress.js";
import { mealFitsRemaining } from "./eatingOutImpact.js";
import { targetBands } from "./weekPlan.js";

const MACROS = { cal: 1750, protein: 140, carbs: 160, fat: 55 };
const BANDS = targetBands(MACROS);

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

  it("still rejects on calories, carbs and fat", () => {
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(pickScale({ name: "Huge", cal: 2000, p: 40, c: 40, f: 20 }, budget)).toBe(null);
    expect(pickScale({ name: "Fatty", cal: 400, p: 40, c: 10, f: 90 }, budget)).toBe(null);
    expect(pickScale({ name: "Carby", cal: 400, p: 10, c: 200, f: 5 }, budget)).toBe(null);
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

  it("still offers a bigger portion when the single serving leaves her short", () => {
    const budget = budgetFor({ cal: 300, p: 15, c: 25, f: 8 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budget.pNeed).toBeGreaterThan(40);
    expect(pickScale({ name: "Small plate", cal: 300, p: 22, c: 20, f: 8 }, budget)).toBeGreaterThan(1);
  });

  it("flags a card that runs past the top of protein instead of hiding it", () => {
    const budget = budgetFor({ cal: 900, p: 120, c: 80, f: 25 }, {
      slot: "dinner",
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(proteinOverNote({ p: 60 }, budget)).toBeTruthy();
    expect(proteinOverNote({ p: 10 }, budget)).toBe(null);
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
      entries: [{ slot: "breakfast" }],
      plannedMeals: [{ slot: "lunch", via: "recipe" }],
    });
    expect(next).toBe("lunch");
  });

  it("never hands back the slot she just answered", () => {
    const next = nextCoachSlot({
      entries: [{ slot: "breakfast" }],
      plannedMeals: [{ slot: "lunch", via: "coach" }],
    });
    expect(next).toBe("dinner");
  });

  it("returns null when the day is answered", () => {
    expect(nextCoachSlot({
      entries: [{ slot: "breakfast" }, { slot: "lunch" }, { slot: "dinner" }, { slot: "snack" }],
    })).toBe(null);
  });

  it("only reserves after a snack, never before", () => {
    expect(laterSlotsAfter("snack", new Set())).toEqual(["dinner"]);
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

  it("returns three cards from different proteins", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), slot: "dinner" });
    expect(meals).toHaveLength(3);
    expect(new Set(meals.map((m) => primaryProtein(m))).size).toBe(3);
  });

  it("drops anything her diet forbids", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), diet: "vegetarian", slot: "dinner" });
    expect(meals.every((m) => mealAllowedForDiet(m, "vegetarian"))).toBe(true);
  });

  it("puts the lightest first when she asks for lighter", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), prefer: "lighter", slot: "dinner" });
    expect(meals[0].cal).toBeLessThanOrEqual(meals[1].cal);
  });

  it("leads with protein when she asks for more of it", () => {
    const { meals } = rankBankCards({ bankMeals: bank, budget: budget(), prefer: "protein", slot: "dinner" });
    expect(meals[0].p).toBeGreaterThanOrEqual(meals[1].p);
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

  it("dresses a built meal with the same fit check as a bank meal", () => {
    const card = buildCoachCard({ name: "Fridge scramble", cal: 380, p: 34, c: 18, f: 16 }, budget(), { slot: "dinner" });
    expect(card.title).toBe("Fridge scramble");
    expect(card.reason).toBeTruthy();
    expect(buildCoachCard({ name: "Whole cake", cal: 3000, p: 20, c: 400, f: 150 }, budget(), {})).toBe(null);
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
