/* ==================================================================
   recipeMacros.js — batch → per-serving math for saved recipes
   ==================================================================
   The AI returns totals for the whole batch. She confirms how many
   servings it actually made, and we divide here.

   Yield is the one number that scales everything, so a wrong yield is
   an N-fold macro error. It stays user-editable and the division is
   redone locally — changing it never costs another AI call.
   ================================================================== */

export const MAX_RECIPE_SERVINGS = 24;

/** Whole portions only, and never zero — it is a divisor. */
export function normalizeServings(value, fallback = 1) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.round(n), MAX_RECIPE_SERVINGS);
}

/**
 * Split batch totals into one serving.
 *
 * @param {{cal:number,p:number,c:number,f:number}} batch totals for the whole recipe
 * @param {number} servings portions the batch yields
 */
export function perServingMacros(batch, servings) {
  const n = normalizeServings(servings);
  const div = (v) => {
    const raw = Number(v);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.round(raw / n);
  };
  return { cal: div(batch?.cal), p: div(batch?.p), c: div(batch?.c), f: div(batch?.f) };
}

/** Batch totals implied by a stored per-serving row — for re-editing a recipe. */
export function batchMacros(perServing, servings) {
  const n = normalizeServings(servings);
  const mul = (v) => {
    const raw = Number(v);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * n) : 0;
  };
  return { cal: mul(perServing?.cal), p: mul(perServing?.p), c: mul(perServing?.c), f: mul(perServing?.f) };
}

/**
 * Add an extra food's macros onto a meal already estimated or logged.
 * Used when she amends a saved entry with something she forgot.
 */
export function addMacros(base, extra) {
  const sum = (a, b) => Math.max(0, Math.round((Number(a) || 0) + (Number(b) || 0)));
  return {
    cal: sum(base?.cal, extra?.cal),
    p: sum(base?.p, extra?.p),
    c: sum(base?.c, extra?.c),
    f: sum(base?.f, extra?.f),
  };
}
