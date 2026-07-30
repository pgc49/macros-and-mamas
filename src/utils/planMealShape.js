/**
 * Harden week-plan meal shapes from AI / legacy storage.
 * batch/serving/ingredients/steps must be arrays (or null) — never labels
 * like batch: "3 servings", which previously crashed Plan my week.
 */

/** Ingredient-line arrays only (objects with item/amount, or empty). */
export function asIngredientLines(value, { max = 40 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line) => line && typeof line === "object")
    .map((line) => ({
      item: String(line.item || line.name || "").slice(0, 160),
      amount: String(line.amount || "").slice(0, 80),
    }))
    .filter((line) => line.item)
    .slice(0, max);
}

/**
 * My meals store ingredients as a newline (or " · ") joined string from Create Recipe.
 * Planner / grocery need { amount, item }[] — parse best-effort.
 */
export function ingredientsFromText(value, { max = 40 } = {}) {
  if (Array.isArray(value)) {
    if (!value.length) return [];
    if (typeof value[0] === "object") return asIngredientLines(value, { max });
    return asIngredientLines(
      value.map((line) => lineToIngredient(String(line || ""))).filter(Boolean),
      { max },
    );
  }
  const text = String(value || "").trim();
  if (!text) return [];
  const chunks = text
    .split(/\n+| · |•/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return asIngredientLines(chunks.map(lineToIngredient).filter(Boolean), { max });
}

/** "1 cup oats" → { amount: "1 cup", item: "oats" }; otherwise whole line as item. */
function lineToIngredient(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  const m = s.match(
    /^((?:\d+\s*\/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞\d./\-]+)\s*(?:cups?|tbsp|tsp|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|cloves?|slices?|cans?|packages?|pkgs?|bunches?|handfuls?|pinch(?:es)?|dash(?:es)?|links?|pieces?)?)\s+(.+)$/i,
  );
  if (m) {
    return {
      amount: m[1].trim().slice(0, 80),
      item: m[2].trim().slice(0, 160),
    };
  }
  return { amount: "", item: s.slice(0, 160) };
}

export function asStepLines(value, { max = 12 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 400))
    .slice(0, max);
}

/** batch: ingredient array or null — never a string label. */
export function asBatchLines(value, { max = 40 } = {}) {
  const lines = asIngredientLines(value, { max });
  return lines.length ? lines : null;
}

/**
 * Coerce one planner meal so recipe fields are safe for grocery + recipe UI.
 * Preserves macros/ids/qty; drops poison on recipe arrays.
 */
export function sanitizePlanMeal(meal) {
  if (!meal || typeof meal !== "object") return meal;
  const ingredients = asIngredientLines(meal.ingredients ?? meal.serving);
  // Always overwrite serving — drop string labels; keep real arrays (or omit if absent).
  const serving = Array.isArray(meal.serving)
    ? asIngredientLines(meal.serving)
    : (meal.serving !== undefined ? [] : undefined);
  const batch = asBatchLines(meal.batch);
  const steps = asStepLines(meal.steps);
  return {
    ...meal,
    ingredients,
    ...(serving !== undefined ? { serving } : {}),
    batch,
    steps,
  };
}

/** Sanitize every meal across a week (does not pad days — use normalizeWeekDays). */
export function sanitizeWeekMeals(days) {
  return (Array.isArray(days) ? days : []).map((d) => {
    if (!d || typeof d !== "object") return d;
    const meals = Array.isArray(d.meals)
      ? d.meals.map((m) => (m && m.name ? sanitizePlanMeal(m) : m))
      : [];
    return { ...d, meals };
  });
}

/** True if any meal still has non-array recipe fields (legacy AI poison). */
export function weekPlanHasPoisonShapes(days) {
  return (Array.isArray(days) ? days : []).some((d) =>
    (Array.isArray(d?.meals) ? d.meals : []).some((m) => {
      if (!m) return false;
      return (
        (m.batch != null && !Array.isArray(m.batch))
        || (m.ingredients != null && !Array.isArray(m.ingredients))
        || (m.serving != null && !Array.isArray(m.serving))
        || (m.steps != null && !Array.isArray(m.steps))
      );
    }),
  );
}
