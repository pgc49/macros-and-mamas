import { describe, expect, it } from "vitest";
import { addMealToDay, emptyWeekPlan, recipeToPlanMeal, replaceMealById } from "./weekPlan.js";

const TUNA = {
  cat: "Lunch",
  name: "Tuna salad lettuce wraps",
  cal: 245,
  p: 31,
  c: 28,
  f: 2,
  serves: 1,
};

describe("recipeToPlanMeal", () => {
  it("keeps a caller-supplied qty instead of hardcoding 1", () => {
    const meal = recipeToPlanMeal({ ...TUNA, qty: 1.5 }, "lunch");
    expect(meal.qty).toBe(1.5);
    expect(meal.cal).toBe(245);
  });
});

describe("replaceMealById qty", () => {
  it("lets a decide pencil’s new qty win over a leftover 1", () => {
    const seeded = addMealToDay(emptyWeekPlan(), "Wed", {
      ...recipeToPlanMeal(TUNA, "lunch"),
      via: "decide",
      qty: 1,
    });
    const id = seeded.find((d) => d.day === "Wed").meals[0].id;
    const next = replaceMealById(seeded, id, {
      ...recipeToPlanMeal({ ...TUNA, qty: 1.5 }, "lunch"),
      via: "decide",
      qty: 1.5,
    });
    expect(next.find((d) => d.day === "Wed").meals[0].qty).toBe(1.5);
  });

  it("keeps the planner serving when swapping a non-decide recipe", () => {
    const seeded = addMealToDay(emptyWeekPlan(), "Wed", {
      ...recipeToPlanMeal(TUNA, "lunch"),
      qty: 2,
    });
    const id = seeded.find((d) => d.day === "Wed").meals[0].id;
    const next = replaceMealById(seeded, id, recipeToPlanMeal(TUNA, "lunch"));
    expect(next.find((d) => d.day === "Wed").meals[0].qty).toBe(2);
  });
});
