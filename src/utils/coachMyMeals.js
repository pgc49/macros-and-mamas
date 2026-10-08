import { RECIPES } from "../content/data.js";

function normalizeMyMealName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Card titles append "· half portion". Identity is the meal name before that. */
export function mealNameKey(name) {
  return normalizeMyMealName(String(name || "").replace(/\s·\s.*$/i, ""));
}

/** Stored thread cards say this when they were filed from My meals. */
const MY_MEAL_TAG = "my meals";

/**
 * A card that presents itself as one of her saved meals.
 * `source` is the ranker. Older payloads only kept the chip text.
 */
export function cardClaimsMyMeal(card) {
  if (!card) return false;
  if (card.source === "my") return true;
  return String(card.tag || "").trim().toLowerCase() === MY_MEAL_TAG;
}

export function buildLiveMyMealsLookup(customMeals = []) {
  const ids = new Set();
  const names = new Set();
  for (const meal of customMeals || []) {
    const id = meal?.id == null ? "" : String(meal.id);
    const name = normalizeMyMealName(meal?.name);
    if (id) ids.add(id);
    if (name) names.add(name);
  }
  return { ids, names };
}

export function isLiveMyMeal(meal, lookup) {
  if (!meal || !lookup) return false;
  const id = meal?.id == null ? "" : String(meal.id);
  if (id && lookup.ids.has(id)) return true;
  const name = mealNameKey(meal?.name);
  if (name && lookup.names.has(name)) return true;
  const based = mealNameKey(meal?.basedOn);
  return Boolean(based && lookup.names.has(based));
}

let bankNamesCache = null;

/** Exact Callie bank names. Similar names ("Sheet pan chicken with…") are not a match. */
export function bankMealNameSet(recipes = RECIPES) {
  if (recipes === RECIPES && bankNamesCache) return bankNamesCache;
  const names = new Set();
  for (const recipe of recipes || []) {
    const key = mealNameKey(recipe?.name);
    if (key) names.add(key);
  }
  if (recipes === RECIPES) bankNamesCache = names;
  return names;
}

export function isBankCoachCard(card, bankNames = bankMealNameSet()) {
  if (!card) return false;
  if (card.source === "bank") return true;
  const name = mealNameKey(card.name);
  return Boolean(name && bankNames.has(name));
}

/**
 * A thread card that is one of her customs and that custom is no longer saved.
 * Chip text does not matter: "Made for tonight" still carries the saved
 * name in `basedOn`. Bank recipes and live customs stay.
 */
export function cardIsGoneCustom(card, lookup, bankNames = bankMealNameSet()) {
  if (!card || !lookup) return false;
  if (isBankCoachCard(card, bankNames)) return false;
  if (isLiveMyMeal(card, lookup)) return false;
  if (cardClaimsMyMeal(card)) return true;
  const based = mealNameKey(card.basedOn);
  if (!based || bankNames.has(based)) return false;
  return true;
}

/**
 * A failed `custom_meals` fetch is not an empty kitchen. Keep whatever she
 * already had on screen instead of wiping My meals.
 */
export function nextCustomMeals(current, loaded) {
  if (!Array.isArray(loaded)) return Array.isArray(current) ? current : [];
  return loaded;
}
