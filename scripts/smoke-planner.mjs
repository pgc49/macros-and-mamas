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
  recipeToPlanMeal,
  cloneDaysToPlan,
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

console.log("OK planner smoke", {
  sampleMeals: countPlannedMeals(sample),
  breakfastTop: breakfastHits.slice(0, 2).map((h) => `${h.recipe.name}(${h.score})`),
  groceryItems: groceryPlanned.lineCount,
});
