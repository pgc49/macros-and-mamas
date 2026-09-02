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
    expect(deriveMealShares({
      "2026-08-01": [{ slot: "breakfast", cal: 400 }],
      "2026-08-02": [{ slot: "lunch", cal: 500 }],
    })).toEqual(DEFAULT_MEAL_SHARES);
  });

  it("ignores days with no slotted calories", () => {
    const hist = {};
    for (let i = 1; i <= 6; i += 1) {
      hist[`2026-08-0${i}`] = [{ name: "x", cal: 400 }];
    }
    expect(deriveMealShares(hist)).toEqual(DEFAULT_MEAL_SHARES);
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

  it("leaves about 275 cal and 25g protein after reserving dinner", () => {
    expect(remaining.cal).toBe(995);
    expect(budget.laterSlots).toEqual(["dinner"]);
    expect(budget.cal).toBeCloseTo(273, 0);
    expect(budget.pNeed).toBeCloseTo(26, 0);
    expect(budget.c).toBeCloseTo(65, 0);
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
    expect(pencilled.reserve.cal).toBe(720);
    expect(pencilled.cal).toBe(275);
    expect(pencilled.pNeed).toBe(3);
    expect(budgetSentence(pencilled)).toMatch(/pencilled in/);
    expect(budgetSentence(pencilled)).toMatch(/Chicken and rice bowl/);
  });

  it("writes the usual-dinner sentence when nothing is pencilled", () => {
    expect(budgetSentence(budget)).toMatch(/Saving room for dinner/);
    expect(budgetSentence(budget)).toMatch(/275|273/);
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

  it("asks for about 25g of protein at lunch when pNeed is high", () => {
    const read = coachRead({ budget: base, remaining: base.remaining, slot: "lunch" });
    expect(read.line1).toMatch(/You need about 25 g of protein at lunch/);
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
