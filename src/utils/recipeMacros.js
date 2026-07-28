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
 * Used when she takes the coach tip and actually adds the thing.
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

/**
 * Merge a plate description with something she added afterwards, so the
 * re-estimate sees one coherent plate instead of two fragments.
 */
export function mergeDescription(original, addition) {
  const base = String(original || "").trim().replace(/[.;,]+$/, "");
  const extra = String(addition || "").trim().replace(/^(?:plus|and|with|\+)\s+/i, "");
  if (!extra) return base;
  if (!base) return extra;
  return `${base}, plus ${extra}`;
}

/**
 * Pull the food out of a coach tip so tapping it can prefill the add box.
 * Tips are free text, so this is best-effort — she edits before sending.
 *
 * Do not treat praise or coaching fluff as a suggestion.
 * e.g. "adding that cottage cheese is a smart way…" must NOT yield a chip;
 * "to add some fiber and keep your energy…" must NOT;
 * "…pairing it with Greek yogurt next time…" must NOT (future advice);
 * "Add Greek yogurt…" / "try pairing them with fruit…" should.
 */
export function foodFromTip(tip) {
  const text = String(tip || "").trim();
  if (!text) return "";

  // Future coaching is not something she can confirm on this meal.
  // e.g. "try pairing it with Greek yogurt next time…"
  if (isFutureAdviceTip(text)) return "";

  // Prefer explicit food-pairing phrasing before bare "add" (avoids "to add fiber…").
  const patterns = [
    /\b(?:try\s+)?pair(?:ing)?(?:\s+(?:them|it))?\s+with\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:top(?:ping)?(?:\s+(?:them|it))?\s+with|serve(?:\s+(?:them|it))?\s+with|toss\s+in|throw\s+in)\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:consider|try|maybe|perhaps|suggest(?:ing)?|recommend(?:ing)?)\s+adding\s+(.+?)(?:[.!?]|$)/i,
    // Imperative "add …" — not infinitive "to add …" (coaching purpose clause).
    /(?:^|[.!?]\s+|,\s*but\s+)add\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:you\s+could|you\s+might|maybe|try\s+to)\s+add\s+(.+?)(?:[.!?]|$)/i,
  ];

  let raw = "";
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }
  if (!raw) return "";

  let food = raw
    // Drop purpose / praise tails: "… to add fiber", "… for more protein", "… is a smart way"
    .replace(/\s+(?:to|for|and you|which|that|so\s+you|and\s+keep)\b.*$/i, "")
    // Drop leftover future tails if a tip slipped past isFutureAdviceTip
    .replace(/\s+next\s+time\b.*$/i, "")
    .replace(/[,;]\s*$/, "")
    .trim()
    .slice(0, 120);

  if (!food || !looksLikeFoodAddition(food)) return "";
  return food;
}

/** Tips about a future plate — never show "I did add …" for those. */
function isFutureAdviceTip(text) {
  return /\b(?:next\s+time|for\s+next\s+time|going\s+forward|in\s+the\s+future|next\s+meal|another\s+time)\b/i.test(
    String(text || ""),
  );
}

/** Reject coaching fluff that slipped past the verb match. */
function looksLikeFoodAddition(food) {
  const s = String(food || "").trim();
  if (s.length < 2) return false;
  // Praise leftovers
  if (/\b(?:is|was)\s+(?:a\s+)?(?:smart|great|good|nice|perfect|clever)\b/i.test(s)) return false;
  // Macro/coaching goals, not a plate item ("some fiber", "more protein")
  if (/^(?:some|more|a\s+bit\s+of|extra)?\s*(?:fiber|protein|energy|calories?|macros?)\b/i.test(s)) {
    return false;
  }
  if (/\b(?:keep your|throughout the|energy steady|steady throughout)\b/i.test(s)) return false;
  if (/\bnext\s+time\b/i.test(s)) return false;
  return true;
}
