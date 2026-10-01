function normalizeMyMealName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
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
  const name = normalizeMyMealName(meal?.name);
  return Boolean(name && lookup.names.has(name));
}
