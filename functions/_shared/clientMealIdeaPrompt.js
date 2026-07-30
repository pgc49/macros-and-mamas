/**
 * Client single-meal AI prompts (describe a meal, or 2–3 slot options).
 * Grounded in Callie's bank + foods she loves + daily macro bands.
 */

import { CALLIE_RECIPES } from "./callieRecipes.js";
import { buildCustomMealsBlock } from "./customMealsPrompt.js";
import { buildDietSafetyBlock, dietPromptLabel } from "./foodPrefs.js";

function rangeBands(macros) {
  const pLo = Number(macros.protein) || 0;
  const cLo = Number(macros.carbs) || 0;
  const fLo = Number(macros.fat) || 0;
  const calLo = Number(macros.cal) || 0;
  return {
    pLo, cLo, fLo, calLo,
    pHi: pLo + 10,
    cHi: cLo + 10,
    fHi: fLo + 10,
    calHi: calLo + 150,
  };
}

function recipesBlock() {
  return CALLIE_RECIPES.map(
    (r) =>
      `- [${r.cat}] ${r.name} (${r.cal} cal · ${r.p}P/${r.c}C/${r.f}F · serves ${r.serves}): ${r.desc}`,
  ).join("\n");
}

function tastesBlock(profile, customMeals = []) {
  return `${buildDietSafetyBlock(profile)}

${buildCustomMealsBlock(customMeals)}

## Tastes (soft — never overrides diet/allergens)
- Breakfast loves: ${profile.prefB || "(not specified)"}
- Lunch loves: ${profile.prefL || "(not specified)"}
- Dinner loves: ${profile.prefD || "(not specified)"}
- Snack loves: ${profile.prefS || "(not specified)"}
- Diet: ${dietPromptLabel(profile.diet)}
- Season note: ${profile.seasonNote || "(none)"}`;
}

const MEAL_SCHEMA = `{
  "slot": "breakfast"|"lunch"|"dinner"|"snack",
  "name": "recipe title",
  "basedOn": "My meals name, Callie recipe name, or null",
  "desc": "one short food line (not a full ingredient dump)",
  "cal": 0, "p": 0, "c": 0, "f": 0,
  "servings": 1,
  "ingredients": [{ "item": "...", "amount": "..." }],
  "batch": null,
  "steps": ["step", "step", "step", "step"]
}`;

export function buildDescribeMealPrompt({ profile, macros, slot, description, customMeals = [] }) {
  const bands = rangeBands(macros);
  const slotLabel = slot || "meal";
  return `You are Callie's meal assistant for Macros and Mamas (postpartum macro coaching).
Build ONE ${slotLabel} the client described. Prefer her saved My meals when they match; else Callie's bank; originals only when needed with defensible macros.

## Her daily bands (this meal should be a sensible piece of the day — not the whole day)
- Calories day: ${bands.calLo}–${bands.calHi}
- Protein day: ${bands.pLo}–${bands.pHi} g
- Carbs day: ${bands.cLo}–${bands.cHi} g
- Fat day: ${bands.fLo}–${bands.fHi} g
Typical ${slotLabel} share: roughly 20–35% of daily calories unless she asked for a snack (then smaller, protein-aware).

${tastesBlock(profile, customMeals)}

## What she asked for
"""
${String(description || "").trim().slice(0, 500)}
"""

## Callie's recipe bank
${recipesBlock()}

## Rules
1. No invented macros — meal cal/P/C/F = sum of listed ingredients.
2. Measurable amounts. Prefer My meals or bank macros when basedOn is set.
3. Healthy Callie style: high protein, whole foods, max 2 whole eggs per meal (egg whites ok), sweeten with honey/maple/applesauce when needed.
4. ingredients = ONE serving on her plate. batch = full cook only if servings > 1; else null.
5. steps = 4–7 practical cooking steps. Say "For the logged plate…" not "For her…".
6. Return ONLY JSON: { "meal": ${MEAL_SCHEMA} }`;
}

