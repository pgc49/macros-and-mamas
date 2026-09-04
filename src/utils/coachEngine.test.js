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
import { coachRead, leftLine, macroStanding, slotLeftRead, tightestMacro, budgetSentence } from "./coachLines.js";
import { formatRangeProgress } from "./rangeProgress.js";
import { mealFitsRemaining } from "./eatingOutImpact.js";
import { targetBands } from "./weekPlan.js";

const MACROS = { cal: 1750, protein: 140, carbs: 160, fat: 55 };
const BANDS = targetBands(MACROS);

/** Fixed clocks. Which meals are still ahead of her depends on the time. */
const MORNING = new Date(2026, 8, 4, 8, 0);
const EVENING = new Date(2026, 8, 4, 18, 30);

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

  /**
   * She asked at 8am what dinner should be. Dinner is last in the day, so it
   * used to be handed everything left and came back with a 1,610-calorie
   * plate — she still has breakfast and lunch in front of her.
   */
  it("holds room for the meals still ahead of her, not only the later ones", () => {
    expect(laterSlotsAfter("dinner", new Set(), MORNING)).toEqual(["breakfast", "lunch"]);
    expect(laterSlotsAfter("breakfast", new Set(), MORNING)).toEqual(["lunch", "dinner"]);
  });

  it("treats a meal the clock went past and she never logged as skipped", () => {
    expect(laterSlotsAfter("dinner", new Set(), EVENING)).toEqual([]);
    expect(laterSlotsAfter("lunch", new Set(), new Date(2026, 8, 4, 13, 0))).toEqual(["dinner"]);
  });

  it("keeps a meal she hasn't eaten out of a snack's budget", () => {
    const afternoon = new Date(2026, 8, 4, 15, 0);
    expect(laterSlotsAfter("snack", new Set(), afternoon)).toEqual(["lunch", "dinner"]);
    expect(laterSlotsAfter("snack", new Set(["lunch"]), afternoon)).toEqual(["dinner"]);
    expect(laterSlotsAfter("snack", new Set(["breakfast", "lunch", "dinner"]), afternoon)).toEqual([]);
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
    expect(card.name).toBe("Fridge scramble");
    expect(card.title).toContain("Fridge scramble");
    expect(card.reason).toBeTruthy();
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
    expect(strip.macros).toContain("protein");
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
