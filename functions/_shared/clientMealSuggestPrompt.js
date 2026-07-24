/**
 * Client-facing meal-week suggestion prompt.
 * Same grounding as admin meal-plan (ranges + tastes + bank), but written
 * for her to accept into her planner — not a Callie-only draft.
 */

import { CALLIE_RECIPES } from "./callieRecipes.js";

function rangeBands(macros) {
  const pLo = Number(macros.protein) || 0;
  const cLo = Number(macros.carbs) || 0;
  const fLo = Number(macros.fat) || 0;
  const calLo = Number(macros.cal) || 0;
  return {
    pLo,
    cLo,
    fLo,
    calLo,
    pHi: pLo + 10,
    cHi: cLo + 10,
    fHi: fLo + 10,
    calHi: calLo + 150,
  };
}

export function buildClientSuggestPrompt({ profile, macros }) {
  const { pLo, cLo, fLo, calLo, pHi, cHi, fHi, calHi } = rangeBands(macros);

  const recipesBlock = CALLIE_RECIPES.map(
    (r) =>
      `- [${r.cat}] ${r.name} (${r.cal} cal · ${r.p}P/${r.c}C/${r.f}F · serves ${r.serves}): ${r.desc}`,
  ).join("\n");

  const diet = profile.diet && profile.diet !== "none" ? profile.diet : "omnivore (eats animal protein)";
  const bf =
    profile.breastfeeding === true
      ? `yes${profile.monthsPP != null && profile.monthsPP !== "" ? ` (${profile.monthsPP} mo postpartum)` : ""}`
      : profile.breastfeeding === false
        ? "no"
        : "unknown";

  return `You are building a personalized 7-day meal plan suggestion for a Macros and Mamas client to REVIEW and edit in her weekly planner.

## #1 job — every day MUST land inside her ranges
Her daily bands (hard walls — dayTotals must sit inside ALL four):
- Calories: ${calLo}–${calHi}
- Protein: ${pLo}–${pHi} g
- Carbs: ${cLo}–${cHi} g
- Fat: ${fLo}–${fHi} g

Aim mid-band. Prefer adapting Callie's recipe bank; originals only when tastes require them AND macros are certain.

## Taste-first
Build the week around what she said she loves (intake). Do not invent a generic "healthy" week that ignores her prefs.
- Breakfast loves: ${profile.prefB || "(not specified — use Callie's breakfast bank)"}
- Lunch loves: ${profile.prefL || "(not specified)"}
- Dinner loves: ${profile.prefD || "(not specified)"}
- Season note: ${profile.seasonNote || "(none)"}
- Diet: ${diet}
- Breastfeeding: ${bf}

## Macro accuracy
Meal cal/P/C/F must equal listed ingredients. Prefer bank macros; scale portions clearly.
Every day: breakfast, lunch, dinner, and at least one snack.
Family dinners ok; report PER-SERVING macros for her plate.

## Context
- Name: ${profile.name || "Mama"}
- Goal: ${profile.goal || "?"}
- Activity: ${profile.activity || "?"}

## Callie's recipe bank
${recipesBlock}

## JSON schema
{
  "summaryForClient": "1-2 warm sentences about how this week matches her tastes (no coach jargon)",
  "dailyTarget": { "calLo": ${calLo}, "calHi": ${calHi}, "pLo": ${pLo}, "pHi": ${pHi}, "cLo": ${cLo}, "cHi": ${cHi}, "fLo": ${fLo}, "fHi": ${fHi} },
  "days": [
    {
      "day": "Mon",
      "theme": "short vibe",
      "meals": [
        {
          "slot": "breakfast" | "lunch" | "dinner" | "snack",
          "name": "recipe title",
          "basedOn": "Callie recipe name or null",
          "cal": 0, "p": 0, "c": 0, "f": 0,
          "servings": 1,
          "ingredients": [{ "item": "...", "amount": "..." }],
          "batch": null,
          "steps": ["step", "step", "step", "step"]
        }
      ],
      "dayTotals": { "cal": 0, "p": 0, "c": 0, "f": 0 }
    }
  ]
}

Return exactly 7 days: Mon–Sun. Respond with ONLY valid JSON.`;
}

export const CLIENT_SUGGEST_JSON_HINT =
  "Return only the JSON object. dayTotals must sum from meals and sit inside her cal/P/C/F bands.";
