import { describe, expect, it } from "vitest";
import { DECIDE_COPY } from "../content/decideVoice.js";
import {
  DEFAULT_MEAL_SHARES,
  attachCoachContext,
  budgetSentence,
  coachRead,
  computeSlotBudget,
  defaultDecideSlot,
  deriveMealShares,
  isOverDay,
  laterSlotsAfter,
  remainingForDecide,
  unmatchedDecidePencils,
} from "./decideBudget.js";
import { targetBands } from "./weekPlan.js";

const MACROS = { cal: 1750, protein: 145, carbs: 180, fat: 60 };
const BANDS = targetBands(MACROS);
const BREAKFAST = { cal: 905, p: 64, c: 53, f: 47 };

describe("deriveMealShares", () => {
  it("returns defaults when fewer than 5 qualifying days", () => {
    const shares = deriveMealShares({
      "2026-08-01": [{ slot: "breakfast", cal: 400 }],
      "2026-08-02": [{ slot: "lunch", cal: 500 }],
    });
    expect(shares).toMatchObject(DEFAULT_MEAL_SHARES);
    expect(shares.fromHistory).toBe(false);
  });

  it("ignores days with no slotted calories", () => {
    const hist = {};
    for (let i = 1; i <= 6; i += 1) {
      hist[`2026-08-0${i}`] = [{ name: "x", cal: 400 }];
    }
    const shares = deriveMealShares(hist);
    expect(shares).toMatchObject(DEFAULT_MEAL_SHARES);
    expect(shares.fromHistory).toBe(false);
  });

  it("uses the median slot share and normalizes", () => {
    const hist = {};
    for (let i = 1; i <= 6; i += 1) {
      hist[`2026-08-0${i}`] = [
        { slot: "breakfast", cal: 200 },
        { slot: "lunch", cal: 300 },
        { slot: "dinner", cal: 500 },
      ];
    }
    const shares = deriveMealShares(hist);
    expect(shares.breakfast + shares.lunch + shares.dinner + shares.snack).toBeCloseTo(1, 5);
    expect(shares.dinner).toBeCloseTo(0.5, 2);
    expect(shares.lunch).toBeCloseTo(0.3, 2);
    expect(shares.fromHistory).toBe(true);
  });

  it("does not let breakfast-only history zero lunch or dinner", () => {
    const hist = {};
    for (let i = 1; i <= 6; i += 1) {
      hist[`2026-08-0${i}`] = [{ slot: "breakfast", cal: 500 }];
    }
    const shares = deriveMealShares(hist);
    expect(shares.fromHistory).toBe(true);
    expect(shares.lunch).toBe(0);
    expect(shares.dinner).toBe(0);
    const budget = computeSlotBudget({
      totals: { cal: 0, p: 0, c: 0, f: 0 },
      bands: BANDS,
      slot: "breakfast",
      shares,
      loggedSlots: new Set(),
    });
    expect(budget.laterSlots).toEqual(["lunch", "dinner"]);
    expect(budget.reserve.bySlot.lunch.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.lunch, 0);
    expect(budget.reserve.bySlot.dinner.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.dinner, 0);
    expect(budget.reserve.bySlot.lunch.source).toBe("default");
    expect(budget.cal).toBeGreaterThan(100);
    expect(budget.cal).toBeLessThan(BANDS.calHi * 0.5);
    expect(budgetSentence(budget)).toMatch(/Saving room for lunch and dinner/);
    expect(budgetSentence(budget)).toMatch(DECIDE_COPY.normalShare);
    expect(budgetSentence(budget)).not.toMatch(DECIDE_COPY.usualEat);
  });

  it("at breakfast reserves lunch, dinner, and a snack share of a fresh day", () => {
    const budget = computeSlotBudget({
      totals: { cal: 0, p: 0, c: 0, f: 0 },
      bands: BANDS,
      slot: "breakfast",
      shares: DEFAULT_MEAL_SHARES,
      loggedSlots: new Set(),
    });
    expect(budget.laterSlots).toEqual(["lunch", "dinner"]);
    expect(budget.reserve.bySlot.lunch.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.lunch, 0);
    expect(budget.reserve.bySlot.dinner.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.dinner, 0);
    expect(budget.reserve.bySlot.snack.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.snack, 0);
    expect(budget.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.breakfast, 0);
    expect(budget.cal + budget.reserve.cal).toBeCloseTo(BANDS.calHi, 0);
    expect(budgetSentence(budget)).toMatch(DECIDE_COPY.normalShare);
    expect(budgetSentence(budget)).not.toMatch(DECIDE_COPY.usualEat);
  });

  it("does not dump a 574-cal leftover day into breakfast when history zeros lunch", () => {
    const hist = {};
    for (let i = 1; i <= 6; i += 1) {
      hist[`2026-08-0${i}`] = [{ slot: "breakfast", cal: 500 }];
    }
    const shares = deriveMealShares(hist);
    const budget = computeSlotBudget({
      totals: { cal: BANDS.calHi - 574, p: BANDS.pLo - 42, c: 0, f: 0 },
      bands: BANDS,
      slot: "breakfast",
      shares,
      loggedSlots: new Set(),
    });
    expect(budget.remaining.cal).toBeCloseTo(574, 0);
    expect(budget.cal + budget.reserve.cal).toBeCloseTo(574, 0);
    expect(budget.cal).toBeGreaterThan(50);
    expect(budget.cal).toBeLessThan(250);
    expect(budget.reserve.bySlot.lunch.cal).toBeGreaterThan(100);
    expect(budget.reserve.bySlot.dinner.cal).toBeGreaterThan(100);
    expect(budget.reserve.bySlot.lunch.cal).toBeCloseTo(574 * DEFAULT_MEAL_SHARES.lunch, 0);
    expect(budgetSentence(budget)).not.toMatch(/about 0 cal/);
    expect(budgetSentence(budget)).toMatch(DECIDE_COPY.normalShare);
  });
});

