import { describe, expect, it } from "vitest";
import {
  filterMealsByQuery,
  filterMealsBySlot,
  mealMatchesQuery,
  mealMatchesSlotFilter,
  mealSlotFilterKey,
  uniqueMealsByName,
} from "./mealSearch.js";

const oatmeal = {
  cat: "Breakfast",
  name: "Protein oatmeal",
  desc: "oats cooked in water, vanilla protein, berries",
  ingredients: "½ cup dry oats · 1 scoop protein",
};

const chicken = {
  cat: "Dinner",
  name: "Callie's chicken teriyaki",
  serving: [{ amount: "6 oz", item: "chicken thighs" }, { amount: "1 cup", item: "cooked rice" }],
};

describe("mealMatchesQuery", () => {
  it("matches an empty query", () => {
    expect(mealMatchesQuery(oatmeal, "")).toBe(true);
    expect(mealMatchesQuery(oatmeal, "   ")).toBe(true);
  });

  it("matches name, ingredients, and category", () => {
    expect(mealMatchesQuery(oatmeal, "oatmeal")).toBe(true);
    expect(mealMatchesQuery(oatmeal, "oats")).toBe(true);
    expect(mealMatchesQuery(oatmeal, "breakfast")).toBe(true);
    expect(mealMatchesQuery(chicken, "rice")).toBe(true);
  });

  it("requires every word to hit", () => {
    expect(mealMatchesQuery(oatmeal, "protein oats")).toBe(true);
    expect(mealMatchesQuery(oatmeal, "protein steak")).toBe(false);
    expect(mealMatchesQuery(chicken, "chicken pasta")).toBe(false);
  });
});

describe("filterMealsByQuery", () => {
  it("returns the original list when the query is blank", () => {
    const list = [oatmeal, chicken];
    expect(filterMealsByQuery(list, "")).toBe(list);
    expect(filterMealsByQuery(list, "chicken")).toEqual([chicken]);
  });
});

describe("mealSlotFilterKey", () => {
  it("keeps Treats separate from Snack", () => {
    expect(mealSlotFilterKey({ cat: "Treats" })).toBe("Treats");
    expect(mealSlotFilterKey({ cat: "Snack" })).toBe("Snack");
    expect(mealSlotFilterKey({ cat: "Pantry" })).toBe("Snack");
    expect(mealSlotFilterKey({ slot: "breakfast" })).toBe("Breakfast");
    expect(mealSlotFilterKey({ name: "Mystery plate" })).toBe(null);
  });
});

describe("filterMealsBySlot", () => {
  it("returns the original list for All", () => {
    const list = [oatmeal, chicken];
    expect(filterMealsBySlot(list, "all")).toBe(list);
    expect(filterMealsBySlot(list, "")).toBe(list);
  });

  it("matches cat and slot, and can keep uncategorized My meals", () => {
    const saved = { name: "Turkey and Bacon" };
    expect(mealMatchesSlotFilter(oatmeal, "Breakfast")).toBe(true);
    expect(mealMatchesSlotFilter(chicken, "Breakfast")).toBe(false);
    expect(mealMatchesSlotFilter(saved, "Dinner")).toBe(false);
    expect(mealMatchesSlotFilter(saved, "Dinner", { includeUncategorized: true })).toBe(true);
    expect(filterMealsBySlot([oatmeal, chicken, saved], "Dinner", { includeUncategorized: true }))
      .toEqual([chicken, saved]);
  });
});

describe("uniqueMealsByName", () => {
  it("keeps the first copy of a repeated name", () => {
    expect(uniqueMealsByName([oatmeal, { ...oatmeal, desc: "dup" }, chicken])).toEqual([
      oatmeal,
      chicken,
    ]);
  });
});
