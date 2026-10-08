/**
 * Drop a plate that breaks a stated constraint, a saved allergen or diet,
 * or a plate she just saw. Shared by the server and the phone so a peanut
 * allergy cannot leak Toast and peanut butter on any path.
 */

import {
  coachPrefsFromProfile,
  mealAllowedForDiet,
  mealHitsDislike,
} from "../../src/utils/coachPrefs.js";

const DAIRY = /\b(dairy|yogurt|yoghurt|cheese|milk|butter|whey|cream|cottage|shake)\b/i;
const CHICKEN = /\bchicken\b/i;
const EGGS = /\beggs?\b|\begg whites?\b/i;
const SMOOTHIE = /\bsmoothie\b/i;
const COTTAGE = /\bcottage cheese\b/i;
const SPINACH = /\bspinach\b/i;
const MEAT = /\b(chicken|turkey|beef|pork|steak|sausage|bacon|meatball|salmon|tuna|fish|halibut|burger|nuggets?)\b/i;

export function mealHaystack(meal) {
  if (!meal) return "";
  const bits = [meal.name, meal.desc, meal.title];
  for (const row of meal.ingredients || []) {
    if (typeof row === "string") bits.push(row);
    else bits.push(row?.item, row?.amount, row?.name);
  }
  return bits.filter(Boolean).join(" ");
}

function avoidsFood(asked, food) {
  const word = String(food || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!word) return false;
  return new RegExp(
    `\\b(sick of|tired of|hate|don'?t (?:want|like)|no more|without more|besides)\\b[^.?]{0,60}\\b${word}\\b`,
  ).test(asked)
    || new RegExp(`\\bno (?:more )?${word}\\b`).test(asked);
}

export function extractAskConstraints(text = "", profile = null) {
  const asked = String(text || "").toLowerCase();
  const allergens = Array.isArray(profile?.allergens)
    ? profile.allergens.map((item) => String(item).toLowerCase())
    : [];
  const avoids = String(profile?.foodAvoids || profile?.food_avoids || "").toLowerCase();
  const allergenNote = String(profile?.allergenNote || profile?.allergen_note || "").toLowerCase();
  const diet = String(profile?.diet || "").toLowerCase();
  return {
    noDairy: allergens.includes("dairy")
      || /\bdairy[- ]free\b/.test(asked)
      || /\bdairy[- ]free\b/.test(allergenNote)
      || /\bi'?m dairy free\b/.test(asked),
    noCottage: /\bcottage cheese\b/.test(avoids) || avoidsFood(asked, "cottage cheese"),
    noChicken: avoidsFood(asked, "chicken"),
    noEggs: avoidsFood(asked, "eggs") || avoidsFood(asked, "egg") || /\bbesides eggs\b/.test(asked),
    noSalmon: avoidsFood(asked, "salmon"),
    noSmoothie: /\bnot the smoothie\b/.test(asked) || /\bno smoothie\b/.test(asked),
    noSpinach: /\bdon'?t have spinach\b/.test(asked) || /\bno spinach\b/.test(asked),
    vegetarian: /\bvegetarian\b/.test(asked) || /\bmake it vegetarian\b/.test(asked) || diet === "vegetarian",
  };
}

export function mealBreaksConstraints(meal, constraints = {}, skipNames = []) {
  const hay = mealHaystack(meal);
  const name = String(meal?.name || "").trim().toLowerCase();
  if (name && skipNames.some((item) => String(item).trim().toLowerCase() === name)) return true;
  if (constraints.noDairy && DAIRY.test(hay)) return true;
  if (constraints.noCottage && COTTAGE.test(hay)) return true;
  if (constraints.noChicken && CHICKEN.test(hay)) return true;
  if (constraints.noEggs && EGGS.test(hay)) return true;
  if (constraints.noSalmon && /\bsalmon\b/i.test(hay)) return true;
  if (constraints.noSmoothie && SMOOTHIE.test(hay)) return true;
  if (constraints.noSpinach && SPINACH.test(hay)) return true;
  if (constraints.vegetarian && MEAT.test(hay)) return true;
  return false;
}

export function constraintTextFrom(text = "", priorAsks = []) {
  return [text, ...(Array.isArray(priorAsks) ? priorAsks : [])].filter(Boolean).join(" ");
}

/** Saved diet + allergens + Food prefs avoids. Same gate the ranker uses. */
export function mealBreaksSavedPrefs(meal, profile = null) {
  if (!meal || !profile) return false;
  const prefs = coachPrefsFromProfile(profile, null);
  if (!mealAllowedForDiet(meal, prefs.diet)) return true;
  if (mealHitsDislike(meal, prefs.dislikes)) return true;
  return false;
}

export function filterCoachMeals(meals, {
  text = "",
  profile = null,
  skipNames = [],
  priorAsks = [],
} = {}) {
  const constraints = extractAskConstraints(constraintTextFrom(text, priorAsks), profile);
  const skip = (skipNames || []).map((item) => String(item || "").trim()).filter(Boolean);
  return (Array.isArray(meals) ? meals : []).filter((meal) => (
    meal?.name
    && !mealBreaksConstraints(meal, constraints, skip)
    && !mealBreaksSavedPrefs(meal, profile)
  ));
}
