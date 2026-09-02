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

/**
 * Sheet-scaled macros + qty 1 for the week plan.
 * Grey / Ate it must not remultiply. recipe.serves must not become qty.
 */
export function decidePlanFieldsFromCard(card, qtyOverride) {
  const logged = decideLogFromCard(card, qtyOverride);
  const base = unscaleRankedCard(card);
  return {
    name: stripPortionSuffix(card?.name || logged.name),
    cal: logged.cal,
    p: logged.p,
    c: logged.c,
    f: logged.f,
    qty: 1,
    servings: 1,
    desc: base.desc || "",
    ingredients: base.ingredients,
    steps: base.steps,
    serving: base.serving,
    batch: base.batch,
    basedOn: base.basedOn,
    source: base.source,
  };
}

/** Grey row / Ate it. Decide pencils use qty only — never servings / recipe.serves. */
export function decideDisplayMacros(planMeal) {
  const qty = planMeal?.via === "decide"
    ? snapServings(planMeal?.qty ?? 1)
    : snapServings(planMeal?.qty ?? planMeal?.servings ?? 1);
  const mul = (v) => Math.round((Number(v) || 0) * qty);
  return {
    cal: mul(planMeal?.cal),
    p: mul(planMeal?.p),
    c: mul(planMeal?.c),
    f: mul(planMeal?.f),
    qty,
  };
}
