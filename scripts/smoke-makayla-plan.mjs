/**
 * Reproduce grocery/plan crash with Makayla-like AI meal shapes.
 * Run: npx vite-node scripts/smoke-makayla-plan.mjs
 */
import { buildGroceryList } from "../src/utils/groceryList.js";
import { normalizeWeekDays, countPlannedMeals, targetBands, rangeCoach } from "../src/utils/weekPlan.js";
import { withRecipeDetail, mealToCard } from "../src/content/recipeDetails.js";

function assert(c, m) { if (!c) throw new Error(m); }

const sampleDay = {
  day: "Mon",
  theme: "Comfort",
  dayTotals: { cal: 1735, p: 143, c: 176, f: 65 },
  meals: [
    {
      id: "1", name: "Protein pancakes", slot: "breakfast", cal: 410, p: 36, c: 49, f: 9, qty: 1,
      basedOn: "Protein pancakes", servings: 1, batch: null,
      steps: ["Blend oats"],
      ingredients: [{ item: "oats", amount: "40g" }, { item: "egg", amount: "1" }],
    },
    {
      id: "2", name: "Steak + sweet potato", slot: "dinner", cal: 750, p: 50, c: 80, f: 25, qty: 1,
      basedOn: null, servings: 1, batch: null,
      steps: ["Sear steak"],
      ingredients: [{ item: "sirloin steak", amount: "6 oz" }, { item: "sweet potato", amount: "200g" }],
    },
    {
      id: "3", name: "Pulled chicken + slaw bowl", slot: "lunch", cal: 435, p: 51, c: 42, f: 5, qty: 1,
      basedOn: "Pulled chicken + slaw bowl", servings: 1, batch: "3 servings",
      steps: ["Assemble"],
      ingredients: [{ item: "pulled chicken", amount: "140g" }],
    },
  ],
};

const week = normalizeWeekDays([sampleDay]);
assert(week.length === 7, "pads to 7 days");
assert(countPlannedMeals(week) === 3, "meal count");

const macros = { cal: 1750, protein: 140, carbs: 170, fat: 55 };
const bands = targetBands(macros);
const coach = rangeCoach(week[0], bands);
console.log("coach", coach);

for (const m of sampleDay.meals) {
  const card = mealToCard(m);
  const detailed = withRecipeDetail(m);
  console.log("card", m.name, !!card, "detail", !!detailed);
}

const list = buildGroceryList(week);
console.log("OK grocery", { lines: list.lineCount, aisles: list.sections.map(s => s.aisle) });
