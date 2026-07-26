/**
 * Bulletproof Plan my week shapes — Makayla-class AI poison must never crash grocery.
 * Run: npx vite-node scripts/smoke-makayla-plan.mjs
 */
import { buildGroceryList, safeBuildGroceryList } from "../src/utils/groceryList.js";
import {
  normalizeWeekDays,
  countPlannedMeals,
  cloneDaysToPlan,
  targetBands,
  rangeCoach,
} from "../src/utils/weekPlan.js";
import { withRecipeDetail, mealToCard } from "../src/content/recipeDetails.js";
import {
  sanitizePlanMeal,
  sanitizeWeekMeals,
  weekPlanHasPoisonShapes,
} from "../src/utils/planMealShape.js";

function assert(c, m) { if (!c) throw new Error(m); }

const poisonMeals = [
  {
    id: "1", name: "Protein pancakes", slot: "breakfast", cal: 410, p: 36, c: 49, f: 9, qty: 1,
    basedOn: "Protein pancakes", servings: 1, batch: null,
    steps: ["Blend oats"],
    ingredients: [{ item: "oats", amount: "40g" }, { item: "egg", amount: "1" }],
  },
  {
    id: "2", name: "Steak + sweet potato", slot: "dinner", cal: 750, p: 50, c: 80, f: 25, qty: 1,
    basedOn: null, servings: 1, batch: "4 servings",
    steps: "Sear steak",
    ingredients: "steak and potato",
    serving: "1 plate",
  },
  {
    id: "3", name: "Pulled chicken + slaw bowl", slot: "lunch", cal: 435, p: 51, c: 42, f: 5, qty: 1,
    basedOn: "Pulled chicken + slaw bowl", servings: 1, batch: "3 servings",
    steps: ["Assemble"],
    ingredients: [{ item: "pulled chicken", amount: "140g" }],
  },
  {
    id: "4", name: "Weird nulls", slot: "snack", cal: 100, p: 10, c: 10, f: 2, qty: 1,
    batch: 3,
    ingredients: [{ item: "yogurt", amount: "1 cup" }, "skip-me", null],
    steps: [null, "", "Stir"],
  },
];

const sampleDay = {
  day: "Mon",
  theme: "Comfort",
  dayTotals: { cal: 1735, p: 143, c: 176, f: 65 },
  meals: poisonMeals,
};

assert(weekPlanHasPoisonShapes([sampleDay]), "detects poison before sanitize");

const cleanedMeal = sanitizePlanMeal(poisonMeals[1]);
assert(cleanedMeal.batch === null, "string batch → null");
assert(Array.isArray(cleanedMeal.ingredients) && cleanedMeal.ingredients.length === 0, "string ingredients → []");
assert(Array.isArray(cleanedMeal.steps) && cleanedMeal.steps.length === 0, "string steps → []");

const healed = sanitizeWeekMeals([sampleDay]);
assert(!weekPlanHasPoisonShapes(healed), "sanitizeWeekMeals clears poison");

const week = normalizeWeekDays([sampleDay]);
assert(week.length === 7, "pads to 7 days");
assert(countPlannedMeals(week) === 4, "meal count");
assert(!weekPlanHasPoisonShapes(week), "normalizeWeekDays sanitizes");

const cloned = cloneDaysToPlan([sampleDay]);
assert(!weekPlanHasPoisonShapes(cloned), "cloneDaysToPlan sanitizes");
assert(cloned[0].meals.every((m) => m.batch === null || Array.isArray(m.batch)), "clone batch safe");

const macros = { cal: 1750, protein: 140, carbs: 170, fat: 55 };
const bands = targetBands(macros);
const coach = rangeCoach(week[0], bands);
console.log("coach", coach);

for (const m of poisonMeals) {
  const card = mealToCard(m);
  const detailed = withRecipeDetail(m);
  assert(card.batch === null || Array.isArray(card.batch), `card batch safe: ${m.name}`);
  assert(Array.isArray(card.serving), `card serving array: ${m.name}`);
  assert(Array.isArray(card.steps), `card steps array: ${m.name}`);
  assert(detailed.batch === null || Array.isArray(detailed.batch), `detail batch safe: ${m.name}`);
  console.log("card", m.name, "batch", card.batch, "serving", card.serving.length);
}

const list = buildGroceryList(week);
assert(list.lineCount >= 1, "grocery built lines");
console.log("OK grocery", { lines: list.lineCount, aisles: list.sections.map((s) => s.aisle) });

// safeBuild must never throw even if buildGroceryList is handed garbage
const safe = safeBuildGroceryList({ not: "an array" });
assert(Array.isArray(safe.sections), "safeBuild returns sections");
console.log("OK safeBuild on garbage", safe);

// Direct poison into buildGroceryList (bypass normalize) must not throw
const rawPoisonWeek = [{ day: "Mon", meals: poisonMeals }];
let threw = false;
try {
  buildGroceryList(rawPoisonWeek);
} catch (e) {
  threw = true;
  console.error("buildGroceryList still throws on raw poison", e);
}
assert(!threw, "buildGroceryList tolerates raw poison without normalize");
const safeRaw = safeBuildGroceryList(rawPoisonWeek);
assert(Array.isArray(safeRaw.sections), "safeBuild on raw poison");

console.log("OK bulletproof plan shapes");