export function buildSlotOptionsPrompt({ profile, macros, slot, customMeals = [] }) {
  const bands = rangeBands(macros);
  const slotLabel = slot || "dinner";
  return `You are Callie's meal assistant for Macros and Mamas.
Propose 3 different ${slotLabel} options for this client to choose from. Prefer her saved My meals when they fit, then Callie's bank adapted to her tastes. Each option needs full ingredients + steps + honest macros.

## Her daily bands (each option is one ${slotLabel} in a full day)
- Calories day: ${bands.calLo}–${bands.calHi}
- Protein day: ${bands.pLo}–${bands.pHi} g
- Carbs day: ${bands.cLo}–${bands.cHi} g
- Fat day: ${bands.fLo}–${bands.fHi} g

${tastesBlock(profile, customMeals)}

## Callie's recipe bank
${recipesBlock()}

## Rules
1. Exactly 3 options, meaningfully different (not tiny renames). Include at least one My meals option when she has a relevant saved meal.
2. Honor her ${slotLabel} loves when specified; otherwise use My meals / bank favorites for that slot — never violate diet/allergens for a bank recipe.
3. No invented macros. Prefer basedOn when adapting My meals or the bank.
4. Callie house style: high protein, whole foods, max 2 whole eggs per meal (skip eggs if allergen).
5. ingredients = one serving; batch only if servings > 1.
6. Return ONLY JSON: { "meals": [ ${MEAL_SCHEMA}, ${MEAL_SCHEMA}, ${MEAL_SCHEMA} ] }`;
}

/**
 * Restaurant / travel: read menu photo(s) + optional caption, suggest 2–3 dishes
 * that fit remaining room in her day bands. Macros are rough restaurant estimates.
 */
export function buildEatingOutPrompt({
  profile,
  macros,
  slot,
  description = "",
  customMeals = [],
  remaining = null,
  dayTotals = null,
}) {
  const bands = rangeBands(macros);
  const slotLabel = slot || "dinner";
  const rem = remaining && typeof remaining === "object" ? remaining : null;
  const totals = dayTotals && typeof dayTotals === "object" ? dayTotals : null;
  const remBlock = rem
    ? `## Room left today (stay in range — prefer options near or under these)
- Calories left (to day high): ~${Math.round(Number(rem.cal) || 0)}
- Protein left (to day high): ~${Math.round(Number(rem.p) || 0)} g
- Carbs left (to day high): ~${Math.round(Number(rem.c) || 0)} g
- Fat left (to day high): ~${Math.round(Number(rem.f) || 0)} g
Negative means she is already over that band — then pick the lightest sensible ${slotLabel} that still fits her ask.`
    : `## Day bands (no day plan yet — keep this ${slotLabel} to ~20–35% of the day)
- Calories day: ${bands.calLo}–${bands.calHi}
- Protein day: ${bands.pLo}–${bands.pHi} g
- Carbs day: ${bands.cLo}–${bands.cHi} g
- Fat day: ${bands.fLo}–${bands.fHi} g`;
  const loggedBlock = totals
    ? `Already logged/planned today (approx): ${Math.round(Number(totals.cal) || 0)} cal · P ${Math.round(Number(totals.p) || 0)} · C ${Math.round(Number(totals.c) || 0)} · F ${Math.round(Number(totals.f) || 0)}.`
    : "";
  const caption = String(description || "").trim().slice(0, 400);
  const captionBlock = caption
    ? `## Her note (honor this — e.g. decide between dishes, appetizer only, avoid something)
"""
${caption}
"""`
    : `## Her note
(none — pick solid ${slotLabel} options from the menu that fit her room left.)`;

  return `You are Callie's postpartum meal assistant helping a mama eat out / travel.
She attached restaurant MENU photo(s). Read the menu. Propose 2–3 orderable dishes for ${slotLabel} that fit her remaining macros and her note.

${remBlock}
${loggedBlock}

${tastesBlock(profile, customMeals)}

${captionBlock}

## Rules
1. Only suggest items that appear (or clearly match) the menu photo(s). Do not invent off-menu dishes.
2. Exactly 2 or 3 options, meaningfully different. Prefer higher protein when room allows.
3. Honor diet/allergens strictly. Soft-prefer her tastes when the menu allows.
4. Macros are ROUGH restaurant estimates (say so in desc). Prefer defensible ballparks over fake precision. servings = 1, batch = null.
5. basedOn = null. name = the menu dish name (short). desc = one line starting with "Rough restaurant estimate — …" plus how to order (grilled, sauce on side, etc.).
6. ingredients = key components as ordered (not a full grocery list). steps = 2–4 short "how to order / modify" tips (not home cooking).
7. If her note asks to choose between specific dishes, prioritize those and explain the macro tradeoff in desc.
8. If the photos are not a menu, return the best-effort empty meals array is NOT allowed — still return 2 light generic ${slotLabel} restaurant-style picks only if the menu is unreadable, and say so in desc.
9. Return ONLY JSON: { "meals": [ ${MEAL_SCHEMA}, ${MEAL_SCHEMA} ] } (2 or 3 meals).`;
}

export const MEAL_IDEA_JSON_HINT =
  "Return only valid JSON. Macros must match ingredients. Prefer Callie's bank via basedOn when you adapt a known recipe.";

export const EATING_OUT_JSON_HINT =
  "Return only valid JSON with a meals array (2–3). Restaurant macros are rough estimates. basedOn must be null. No markdown.";
