/**
 * meal_logs.cal / p / c / f are integers. PostgREST 400s on floats
 * (e.g. 1.2g protein from a label). Round every present key with Math.round
 * so "I know them" decimals save as whole numbers.
 */
export const MEAL_LOG_MACRO_KEYS = ["cal", "p", "c", "f"];

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
