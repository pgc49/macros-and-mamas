/**
 * Plate sizing shared by the screen (coachRank) and /api/coach persist.
 * Kept free of the recipe bank so the worker can import it.
 */

import { COACH_COPY } from "../content/coachVoice.js";
import { mealFitsRemaining, mealMacros } from "./eatingOutImpact.js";

export const SCALE_CANDIDATES = [1, 1.5, 2];
export const PROTEIN_OVER_OK = 10;
export const PROTEIN_OVER_MUCH = 20;

function snapServings(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 1;
  const snapped = Math.round(n / 0.25) * 0.25;
  return Math.min(4, Math.max(0.25, Math.round(snapped * 100) / 100));
}

function budgetAsRemaining(budget) {
  if (!budget) return undefined;
  return {
    cal: budget.cal,
    p: Number.POSITIVE_INFINITY,
    c: Number.POSITIVE_INFINITY,
    f: budget.f,
  };
}

function scaleMeal(meal, servings) {
  const { cal, p, c, f } = mealMacros(meal);
  const snapped = snapServings(servings);
  return {
    ...meal,
    servings: snapped,
    cal: cal * snapped,
    p: p * snapped,
    c: c * snapped,
    f: f * snapped,
  };
}

export function coachMealFits(meal, budget) {
  return mealFitsRemaining(meal, budgetAsRemaining(budget));
}

/**
 * 1× if it fits. A bigger portion only when a single serving leaves her
 * short on protein, the upscale still keeps fat in range, and it doesn't
 * pile on more than 20g past what she needs. If 1× does not fit and a half
 * does, offer the half. If neither fits, drop the plate.
 */
export function pickScale(meal, budget) {
  if (!budget) return null;
  const fits = (s) => coachMealFits(scaleMeal(meal, s), budget);
  const p1 = mealMacros(meal).p;
  const pNeed = budget?.pNeed || 0;
  if (fits(1)) {
    let best = 1;
    if (p1 < pNeed) {
      for (const s of [1.5, 2]) {
        if (!fits(s)) continue;
        if (p1 * s < p1 + 15) continue;
        if (p1 * s > pNeed + PROTEIN_OVER_MUCH) continue;
        best = s;
      }
    }
    return best;
  }
  if (fits(0.5)) return 0.5;
  return null;
}

export function portionTitle(name, servings) {
  const base = String(name || "Meal");
  const s = snapServings(servings || 1);
  if (s === 1) return base;
  if (s === 0.5) return `${base} · half portion`;
  return `${base} · ${s} servings`;
}

export function sourceTag(source) {
  if (source === "my") return COACH_COPY.sourceMy;
  if (source === "pantry") return COACH_COPY.sourcePantry;
  if (source === "menu") return COACH_COPY.sourceMenu;
  if (source === "kitchen") return COACH_COPY.sourceKitchen;
  if (source === "new") return COACH_COPY.sourceNew;
  return COACH_COPY.sourceBank;
}

/** Size — or drop — the plate the way the screen does. */
export function sizeMealsForPersist(meals, budget, _slot, source) {
  const out = [];
  for (const meal of meals || []) {
    const macros = mealMacros(meal);
    const scale = budget?.cal ? pickScale({ ...meal, ...macros }, budget) : 1;
    if (scale == null) continue;
    const name = String(meal.name || "").trim();
    const src = meal.source || source || "";
    out.push({
      name,
      title: portionTitle(meal.title && scale === 1 ? meal.title : name, scale),
      source: src,
      tag: meal.tag || sourceTag(src),
      id: meal.id || "",
      basedOn: meal.basedOn || null,
      servings: scale,
      cal: Math.round(macros.cal * scale),
      p: Math.round(macros.p * scale),
      c: Math.round(macros.c * scale),
      f: Math.round(macros.f * scale),
      reason: meal.reason || meal.desc || "",
    });
  }
  return out;
}
