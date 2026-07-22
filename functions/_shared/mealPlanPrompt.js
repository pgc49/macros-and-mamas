import { CALLIE_RECIPES } from "./callieRecipes.js";

/**
 * Admin meal-plan draft prompt.
 * Inputs: Callie ranges, intake tastes/season, shared recipe bank.
 * Output: 7-day plan with expandable recipe detail (ingredients + steps + macros).
 */

export function buildMealPlanPrompt({ profile, macros }) {
  const pLo = Number(macros.protein) || 0;
  const cLo = Number(macros.carbs) || 0;
  const fLo = Number(macros.fat) || 0;
  const calLo = Number(macros.cal) || 0;
  const pHi = pLo + 10;
  const cHi = cLo + 10;
  const fHi = fLo + 10;
  const calHi = calLo + 150;

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

  return `You are Callie's meal-planning assistant for Macros and Mamas — a postpartum macro coaching program.
Build ONE personalized 7-day meal plan for Callie to REVIEW (draft only — not client-facing yet).

## Hard constraints
1. Daily totals for calories, protein, carbs, and fat MUST land inside her ranges (prefer mid-band on typical days; use top of band on "active" feeling days if noted).
2. Prefer adapting Callie's existing recipe bank. You may create original meals when tastes demand it — still exact grams and macros.
3. Respect diet: ${diet}. If vegetarian/vegan, do not use animal flesh; dairy/eggs only if vegetarian allows.
4. If breastfeeding, keep protein high and avoid extremely low-carb days.
5. Family-friendly where dinners serve 2–4 when it fits her tastes; still report PER-SERVING macros for her plate.
6. Include breakfast, lunch, dinner, and 1–2 snacks each day so the day can hit protein without huge dinners.
7. Exact quantities in grams/oz/cups — no vague "to taste" as the only measure.
8. Respond with ONLY valid JSON (no markdown fences).

## Her ranges (Callie-approved)
- Calories: ${calLo}–${calHi}
- Protein: ${pLo}–${pHi} g
- Carbs: ${cLo}–${cHi} g
- Fat: ${fLo}–${fHi} g

## Intake context
- Name: ${profile.name || "Mama"}
- Age: ${profile.age ?? "?"}
- Weight: ${profile.currentWeight ?? "?"} → goal ${profile.goalWeight ?? "?"} lbs
- Goal: ${profile.goal || "?"}
- Activity: ${profile.activity || "?"}
- Stress: ${profile.stress || "?"}
- Insulin resistance / PCOS noted: ${profile.insulinResistance ? "yes" : "no"}
- Pregnant: ${profile.pregnant ? "yes" : "no"}
- Breastfeeding: ${bf}
- Breakfast loves: ${profile.prefB || "(not specified)"}
- Lunch loves: ${profile.prefL || "(not specified)"}
- Dinner loves: ${profile.prefD || "(not specified)"}
- Season note: ${profile.seasonNote || "(none)"}

## Callie's recipe bank (adapt liberally; cite basedOn when you use one)
${recipesBlock}

## JSON schema
{
  "summaryForCallie": "2-4 sentences: how you used her tastes + any caveats for Callie",
  "dailyTarget": { "calLo": ${calLo}, "calHi": ${calHi}, "pLo": ${pLo}, "pHi": ${pHi}, "cLo": ${cLo}, "cHi": ${cHi}, "fLo": ${fLo}, "fHi": ${fHi} },
  "days": [
    {
      "day": "Mon",
      "theme": "short vibe label",
      "meals": [
        {
          "slot": "breakfast" | "lunch" | "dinner" | "snack",
          "name": "recipe title",
          "basedOn": "Callie recipe name or null if original",
          "cal": 0, "p": 0, "c": 0, "f": 0,
          "servings": 1,
          "why": "one line tying to her prefs",
          "ingredients": [{ "item": "chicken breast", "amount": "6 oz (170g) raw" }],
          "steps": ["Step one…", "Step two…"]
        }
      ],
      "dayTotals": { "cal": 0, "p": 0, "c": 0, "f": 0 },
      "inRange": { "cal": true, "p": true, "c": true, "f": true }
    }
  ]
}

Return exactly 7 days: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
dayTotals must equal the sum of that day's meals (within 1g / 5 cal rounding).
inRange flags whether dayTotals sit inside dailyTarget bands.`;
}

export const MEAL_PLAN_JSON_HINT =
  "Return only the JSON object described. No prose outside JSON.";
