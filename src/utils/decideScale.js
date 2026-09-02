import { scaleMealForLog, snapServings } from "./servings.jsx";
import { stripPortionSuffix } from "./decidePrefs.js";

/** Ranked decide cards already have cal/p/c/f multiplied by `servings`. */

export function rankedServings(card, override) {
  const raw = override != null ? override : (card?.servings ?? 1);
  return snapServings(raw);
}

export function unscaleRankedCard(card) {
  const servings = rankedServings(card);
  const div = (v) => (Number(v) || 0) / (servings || 1);
  return {
    ...card,
    name: stripPortionSuffix(card?.name),
    cal: div(card?.cal),
    p: div(card?.p),
    c: div(card?.c),
    f: div(card?.f),
    servings: 1,
  };
}

/** Scale a ranked card for a log row once. Never multiply an already-scaled card again. */
export function decideLogFromCard(card, qtyOverride) {
  const qty = rankedServings(card, qtyOverride);
  return {
    ...scaleMealForLog(unscaleRankedCard(card), qty),
    servings: qty,
  };
}

/** 1× macros + qty for the week plan so grocery and scaledMealMacros stay honest. */
export function decidePlanFieldsFromCard(card, qtyOverride) {
  const qty = rankedServings(card, qtyOverride);
  const base = unscaleRankedCard(card);
  return {
    name: base.name,
    cal: base.cal,
    p: base.p,
    c: base.c,
    f: base.f,
    qty,
    servings: qty,
    desc: base.desc || "",
    ingredients: base.ingredients,
    steps: base.steps,
    serving: base.serving,
    batch: base.batch,
    basedOn: base.basedOn,
    source: base.source,
  };
}

/** Grey row / Ate it totals. Prefer qty, then servings (recipe.serves must not win). */
export function decideDisplayMacros(planMeal) {
  const qty = snapServings(planMeal?.qty ?? planMeal?.servings ?? 1);
  const mul = (v) => Math.round((Number(v) || 0) * qty);
  return {
    cal: mul(planMeal?.cal),
    p: mul(planMeal?.p),
    c: mul(planMeal?.c),
    f: mul(planMeal?.f),
    qty,
  };
}
