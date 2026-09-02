import { describe, expect, it } from "vitest";
import {
  filterMealsByRemaining,
  formatRoomLeft,
  mealFitsRemaining,
  remainingAfterMeal,
  roomLeftFromTotals,
} from "./eatingOutImpact.js";

const remaining = { cal: 450, p: 40, c: 40, f: 15 };

describe("mealFitsRemaining", () => {
  it("treats missing remaining as a pass so the bank does not hide meals", () => {
    expect(mealFitsRemaining({ cal: 800, p: 50, c: 70, f: 20 }, null)).toBe(true);
  });

  it("fits a snack that stays under remaining room", () => {
    expect(mealFitsRemaining({ cal: 180, p: 24, c: 16, f: 2 }, remaining)).toBe(true);
  });

  it("allows a small nick over the day high (ranges, not rules)", () => {
    expect(mealFitsRemaining({ cal: 480, p: 38, c: 42, f: 16 }, remaining)).toBe(true);
  });

  it("rejects a dinner that blows remaining calories and carbs", () => {
    expect(mealFitsRemaining({ cal: 540, p: 38, c: 64, f: 13 }, remaining)).toBe(false);
  });

  it("filters a list to meals that fit", () => {
    const snack = { name: "Yogurt", cal: 180, p: 24, c: 16, f: 2 };
    const dinner = { name: "Teriyaki", cal: 540, p: 38, c: 64, f: 13 };
    expect(filterMealsByRemaining([snack, dinner], remaining).map((m) => m.name)).toEqual(["Yogurt"]);
  });
});

describe("roomLeftFromTotals + formatRoomLeft", () => {
  it("subtracts logged totals from day highs", () => {
    const room = roomLeftFromTotals(
      { cal: 1400, p: 90, c: 120, f: 45 },
      { calHi: 1850, pHi: 130, cHi: 160, fHi: 60 },
    );
    expect(room.remaining).toEqual({ cal: 450, p: 40, c: 40, f: 15 });
    expect(formatRoomLeft(room.remaining)).toBe("450 cal · P 40g · C 40g · F 15g");
  });

  it("projects leftover after a meal", () => {
    expect(remainingAfterMeal({ cal: 180, p: 24, c: 16, f: 2 }, remaining)).toEqual({
      cal: 270,
      p: 16,
      c: 24,
      f: 13,
    });
  });
});