describe("laterSlotsAfter + defaultDecideSlot", () => {
  it("never treats snack as a later meal", () => {
    expect(laterSlotsAfter("lunch", new Set())).toEqual(["dinner"]);
    expect(laterSlotsAfter("dinner", new Set())).toEqual([]);
    expect(laterSlotsAfter("snack", new Set())).toEqual(["dinner"]);
    expect(laterSlotsAfter("snack", new Set(["dinner"]))).toEqual([]);
  });

  it("defaults to the first unlogged main at or after the clock, or snack at snack time", () => {
    const lunchTime = new Date(2026, 8, 2, 12, 40);
    expect(defaultDecideSlot({ now: lunchTime, loggedSlots: new Set(["breakfast"]) })).toBe("lunch");
    const snackTime = new Date(2026, 8, 2, 15, 0);
    expect(defaultDecideSlot({ now: snackTime, loggedSlots: new Set(["breakfast", "lunch"]) })).toBe("snack");
    const dinnerTime = new Date(2026, 8, 2, 18, 30);
    expect(defaultDecideSlot({ now: dinnerTime, loggedSlots: new Set(["breakfast", "lunch"]) })).toBe("dinner");
  });
});

describe("12:40 leftover lunch budget", () => {
  const totals = BREAKFAST;
  const remaining = remainingForDecide(totals, BANDS);
  const budget = computeSlotBudget({
    totals,
    bands: BANDS,
    slot: "lunch",
    shares: DEFAULT_MEAL_SHARES,
    loggedSlots: new Set(["breakfast"]),
  });

  it("leaves lunch after reserving dinner and a snack share", () => {
    expect(remaining.cal).toBe(995);
    expect(budget.laterSlots).toEqual(["dinner"]);
    expect(budget.reserve.bySlot.dinner.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.dinner, 0);
    expect(budget.reserve.bySlot.snack.cal).toBeCloseTo(BANDS.calHi * DEFAULT_MEAL_SHARES.snack, 0);
    expect(budget.cal).toBeCloseTo(121, 0);
    expect(budget.pNeed).toBeCloseTo(14, 0);
    expect(budget.c).toBeCloseTo(50, 0);
    expect(budget.f).toBe(0);
  });

  it("uses a pencilled dinner as the exact reserve", () => {
    const pencilled = computeSlotBudget({
      totals,
      bands: BANDS,
      slot: "lunch",
      shares: DEFAULT_MEAL_SHARES,
      loggedSlots: new Set(["breakfast"]),
      plannedMeals: [{
        slot: "dinner",
        via: "decide",
        name: "Chicken and rice bowl",
        cal: 720,
        p: 78,
        c: 70,
        f: 20,
      }],
    });
    expect(pencilled.reserve.bySlot.dinner.source).toBe("decide");
    expect(pencilled.reserve.bySlot.dinner.cal).toBe(720);
    expect(pencilled.cal).toBeCloseTo(123, 0);
    expect(pencilled.pNeed).toBe(0);
    expect(budgetSentence(pencilled)).toMatch(/pencilled in/);
    expect(budgetSentence(pencilled)).toMatch(/Chicken and rice bowl/);
  });

  it("writes a normal-share dinner sentence when history is not usual", () => {
    expect(budgetSentence(budget)).toMatch(/Saving room for dinner/);
    expect(budgetSentence(budget)).toMatch(DECIDE_COPY.normalShare);
    expect(budgetSentence(budget)).not.toMatch(DECIDE_COPY.usualEat);
  });

  it("says usually eat only when later-slot history is at least the default", () => {
    const usual = computeSlotBudget({
      totals,
      bands: BANDS,
      slot: "lunch",
      shares: { ...DEFAULT_MEAL_SHARES, dinner: 0.4, fromHistory: true },
      loggedSlots: new Set(["breakfast"]),
    });
    expect(usual.reserve.bySlot.dinner.source).toBe("usual");
    expect(budgetSentence(usual)).toMatch(DECIDE_COPY.usualEat);
  });
});

