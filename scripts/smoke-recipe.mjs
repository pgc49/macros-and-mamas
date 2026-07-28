/**
 * Smoke checks for recipe macros + the estimate response contract.
 * Run: node scripts/smoke-recipe.mjs
 */
import {
  sanitizeEstimate,
  normalizeServings as serverServings,
  PLATE_CAPS,
  MAX_SERVINGS,
} from "../functions/_shared/estimateShape.js";
import {
  perServingMacros,
  batchMacros,
  addMacros,
  normalizeServings,
} from "../src/utils/recipeMacros.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ---------- estimate contract: plate mode ---------- */

const plate = sanitizeEstimate({
  meal: "Chicken and rice",
  items: ["6 oz chicken", "1 cup rice"],
  calories: 540,
  protein_g: 45,
  carbs_g: 60,
  fat_g: 10,
  confidence: "high",
  tip: "Add a side of greens for fibre.",
});
assert(plate.basis === "serving", "plate estimates are per serving");
assert(plate.servings === 1, "plate estimates yield 1");
assert(plate.calories === 540, "plate calories pass through");
assert(!plate.error, "valid plate is not an error");

// Off-topic and junk still collapse to the same refusal.
assert(sanitizeEstimate({ error: "not food" }).error === "not food", "explicit refusal");
assert(sanitizeEstimate(null).error === "not food", "null is refused");
assert(sanitizeEstimate("nope").error === "not food", "string is refused");

// Plate ceilings still bite in meal mode.
const absurd = sanitizeEstimate({ meal: "x", calories: 999999, protein_g: 9999 });
assert(absurd.calories === PLATE_CAPS.calories, `plate cal capped, got ${absurd.calories}`);
assert(absurd.protein_g === PLATE_CAPS.protein_g, "plate protein capped");

/* ---------- estimate contract: recipe mode ---------- */

const batch = sanitizeEstimate(
  {
    meal: "Turkey chili",
    items: ["2 lb ground turkey", "2 cans beans", "1 can tomatoes"],
    servings: 8,
    calories: 3600,
    protein_g: 280,
    carbs_g: 320,
    fat_g: 96,
    confidence: "medium",
    tip: "Great batch cook for the week.",
  },
  "recipe",
);
assert(batch.basis === "batch", "recipe estimates describe the batch");
assert(batch.servings === 8, "recipe yield preserved");
assert(batch.calories === 3600, "batch totals are not divided server-side");

// A batch of 8 may be 8 plates' worth — but not 40,000 calories.
const runaway = sanitizeEstimate({ meal: "x", servings: 8, calories: 999999 }, "recipe");
assert(
  runaway.calories === PLATE_CAPS.calories * 8,
  `batch cap should scale with yield, got ${runaway.calories}`,
);
// ...and that ceiling is still one sane plate once divided.
assert(
  perServingMacros({ cal: runaway.calories }, 8).cal === PLATE_CAPS.calories,
  "capped batch divides back to the plate ceiling",
);

// Missing / silly yields fall back to something a kitchen can produce.
assert(sanitizeEstimate({ meal: "x" }, "recipe").servings === 1, "absent yield → 1");
assert(sanitizeEstimate({ meal: "x", servings: 0 }, "recipe").servings === 1, "zero yield → 1");
assert(sanitizeEstimate({ meal: "x", servings: -4 }, "recipe").servings === 1, "negative yield → 1");
assert(sanitizeEstimate({ meal: "x", servings: 999 }, "recipe").servings === MAX_SERVINGS, "huge yield clamped");
assert(sanitizeEstimate({ meal: "x", servings: 4.4 }, "recipe").servings === 4, "fractional yield rounds");
assert(serverServings("6 servings") === 6, "yield parsed from a numeric string");

// Recipes list more ingredients than a plate shows items.
const longList = sanitizeEstimate(
  { meal: "x", servings: 4, items: Array.from({ length: 60 }, (_, i) => `ing ${i}`) },
  "recipe",
);
assert(longList.items.length === 40, `recipe keeps up to 40 ingredients, got ${longList.items.length}`);

/* ---------- per-serving math ---------- */

const per = perServingMacros({ cal: 3600, p: 280, c: 320, f: 96 }, 8);
assert(per.cal === 450 && per.p === 35 && per.c === 40 && per.f === 12, `bad split ${JSON.stringify(per)}`);

// The yield she confirms wins over the one the model guessed.
assert(perServingMacros({ cal: 3600 }, 6).cal === 600, "re-dividing by her yield");
assert(perServingMacros({ cal: 3600 }, 1).cal === 3600, "yield of 1 keeps the batch");
assert(perServingMacros({ cal: 3600 }, 0).cal === 3600, "zero yield never divides by zero");
assert(perServingMacros({ cal: 100 }, 999).cal === Math.round(100 / 24), "yield clamped before dividing");
assert(perServingMacros({}, 4).cal === 0, "missing macros are zero, not NaN");
assert(perServingMacros({ cal: -50 }, 4).cal === 0, "negative macros floor at zero");

// Round-trip: stored per-serving row back to batch totals for editing.
const round = batchMacros(perServingMacros({ cal: 2400, p: 160, c: 200, f: 80 }, 4), 4);
assert(round.cal === 2400 && round.p === 160, `round trip drifted ${JSON.stringify(round)}`);

assert(normalizeServings(3) === 3 && normalizeServings("x") === 1, "client yield normalize");

/* ---------- adding food to an existing meal ---------- */

const summed = addMacros({ cal: 420, p: 30, c: 40, f: 12 }, { cal: 130, p: 23, c: 8, f: 0 });
assert(summed.cal === 550 && summed.p === 53 && summed.c === 48 && summed.f === 12, `bad sum ${JSON.stringify(summed)}`);
assert(addMacros(null, { cal: 100 }).cal === 100, "adding onto nothing works");
assert(addMacros({ cal: 100 }, null).cal === 100, "adding nothing is a no-op");

console.log("OK recipe smoke", {
  plate: { cal: plate.calories, basis: plate.basis },
  batch: { cal: batch.calories, serves: batch.servings, basis: batch.basis },
  perServing: per,
  capScales: `${PLATE_CAPS.calories} × 8 = ${runaway.calories}`,
});
