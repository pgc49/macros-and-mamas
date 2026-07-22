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

## Macro accuracy — non-negotiable (read carefully)
Accuracy beats creativity. False macro confidence is worse than a simpler meal.

1. **No invented macros.** Every meal's cal / protein_g / carbs_g / fat_g MUST be computed from the listed ingredients and amounts — not guessed from the meal name, not rounded from a "typical" dish, not copied from memory of restaurant food.
2. **If you are not certain** of an ingredient's macros at the stated amount (obscure brand, vague prep, unknown oil absorption, etc.), **do not use that ingredient or meal.** Swap to something from Callie's recipe bank or a plain whole-food item whose macros you can ground confidently (chicken breast, egg, Greek yogurt, rice by cooked gram weight, etc.).
3. **Prefer Callie's recipe bank macros as ground truth.** When basedOn is a Callie recipe, start from that recipe's stated cal/P/C/F and scale only by clear portion math. Do not "improve" or drift the bank numbers without changing ingredients.
4. **Per-meal math:** sum ingredient macros → meal totals. Then sum meals → dayTotals. dayTotals MUST equal the sum of that day's meals (≤1g / ≤5 cal rounding error only).
5. **Day must land in range from real meals.** After accurate summing, dayTotals for cal, P, C, and F MUST each fall inside her bands below. If a draft day is short/high, adjust portions of known foods (add egg whites, Greek yogurt, rice, fruit, measured oil) — do not fudge the numbers to fake an in-range day.
6. **Show your work in ingredients.** Every ingredient that contributes meaningful macros needs a measurable amount (g / oz / cups / tbsp). No "drizzle of oil," "handful," or "to taste" as the only quantity for calorie-dense items.
7. **Calories consistency:** for each meal, cal should approximately match 4*P + 4*C + 9*F (within ~10–15 kcal). If it doesn't, fix the macros — don't leave the inconsistency.
8. **Never recommend a meal you cannot defend** ingredient-by-ingredient. Callie will open the card and check.

## Other hard constraints
1. Prefer adapting Callie's existing recipe bank; originals only when tastes require them AND macros are ingredient-certain.
2. Respect diet: ${diet}. If vegetarian/vegan, do not use animal flesh; dairy/eggs only if vegetarian allows.
3. If breastfeeding, keep protein high and avoid extremely low-carb days.
4. Family-friendly dinners (serves 2–4) ok when it fits; still report PER-SERVING macros for her plate.
5. Include breakfast, lunch, dinner, and 1–2 snacks each day so protein can hit without huge dinners.
6. Prefer mid-band on typical days; top of band only if her activity/season note supports a higher day — still with accurate math.
7. Respond with ONLY valid JSON (no markdown fences).

## Her ranges (Callie-approved) — daily dayTotals must sit inside these
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

## Callie's recipe bank (ground-truth macros when you adapt; cite basedOn)
${recipesBlock}

## JSON schema
{
  "summaryForCallie": "2-4 sentences: how you used her tastes + any macro caveats or foods you avoided for uncertainty",
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
Before finishing, re-sum every day: meals → dayTotals → confirm inRange is truly true for cal, p, c, and f. If any day fails, fix portions and recompute — do not leave inRange false unless mathematically impossible after honest food choices (then say so in summaryForCallie).`;
}

export const MEAL_PLAN_JSON_HINT =
  "Return only the JSON object described. No prose outside JSON. Macro numbers must be ingredient-grounded and sum correctly into in-range dayTotals.";
