/**
 * Hand-written plate → allergen table. Does not import ALLERGEN_WORDS
 * or the gate lists — those reused themselves and missed nigiri / miso.
 */
import { describe, expect, it } from "vitest";

import { buildCoachFallbackMeals } from "./coachFoodFallback.js";
import { filterCoachMeals, mealHaystack } from "./coachMealFilter.js";

const PLATE_ALLERGENS = [
  { name: "Nigiri and soup", desc: "6 pieces nigiri, 1 bowl miso soup", allergens: ["fish", "soy"], diets: ["vegan"] },
  { name: "Salmon nigiri", desc: "salmon nigiri", allergens: ["fish"], diets: ["vegan"] },
  { name: "Toast and peanut butter", desc: "toast and peanut butter", allergens: ["gluten", "peanuts"] },
  { name: "Eggs and toast", desc: "eggs and toast", allergens: ["gluten", "eggs"] },
  { name: "Tuna and crackers", desc: "tuna and crackers", allergens: ["fish", "gluten"] },
  { name: "Tuna pouch wrap", desc: "tuna pouch in a tortilla", allergens: ["fish", "gluten"] },
  { name: "Chipotle sofritas bowl", desc: "sofritas, beans, fajita veggies", allergens: ["soy"] },
  { name: "Pasta with jarred sauce", desc: "pasta and sauce", allergens: ["gluten"] },
  { name: "Bean and cheese quesadilla", desc: "tortillas, beans, and cheese", allergens: ["gluten", "dairy"] },
];

function plateOf(row) {
  return { name: row.name, desc: row.desc, ingredients: row.desc };
}

describe("independent plate-to-allergen table", () => {
  it("drops each listed plate for the named allergy or diet", () => {
    for (const row of PLATE_ALLERGENS) {
      for (const id of row.allergens) {
        const kept = filterCoachMeals([plateOf(row)], {
          text: "dinner ideas",
          profile: { allergens: [id] },
        });
        expect(kept, `${row.name} leaked through ${id}`).toEqual([]);
      }
      for (const diet of row.diets || []) {
        const kept = filterCoachMeals([plateOf(row)], {
          text: "dinner ideas",
          profile: { diet },
        });
        expect(kept, `${row.name} leaked through ${diet}`).toEqual([]);
      }
    }
  });

  it("sushi / gluten / soy fallbacks do not serve the leaking plates", () => {
    const fish = buildCoachFallbackMeals({
      text: "sushi tonight",
      slot: "dinner",
      topic: "sushi",
      profile: { allergens: ["fish"] },
    });
    expect(fish.every((meal) => !/nigiri|sushi|sashimi|poke|salmon|tuna|fish/i.test(mealHaystack(meal)))).toBe(true);

    const soy = buildCoachFallbackMeals({
      text: "sushi tonight",
      slot: "dinner",
      topic: "sushi",
      profile: { allergens: ["soy"] },
    });
    expect(soy.every((meal) => !/miso|edamame|tofu|nigiri and soup/i.test(mealHaystack(meal)))).toBe(true);

    const gluten = buildCoachFallbackMeals({
      text: "one-handed, no cooking",
      slot: "dinner",
      profile: { allergens: ["gluten"] },
    });
    expect(gluten.every((meal) => !/toast|cracker|bread|pasta|tortilla/i.test(mealHaystack(meal)))).toBe(true);

    const vegan = buildCoachFallbackMeals({
      text: "sushi tonight",
      slot: "dinner",
      topic: "sushi",
      profile: { diet: "vegan" },
    });
    expect(vegan.every((meal) => !/nigiri|salmon|fish|chicken/i.test(mealHaystack(meal)))).toBe(true);
  });
});
