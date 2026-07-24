/**
 * Client single-meal AI prompts (describe a meal, or 2–3 slot options).
 * Grounded in Callie's bank + foods she loves + daily macro bands.
 */

import { CALLIE_RECIPES } from "./callieRecipes.js";

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

function tastesBlock(profile) {
  return `- Breakfast loves: ${profile.prefB || "(not specified)"}
- Lunch loves: ${profile.prefL || "(not specified)"}
- Dinner loves: ${profile.prefD || "(not specified)"}
- Snack loves: ${profile.prefS || "(not specified)"}
- Diet: ${profile.diet && profile.diet !== "none" ? profile.diet : "omnivore"}
- Season note: ${profile.seasonNote || "(none)"}`;
}

const MEAL_SCHEMA = `{
  "slot": "breakfast"|"lunch"|"dinner"|"snack",
  "name": "recipe title",
  "basedOn": "Callie recipe name or null",
  "desc": "one short food line (not a full ingredient dump)",
  "cal": 0, "p": 0, "c": 0, "f": 0,
  "servings": 1,
  "ingredients": [{ "item": "...", "amount": "..." }],
  "batch": null,
  "steps": ["step", "step", "step", "step"]
}`;

export function buildDescribeMealPrompt({ profile, macros, slot, description }) {
  const bands = rangeBands(macros);
  const slotLabel = slot || "meal";
  return `You are Callie's meal assistant for Macros and Mamas (postpartum macro coaching).
Build ONE ${slotLabel} the client described. Prefer adapting Callie's recipe bank; originals only when needed with defensible macros.

## Her daily bands (this meal should be a sensible piece of the day — not the whole day)
- Calories day: ${bands.calLo}–${bands.calHi}
- Protein day: ${bands.pLo}–${bands.pHi} g
- Carbs day: ${bands.cLo}–${bands.cHi} g
- Fat day: ${bands.fLo}–${bands.fHi} g
Typical ${slotLabel} share: roughly 20–35% of daily calories unless she asked for a snack (then smaller, protein-aware).

## Tastes
${tastesBlock(profile)}

## What she asked for
"""
${String(description || "").trim().slice(0, 500)}
"""

## Callie's recipe bank
${recipesBlock()}

## Rules
1. No invented macros — meal cal/P/C/F = sum of listed ingredients.
2. Measurable amounts. Prefer bank macros when basedOn is set.
3. Healthy Callie style: high protein, whole foods, max 2 whole eggs per meal (egg whites ok), sweeten with honey/maple/applesauce when needed.
4. ingredients = ONE serving on her plate. batch = full cook only if servings > 1; else null.
5. steps = 4–7 practical cooking steps. Say "For the logged plate…" not "For her…".
6. Return ONLY JSON: { "meal": ${MEAL_SCHEMA} }`;
}

export function buildSlotOptionsPrompt({ profile, macros, slot }) {
  const bands = rangeBands(macros);
  const slotLabel = slot || "dinner";
  return `You are Callie's meal assistant for Macros and Mamas.
Propose 3 different ${slotLabel} options for this client to choose from. Prefer Callie's recipe bank adapted to her tastes. Each option needs full ingredients + steps + honest macros.

## Her daily bands (each option is one ${slotLabel} in a full day)
- Calories day: ${bands.calLo}–${bands.calHi}
- Protein day: ${bands.pLo}–${bands.pHi} g
- Carbs day: ${bands.cLo}–${bands.cHi} g
- Fat day: ${bands.fLo}–${bands.fHi} g

## Tastes — lean into these
${tastesBlock(profile)}

## Callie's recipe bank
${recipesBlock()}

## Rules
1. Exactly 3 options, meaningfully different (not tiny renames).
2. Honor her ${slotLabel} loves when specified; otherwise use bank favorites for that slot.
3. No invented macros. Prefer basedOn when adapting the bank.
4. Callie house style: high protein, whole foods, max 2 whole eggs per meal.
5. ingredients = one serving; batch only if servings > 1.
6. Return ONLY JSON: { "meals": [ ${MEAL_SCHEMA}, ${MEAL_SCHEMA}, ${MEAL_SCHEMA} ] }`;
}

export const MEAL_IDEA_JSON_HINT =
  "Return only valid JSON. Macros must match ingredients. Prefer Callie's bank via basedOn when you adapt a known recipe.";