describe("last meal / over / snack", () => {
  it("gives the full leftover to dinner at 18:30", () => {
    const totals = { cal: 1000, p: 70, c: 100, f: 40 };
    const budget = computeSlotBudget({
      totals,
      bands: BANDS,
      slot: "dinner",
      shares: DEFAULT_MEAL_SHARES,
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budget.laterSlots).toEqual([]);
    expect(budget.cal).toBe(900);
    expect(budget.pNeed).toBe(75);
    expect(budgetSentence(budget)).toMatch(/Last meal of the day/);
  });

  it("flags over when calories are spent or fat is past slack", () => {
    expect(isOverDay({ cal: -10, f: 4 })).toBe(true);
    expect(isOverDay({ cal: 200, f: -9 })).toBe(true);
    expect(isOverDay({ cal: 200, f: -4 })).toBe(false);
  });

  it("still builds a snack budget and reserves dinner", () => {
    const budget = computeSlotBudget({
      totals: BREAKFAST,
      bands: BANDS,
      slot: "snack",
      shares: DEFAULT_MEAL_SHARES,
      loggedSlots: new Set(["breakfast", "lunch"]),
    });
    expect(budget.laterSlots).toEqual(["dinner"]);
    expect(budget.cal).toBeGreaterThan(0);
  });
});

describe("coachRead", () => {
  const base = attachCoachContext(computeSlotBudget({
    totals: BREAKFAST,
    bands: BANDS,
    slot: "lunch",
    shares: DEFAULT_MEAL_SHARES,
    loggedSlots: new Set(["breakfast"]),
  }), BANDS);

  it("uses the shy protein line at leftover lunch when pNeed is under 15g", () => {
    const read = coachRead({ budget: base, remaining: base.remaining, slot: "lunch" });
    expect(read.line1).toMatch(/shy on protein at lunch/);
    expect(read.line2).toBe(DECIDE_COPY.fatSpent);
  });

  it("uses the shy line under 15g", () => {
    const read = coachRead({
      budget: { ...base, pNeed: 8, dayHighs: base.dayHighs },
      remaining: { cal: 900, c: 80, f: 30 },
      slot: "dinner",
    });
    expect(read.line1).toMatch(/8g shy on protein tonight/);
  });

  it("says protein is covered when pNeed is 0", () => {
    const read = coachRead({
      budget: { ...base, pNeed: 0, dayHighs: base.dayHighs },
      remaining: { cal: 900, c: 80, f: 30 },
      slot: "lunch",
    });
    expect(read.line1).toMatch(/Protein's covered at lunch/);
    expect(read.line2).toBe(DECIDE_COPY.plenty);
  });

  it("replaces both lines when the day is over", () => {
    const read = coachRead({ budget: base, slot: "lunch", over: true });
    expect(read.line1).toBe(DECIDE_COPY.over);
    expect(read.line2).toBe("");
  });

  it("calls out tight calories when that is the binding leftover", () => {
    const read = coachRead({
      budget: { ...base, cal: 250, dayHighs: { cal: 1900, c: 190, f: 70 } },
      remaining: { cal: 400, c: 100, f: 40 },
      slot: "lunch",
    });
    expect(read.line2).toMatch(/About 250 cal to work with/);
  });
});

describe("unmatchedDecidePencils", () => {
  it("hides a grey row when a same-slot log matches the name", () => {
    const planned = [
      { via: "decide", slot: "dinner", name: "Chicken and rice bowl" },
      { via: "manual", slot: "lunch", name: "Leftovers" },
    ];
    const entries = [{ slot: "dinner", name: "Chicken and rice bowl · 1.5×" }];
    expect(unmatchedDecidePencils(planned, entries)).toEqual([]);
  });
});
