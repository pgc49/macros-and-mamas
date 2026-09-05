/**
 * Ranked coach cards already carry cal/p/c/f multiplied by `servings`.
 * Everything here exists so a card is never multiplied a second time on its
 * way into a log row or a plan row.
 */

import { scaleMealForLog, snapServings } from "./servings.jsx";
import { stripPortionSuffix } from "./coachPrefs.js";
import { COACH_VIA } from "./coachBudget.js";

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

/** Scale a ranked card for a log row exactly once. */
export function coachLogFromCard(card, qtyOverride) {
  const qty = rankedServings(card, qtyOverride);
  return {
    ...scaleMealForLog(unscaleRankedCard(card), qty),
    servings: qty,
  };
}

/**
 * Card-scaled macros with qty 1 for the week plan. "Ate it" must not
 * remultiply, and a bank recipe's `serves` must never become the plan qty.
 */
export function coachPlanFieldsFromCard(card, qtyOverride) {
  const logged = coachLogFromCard(card, qtyOverride);
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

/**
 * How the log row should describe where its numbers came from.
 *
 * The coach must not make a bank recipe look like a guess or a guess look
 * exact, so this maps the card's source onto the same `via` values the rest
 * of the log uses. That the coach was involved is recorded separately, as
 * `origin`.
 */
export function coachCardVia(card) {
  const source = card?.source;
  if (source === "my") return "custom";
  if (source === "menu") return "menu";
  if (source === "kitchen" || source === "new") return "describe";
  return "recipe";
}

/** Grey pencilled row and "Ate it". Coach pencils use qty only. */
export function coachDisplayMacros(planMeal) {
  const qty = planMeal?.via === COACH_VIA
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
