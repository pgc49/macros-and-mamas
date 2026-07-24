/**
 * Smoke checks for week planner + taste suggestions + grocery-from-plan.
 * Run: npx vite-node scripts/smoke-planner.mjs
 */
import { DEFAULT_WEEK } from "../src/content/defaultWeek.js";
import { buildGroceryList } from "../src/utils/groceryList.js";
import {
  emptyWeekPlan,
  defaultSampleWeek,
  normalizeWeekDays,
  countPlannedMeals,
  addMealToDay,
  removeMealById,
  moveMeal,
  setMealQty,
  sumDayTotals,
  recipeToPlanMeal,
  customMealToPlanMeal,
  aiIdeaToPlanMeal,
  cloneDaysToPlan,
  rangeCoach,
  targetBands,
} from "../src/utils/weekPlan.js";
import { suggestRecipesForSlot, suggestWeekFromBank } from "../src/utils/suggestFromPrefs.js";
import { RECIPES } from "../src/content/data.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const empty = emptyWeekPlan();
assert(empty.length === 7, "empty week has 7 days");
assert(countPlannedMeals(empty) === 0, "empty has 0 meals");

const sample = defaultSampleWeek();
assert(countPlannedMeals(sample) === countPlannedMeals(DEFAULT_WEEK), "default sample matches DEFAULT_WEEK");
assert(sample[0].meals[0].id, "meals get ids");

const oats = RECIPES.find((r) => r.name === "Protein oatmeal");
const shake = RECIPES.find((r) => r.name === "Protein shake");
let week = addMealToDay(empty, "Mon", recipeToPlanMeal(oats, "breakfast"));
week = addMealToDay(week, "Mon", recipeToPlanMeal(shake, "snack"));
week = addMealToDay(week, "Mon", recipeToPlanMeal(RECIPES.find((r) => r.name === "Apple + peanut butter"), "snack"));
assert(countPlannedMeals(week) === 3, "multiple snacks allowed");
assert(week[0].meals.filter((m) => m.slot === "snack").length === 2, "two snacks on Mon");

const snackId = week[0].meals.find((m) => m.slot === "snack").id;
week = moveMeal(week, snackId, "Tue");
assert(week[0].meals.filter((m) => m.slot === "snack").length === 1, "one snack left Mon");
assert(week[1].meals.some((m) => m.id === snackId), "snack moved to Tue");

week = removeMealById(week, snackId);
assert(!week[1].meals.some((m) => m.id === snackId), "removed by id");

const fri = addMealToDay(empty, "Fri", recipeToPlanMeal(oats, "breakfast"));
const oatsId = fri[4].meals[0].id;
const withQty = setMealQty(fri, oatsId, 2);
assert(sumDayTotals(withQty[4].meals).cal === oats.cal * 2, "qty scales day totals");

const bands = targetBands({ cal: 2000, protein: 150, carbs: 180, fat: 60 });
const building = rangeCoach({ cal: 400, p: 30, c: 40, f: 10 }, bands, 1);
assert(building.phase === "building", "one meal is still building");
assert(building.tips.length >= 1, "building has tips");
const inRange = rangeCoach({ cal: 2050, p: 155, c: 185, f: 65 }, bands, 4);
assert(inRange.phase === "in", "full day in range");
const shortP = rangeCoach({ cal: 2100, p: 120, c: 185, f: 65 }, bands, 4);
assert(shortP.phase === "adjust" && /protein/i.test(shortP.tips.join(" ")), "short protein tip");

const profile = {
  prefB: "smoothies and oatmeal",
  prefL: "big salads",
  prefD: "tacos and asian flavors",
};
const breakfastHits = suggestRecipesForSlot(profile, "breakfast", { limit: 3 });
assert(breakfastHits.length >= 1, "breakfast suggestions");

const bankWeek = suggestWeekFromBank(profile);
assert(bankWeek.length === 7, "bank week 7 days");
assert(countPlannedMeals(bankWeek) >= 20, "bank week mostly filled");

const fromDefault = cloneDaysToPlan(DEFAULT_WEEK);
assert(countPlannedMeals(fromDefault) === countPlannedMeals(DEFAULT_WEEK), "clone preserves count");

const groceryEmpty = buildGroceryList(normalizeWeekDays(empty));
assert(groceryEmpty.mealCount === 0 && groceryEmpty.lineCount === 0, "empty plan → empty grocery");

const groceryPlanned = buildGroceryList(addMealToDay(empty, "Wed", recipeToPlanMeal(oats, "breakfast")));
assert(groceryPlanned.mealCount === 1 && groceryPlanned.lineCount > 0, "planned grocery has items");

const customPlan = customMealToPlanMeal({ name: "My turkey wrap", cal: 420, p: 35, c: 30, f: 14 }, "lunch");
assert(customPlan.slot === "lunch" && customPlan.name === "My turkey wrap", "custom → plan meal");
assert(!(customPlan.ingredients || []).length, "custom meals are macros-only");

const aiPlan = aiIdeaToPlanMeal({
  slot: "dinner",
  name: "AI taco bowl",
  basedOn: "Turkey taco bowls",
  cal: 500,
  p: 40,
  c: 45,
  f: 16,
  ingredients: [{ item: "turkey", amount: "4 oz" }],
  steps: ["Cook turkey", "Build bowl"],
}, "dinner");
assert(aiPlan.ingredients.length === 1 && aiPlan.steps.length === 2, "AI idea keeps recipe");

console.log("OK planner smoke", {
  sampleMeals: countPlannedMeals(sample),
  breakfastTop: breakfastHits.slice(0, 2).map((h) => `${h.recipe.name}(${h.score})`),
  groceryItems: groceryPlanned.lineCount,
});
