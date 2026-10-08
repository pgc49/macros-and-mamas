import { describe, expect, it } from "vitest";

import { extractAskConstraints, filterCoachMeals, mealBreaksConstraints } from "./coachMealFilter.js";

const YOGURT = {
  name: "Greek yogurt with berries",
  desc: "Yogurt and fruit.",
  ingredients: [{ item: "nonfat Greek yogurt", amount: "170g" }],
};
const CHICKEN = { name: "Sheet pan chicken", desc: "Chicken and potatoes." };
const SMOOTHIE = { name: "Berry protein smoothie", desc: "A smoothie." };
const SCRAMBLE = { name: "Veggie scramble", desc: "Eggs and vegetables.", ingredients: [{ item: "eggs", amount: "2" }] };
const BEANS = { name: "Bean and rice bowl", desc: "Beans and rice." };

describe("extractAskConstraints", () => {
  it("reads the ask and the saved profile", () => {
    expect(extractAskConstraints("not the smoothie again").noSmoothie).toBe(true);
    expect(extractAskConstraints("what else besides eggs for breakfast").noEggs).toBe(true);
    expect(extractAskConstraints("how do I hit protein without more chicken").noChicken).toBe(true);
    expect(extractAskConstraints("I'm dairy free, breakfast ideas?").noDairy).toBe(true);
    expect(extractAskConstraints("make it vegetarian").vegetarian).toBe(true);
    expect(extractAskConstraints("I don't have spinach, swap?").noSpinach).toBe(true);
    expect(extractAskConstraints("dinner", {
      allergens: ["dairy"],
      foodAvoids: "cottage cheese",
    })).toEqual(expect.objectContaining({ noDairy: true, noCottage: true }));
  });
});

describe("filterCoachMeals", () => {
  it("drops a plate that breaks the ask or the last one she saw", () => {
    expect(mealBreaksConstraints(SMOOTHIE, { noSmoothie: true })).toBe(true);
    expect(filterCoachMeals([YOGURT, CHICKEN, BEANS], {
      text: "I'm dairy free, breakfast ideas?",
    }).map((meal) => meal.name)).toEqual(["Sheet pan chicken", "Bean and rice bowl"]);
    expect(filterCoachMeals([SCRAMBLE, CHICKEN], {
      text: "what else besides eggs for breakfast",
    }).map((meal) => meal.name)).toEqual(["Sheet pan chicken"]);
    expect(filterCoachMeals([CHICKEN, BEANS], {
      text: "make it vegetarian",
      skipNames: ["Sheet pan chicken"],
    }).map((meal) => meal.name)).toEqual(["Bean and rice bowl"]);
  });
});
