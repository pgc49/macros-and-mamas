/**
 * Server-side week-plan meal shape guards.
 * AI sometimes returns batch: "3 servings" — that must never persist.
 */

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

export function asStepLines(value, { max = 12 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 400))
    .slice(0, max);
}

export function asBatchLines(value, { max = 40 } = {}) {
  const lines = asIngredientLines(value, { max });
  return lines.length ? lines : null;
}

export function sanitizePlanMeal(meal) {
  if (!meal || typeof meal !== "object") return meal;
  const ingredients = asIngredientLines(meal.ingredients ?? meal.serving, { max: 24 });
  // Always overwrite serving — drop string labels; keep real arrays (or omit if absent).
  const serving = Array.isArray(meal.serving)
    ? asIngredientLines(meal.serving, { max: 24 })
    : (meal.serving !== undefined ? [] : undefined);
  const batch = asBatchLines(meal.batch, { max: 30 });
  const steps = asStepLines(meal.steps, { max: 10 });
  return {
    ...meal,
    ingredients,
    ...(serving !== undefined ? { serving } : {}),
    batch,
    steps,
  };
}
