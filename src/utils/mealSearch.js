/**
 * Client-side meal search for Today → My plan, Meals, and the planner picker.
 * Matches name, slot, ingredients, and notes — all query words must hit.
 */

function ingredientBits(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!line) return [];
    if (typeof line === "string") return [line];
    if (typeof line === "object") {
      return [line.amount, line.item, line.name].filter(Boolean);
    }
    return [];
  });
}

function stepBits(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.map((step) => (typeof step === "string" ? step : String(step || ""))).filter(Boolean);
}

/** Lowercased haystack for one meal / pantry item / saved recipe. */
export function mealSearchHaystack(meal) {
  if (!meal || typeof meal !== "object") return "";
  const parts = [
    meal.name,
    meal.desc,
    meal.cat,
    meal.slot,
    meal.group,
    meal.basedOn,
    meal.note,
    ...ingredientBits(meal.ingredients),
    ...ingredientBits(meal.serving),
    ...ingredientBits(meal.batch),
    ...stepBits(meal.steps),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function mealQueryTokens(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function mealMatchesQuery(meal, query) {
  const tokens = mealQueryTokens(query);
  if (!tokens.length) return true;
  const hay = mealSearchHaystack(meal);
  return tokens.every((token) => hay.includes(token));
}

export function filterMealsByQuery(meals, query) {
  const list = Array.isArray(meals) ? meals : [];
  if (!mealQueryTokens(query).length) return list;
  return list.filter((meal) => mealMatchesQuery(meal, query));
}

/** Same slot chips as Meals → Breakfast / Lunch / Dinner / Snack / Treats. */
export const MEAL_SLOT_FILTERS = ["Breakfast", "Lunch", "Dinner", "Snack", "Treats"];

function titleSlotFilter(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "breakfast") return "Breakfast";
  if (s === "lunch") return "Lunch";
  if (s === "dinner") return "Dinner";
  if (s === "snack" || s === "snacks") return "Snack";
  if (s === "treat" || s === "treats") return "Treats";
  if (s === "pantry") return "Snack";
  return null;
}

/** Breakfast / Lunch / Dinner / Snack / Treats, or null if uncategorized. */
export function mealSlotFilterKey(meal) {
  if (!meal || typeof meal !== "object") return null;
  return titleSlotFilter(meal.cat) || titleSlotFilter(meal.slot) || null;
}

/**
 * Filter by Meals-tab slot. Uncategorized meals (most My meals) stay visible
 * when `includeUncategorized` is on so a Dinner chip doesn't hide saved plates.
 */
export function mealMatchesSlotFilter(meal, filter, { includeUncategorized = false } = {}) {
  const f = String(filter || "all").trim();
  if (!f || f.toLowerCase() === "all") return true;
  const key = mealSlotFilterKey(meal);
  if (key == null) return includeUncategorized;
  return key === f;
}

export function filterMealsBySlot(meals, filter, opts) {
  const list = Array.isArray(meals) ? meals : [];
  const f = String(filter || "all").trim();
  if (!f || f.toLowerCase() === "all") return list;
  return list.filter((meal) => mealMatchesSlotFilter(meal, f, opts));
}

/** First occurrence of each meal name (personalized plans repeat across days). */
export function uniqueMealsByName(meals) {
  const seen = new Set();
  const out = [];
  for (const meal of Array.isArray(meals) ? meals : []) {
    const key = String(meal?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(meal);
  }
  return out;
}
