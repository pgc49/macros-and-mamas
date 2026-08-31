/* ==================================================================
   /functions/_shared/estimateShape.js — the estimate response contract
   ==================================================================
   One place that decides what an estimate is allowed to look like, so
   the endpoint and the smoke tests agree.

   Two modes share the shape:

     meal   — the numbers describe one plate (Snap / Describe).
     recipe — the numbers describe a whole batch, and `servings` says
              how many portions that batch yields.

   `basis` is on the wire so the client can never mistake a pan of
   chili for a bowl of it.
   ================================================================== */

/** Sane ceilings for a single plate. Batch mode scales these by yield. */
export const PLATE_CAPS = { calories: 5000, protein_g: 400, carbs_g: 600, fat_g: 300 };

export const MAX_SERVINGS = 24;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/**
 * Yield the model reported, forced into something a kitchen can produce.
 * Models answer this field with "8", 8, or "8 servings" depending on the
 * day, so pull the first number out rather than trusting the type.
 */
export function normalizeServings(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(n) || n < 1) return 1;
  return clamp(Math.round(n), 1, MAX_SERVINGS);
}

/**
 * Tips already read as Callie in the UI — strip self-intros the model adds.
 */
export function sanitizeTip(raw) {
  let tip = String(raw || "").replace(/\s+/g, " ").trim();
  if (!tip) return "";

  tip = tip
    .replace(/^(hey[, ]+)?(hi[, ]+)?(mamas?[, ]+)?((it'?s|it is|this is)\s+)?callie(\s+here)?\s*[-—,:]+\s*/i, "")
    .replace(/^(i'?m|i am)\s+callie\b\s*[-—,:]*\s*/i, "")
    .replace(/,?\s*callie\s+here\s*[-—,:]*\s*/gi, " — ")
    .replace(/\s*[—-]\s*[—-]\s*/g, " — ")
    .replace(/^\s*[—-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (tip && /^[a-z]/.test(tip)) {
    tip = tip[0].toUpperCase() + tip.slice(1);
  }
  return tip.slice(0, 240);
}

/**
 * Coerce raw model JSON into the client contract.
 *
 * @param {object} parsed  raw parsed model output
 * @param {"meal"|"recipe"} mode
 */
export function sanitizeEstimate(parsed, mode = "meal") {
  if (!parsed || typeof parsed !== "object") return { error: "not food" };
  if (parsed.error) return { error: "not food" };
  // Models sometimes return meal:"error" + 0 macros instead of {error}.
  // That must not become a saveable client contract.
  if (/^error$/i.test(String(parsed.meal ?? "").trim())) return { error: "not food" };

  const recipe = mode === "recipe";
  const servings = recipe ? normalizeServings(parsed.servings) : 1;

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 40)
    : [];
  const confidence = ["low", "medium", "high"].includes(parsed.confidence)
    ? parsed.confidence
    : "medium";

  // A batch of 8 is allowed to be 8 plates' worth and no more, so one bad
  // model answer can't land a 40,000 calorie "meal" in her log.
  const capped = (key, raw) => clamp(num(raw), 0, PLATE_CAPS[key] * servings);

  return {
    meal: String(parsed.meal || (recipe ? "Recipe" : "Meal")).slice(0, 80),
    items,
    servings,
    basis: recipe ? "batch" : "serving",
    calories: capped("calories", parsed.calories),
    protein_g: capped("protein_g", parsed.protein_g),
    carbs_g: capped("carbs_g", parsed.carbs_g),
    fat_g: capped("fat_g", parsed.fat_g),
    confidence,
    tip: sanitizeTip(parsed.tip),
  };
}
