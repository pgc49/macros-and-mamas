/**
 * meal_logs.cal / p / c / f are integers. PostgREST 400s on floats
 * (e.g. 1.2g protein from a label). Round every present key with Math.round
 * so "I know them" decimals save as whole numbers.
 */
export const MEAL_LOG_MACRO_KEYS = ["cal", "p", "c", "f"];

/** Quiet one-liner after a save that actually rounded a typed decimal. */
export const MEAL_LOG_ROUNDED_NOTE = "Rounded to nearest whole number";

export function roundMealLogMacro(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Copy cal/p/c/f from `macros` (only keys that are present) as integers. */
export function roundMealLogMacros(macros = {}) {
  const out = {};
  for (const key of MEAL_LOG_MACRO_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(macros, key)) continue;
    out[key] = roundMealLogMacro(macros[key]);
  }
  return out;
}

/** True when at least one present cal/p/c/f would change under Math.round. */
export function mealLogMacrosWereRounded(macros = {}) {
  for (const key of MEAL_LOG_MACRO_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(macros, key)) continue;
    const n = Number(macros[key]);
    if (!Number.isFinite(n)) continue;
    if (n !== Math.round(n)) return true;
  }
  return false;
}
