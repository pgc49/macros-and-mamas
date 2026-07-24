/**
 * Smoke checks for week planner + taste suggestions + grocery-from-plan.
 * Run: node scripts/smoke-planner.mjs
 */
import { DEFAULT_WEEK } from "../src/content/defaultWeek.js";
import { buildGroceryList } from "../src/utils/groceryList.js";
import {
  emptyWeekPlan,
  normalizeWeekDays,
  countPlannedMeals,
  setSlotMeal,
  recipeToPlanMeal,
  cloneDaysToPlan,
  mealForSlot,
} from "../src/utils/weekPlan.js";
import { suggestRecipesForSlot, suggestWeekFromBank } from "../src/utils/suggestFromPrefs.js";
import { RECIPES } from "../src/content/data.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const empty = emptyWeekPlan();
assert(empty.length === 7, "empty week has 7 days");
assert(countPlannedMeals(empty) === 0, "empty has 0 meals");

const oats = RECIPES.find((r) => r.name === "Protein oatmeal");
const withBreakfast = setSlotMeal(empty, "Mon", "breakfast", recipeToPlanMeal(oats, "breakfast"));
assert(countPlannedMeals(withBreakfast) === 1, "one meal after set");
assert(mealForSlot(withBreakfast[0], "breakfast")?.name === "Protein oatmeal", "slot meal");

const cleared = setSlotMeal(withBreakfast, "Mon", "breakfast", null);
assert(countPlannedMeals(cleared) === 0, "cleared slot");

const profile = {
  prefB: "smoothies and oatmeal",
  prefL: "big salads",
  prefD: "tacos and asian flavors",
};
const breakfastHits = suggestRecipesForSlot(profile, "breakfast", { limit: 3 });
assert(breakfastHits.length >= 1, "breakfast suggestions");
assert(
  breakfastHits.some((h) => /smoothie|oatmeal|oat/i.test(h.recipe.name)) || breakfastHits[0].score >= 0,
  "taste match present or bank fallback",
);

const bankWeek = suggestWeekFromBank(profile);
assert(bankWeek.length === 7, "bank week 7 days");
assert(countPlannedMeals(bankWeek) >= 20, "bank week mostly filled");

const fromDefault = cloneDaysToPlan(DEFAULT_WEEK);
assert(countPlannedMeals(fromDefault) === countPlannedMeals(DEFAULT_WEEK), "clone preserves count");

const groceryEmpty = buildGroceryList(normalizeWeekDays(empty));
assert(groceryEmpty.mealCount === 0, "empty plan → 0 grocery meals");
assert(groceryEmpty.lineCount === 0, "empty plan → 0 grocery lines");

const groceryPlanned = buildGroceryList(withBreakfast);
assert(groceryPlanned.mealCount === 1, "planned grocery meal count");
assert(groceryPlanned.lineCount > 0, "planned grocery has items");

console.log("OK planner smoke", {
  breakfastTop: breakfastHits.slice(0, 2).map((h) => `${h.recipe.name}(${h.score})`),
  bankMeals: countPlannedMeals(bankWeek),
  groceryItems: groceryPlanned.lineCount,
});
