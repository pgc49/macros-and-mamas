import { CALLIE_RECIPES } from "./callieRecipes.js";

/**
 * Admin meal-plan draft prompt.
 * Inputs: Callie ranges, intake tastes/season, shared recipe bank,
 * optional Callie revision feedback + prior draft digest.
 * Output: 7-day plan with expandable recipe detail (ingredients + steps + macros).
 */

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

/** Compact prior-draft digest so Callie feedback regenerations stay focused. */
export function digestPreviousPlan(plan) {
  if (!plan?.days || !Array.isArray(plan.days)) return "";
  const lines = plan.days.slice(0, 7).map((day) => {
    const t = day.dayTotals || {};
    const ir = day.inRange || {};
    const flags = ["cal", "p", "c", "f"]
      .filter((k) => ir[k] === false)
      .join(",") || "ok";
    const meals = (day.meals || [])
      .map((m) => `${m.slot}:${m.name}(${Math.round(m.cal || 0)}cal ${Math.round(m.p || 0)}P/${Math.round(m.c || 0)}C/${Math.round(m.f || 0)}F)`)
      .join("; ");
    return `${day.day} totals ${Math.round(t.cal || 0)}/${Math.round(t.p || 0)}P/${Math.round(t.c || 0)}C/${Math.round(t.f || 0)}F [${flags}] — ${meals}`;
  });
  const summary = plan.summaryForCallie ? `Prior summary: ${plan.summaryForCallie}\n` : "";
  return `${summary}${lines.join("\n")}`.slice(0, 6000);
}

export function buildMealPlanPrompt({ profile, macros, feedback, previousDigest }) {
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

  const feedbackBlock =
    feedback && String(feedback).trim()
      ? `
## Callie's revision notes — MANDATORY
She reviewed a prior draft. Rewrite the week to address EVERY note below.
Do not ignore soft preferences; treat these as required edits.
"""
${String(feedback).trim().slice(0, 2500)}
"""

## Prior draft digest (fix what was wrong; do not copy out-of-range days)
${previousDigest || "(no prior digest)"}
`
      : "";

  return `You are Callie's meal-planning assistant for Macros and Mamas — a postpartum macro coaching program.
Build ONE personalized 7-day meal plan for Callie to REVIEW (draft only — not client-facing yet).

## #1 job — every day MUST land inside her ranges
Showing a day outside her bands is a failed plan. Creativity is secondary.

Her daily bands (hard walls — dayTotals must sit inside ALL four):
- Calories: ${calLo}–${calHi}
- Protein: ${pLo}–${pHi} g
- Carbs: ${cLo}–${cHi} g
- Fat: ${fLo}–${fHi} g

Aim for mid-band on a typical day (not the floor). Example: if protein is ${pLo}–${pHi}, land near ${pLo + 5}.

### Required work loop (do this for EACH day before you output JSON)
1. Draft breakfast, lunch, dinner, and 1–2 snacks from her tastes + Callie's bank.
2. Sum meal macros → provisional dayTotals.
3. Gap-check vs bands. If ANY of cal/P/C/F is outside, you are NOT done.
4. Adjust **quantities** (not fake numbers):
   - Low protein → more chicken/turkey/fish oz, egg whites, Greek yogurt, cottage cheese, protein powder.
   - Low carbs → more cooked rice/potato/fruit by gram weight, oats, tortillas.
   - Low fat → measured olive oil (tsp/tbsp), avocado (g), nut butter (g), cheese, fatty fish portion.
   - Low calories → scale the short macros up with the same measured foods (often fat + carb together).
   - High any macro → shrink the offending portion (rice, oil, meat oz) and re-sum.
5. Re-sum. Repeat until all four are inside. Only then move to the next day.
6. **Never** leave inRange false. **Never** invent dayTotals that don't equal the meal sum. **Never** "close enough" outside the band.

A day like 1610 cal vs ${calLo}–${calHi}, or 34g fat vs ${fLo}–${fHi}, is unacceptable — keep adjusting portions until it fits.

## Macro accuracy — non-negotiable
1. **No invented macros.** Meal cal/P/C/F = sum of listed ingredient amounts.
2. Uncertain ingredient macros → don't use it; swap to bank / whole-food items you can ground.
3. Prefer Callie's recipe bank macros; scale by clear portion math only.
4. Meals → dayTotals (≤1g / ≤5 cal rounding). dayTotals must equal the meal sum.
5. Measurable amounts on calorie-dense items (g / oz / cups / tbsp). No vague "drizzle."
6. Meal cal ≈ 4*P + 4*C + 9*F (±15 kcal).
7. Callie will open cards and check — defend every meal ingredient-by-ingredient.

## Other hard constraints
1. Prefer adapting Callie's recipe bank; originals only when tastes require them AND macros are certain.
2. Respect diet: ${diet}.
3. If breastfeeding, keep protein high; avoid extremely low-carb days.
4. Family dinners ok; report PER-SERVING macros for her plate.
5. Every day: breakfast, lunch, dinner, and at least one snack (snack is a first-class slot — use it to close protein/fat/cal gaps).
6. Respond with ONLY valid JSON (no markdown fences).
${feedbackBlock}
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
  "summaryForCallie": "2-4 sentences: tastes used, how you hit ranges, what you changed from feedback (if any)",
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
          "why": "private one-liner for Callie only (prefs/macros fit) — never '[Name] loves…' and never client-facing marketing",
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
Final gate: every day's inRange.cal/p/c/f must be true after honest re-sum. If a day fails, fix portions and recompute before returning.`;
}

export const MEAL_PLAN_JSON_HINT =
  "Return only the JSON object. Every dayTotals must honestly sum from meals AND sit inside her cal/P/C/F bands. Out-of-range days are failures — adjust quantities until all seven days pass.";
