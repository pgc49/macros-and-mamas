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
  mergeDescription,
  foodFromTip,
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

/* ---------- description merging ---------- */

assert(
  mergeDescription("6 oz chicken and rice", "a cup of greek yogurt")
    === "6 oz chicken and rice, plus a cup of greek yogurt",
  "merge joins with plus",
);
assert(mergeDescription("chicken.", "yogurt") === "chicken, plus yogurt", "trailing period dropped");
assert(mergeDescription("chicken", "plus yogurt") === "chicken, plus yogurt", "no doubled 'plus'");
assert(mergeDescription("chicken", "and yogurt") === "chicken, plus yogurt", "leading 'and' normalised");
assert(mergeDescription("", "yogurt") === "yogurt", "empty original");
assert(mergeDescription("chicken", "  ") === "chicken", "empty addition");

/* ---------- pulling the food out of a coach tip ---------- */

assert(
  foodFromTip("Add a scoop of Greek yogurt to bump your protein.") === "a scoop of Greek yogurt",
  `tip parse: got "${foodFromTip("Add a scoop of Greek yogurt to bump your protein.")}"`,
);
assert(
  foodFromTip("Try to pair it with a piece of fruit!") === "a piece of fruit",
  `pair-with parse: got "${foodFromTip("Try to pair it with a piece of fruit!")}"`,
);
assert(
  foodFromTip("Top with sliced avocado for healthy fats.") === "sliced avocado",
  `top-with parse: got "${foodFromTip("Top with sliced avocado for healthy fats.")}"`,
);
assert(foodFromTip("This looks like a balanced plate.") === "", "no suggestion → empty");
assert(foodFromTip("") === "", "empty tip → empty");
assert(foodFromTip(null) === "", "null tip → empty");
// Praise / purpose-clause false positives (Deana-class)
assert(
  foodFromTip("Nice work — adding that cottage cheese is a smart way to hit protein.") === "",
  "praise 'adding that…' must not become a chip",
);
assert(
  foodFromTip("Looks great — to add some fiber and keep your energy steady, sip water with it.") === "",
  "purpose 'to add fiber…' must not become a chip",
);
// Future coaching must not become "I did add … next time" (Deana pancake tip)
const pancakeNextTime =
  "That pancake looks perfectly golden, but let's try pairing it with some Greek yogurt or a side of eggs next time to add a protein boost that will keep your energy steady through the morning.";
assert(foodFromTip(pancakeNextTime) === "", `next-time tip must be empty, got "${foodFromTip(pancakeNextTime)}"`);
assert(
  foodFromTip("Try pairing it with Greek yogurt next time.") === "",
  "short next-time pairing tip → empty",
);
assert(
  foodFromTip("Add eggs going forward for a steadier morning.") === "",
  "going-forward tip → empty",
);
// Present-tense suggestions still work
assert(
  foodFromTip("Consider adding eggs or Greek yogurt for more protein.") === "eggs or Greek yogurt",
  `present consider-adding: got "${foodFromTip("Consider adding eggs or Greek yogurt for more protein.")}"`,
);
assert(
  foodFromTip("Try pairing it with some Greek yogurt or a side of eggs.") ===
    "some Greek yogurt or a side of eggs",
  `present pairing (no next time): got "${foodFromTip("Try pairing it with some Greek yogurt or a side of eggs.")}"`,
);

console.log("OK recipe smoke", {
  plate: { cal: plate.calories, basis: plate.basis },
  batch: { cal: batch.calories, serves: batch.servings, basis: batch.basis },
  perServing: per,
  capScales: `${PLATE_CAPS.calories} × 8 = ${runaway.calories}`,
  tipFood: foodFromTip("Add a scoop of Greek yogurt to bump your protein."),
});
