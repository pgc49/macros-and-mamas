/**
 * Drop a plate that breaks a stated constraint, a saved allergen, or a
 * plate she just saw. The model is asked to honor these; this is the
 * backstop so a leftover yogurt card cannot leak through on a dairy-free ask.
 */

const DAIRY = /\b(dairy|yogurt|yoghurt|cheese|milk|butter|whey|cream|cottage|shake)\b/i;
const CHICKEN = /\bchicken\b/i;
const EGGS = /\beggs?\b|\begg whites?\b/i;
const SMOOTHIE = /\bsmoothie\b/i;
const COTTAGE = /\bcottage cheese\b/i;
const SPINACH = /\bspinach\b/i;
const MEAT = /\b(chicken|turkey|beef|pork|steak|sausage|bacon|meatball|salmon|tuna|fish|halibut|burger|nuggets?)\b/i;

export function mealHaystack(meal) {
  if (!meal) return "";
  const bits = [meal.name, meal.desc, meal.title];
  for (const row of meal.ingredients || []) bits.push(row?.item, row?.amount);
  return bits.filter(Boolean).join(" ");
}

export function extractAskConstraints(text = "", profile = null) {
  const asked = String(text || "").toLowerCase();
  const allergens = Array.isArray(profile?.allergens)
    ? profile.allergens.map((item) => String(item).toLowerCase())
    : [];
  const avoids = String(profile?.foodAvoids || profile?.food_avoids || "").toLowerCase();
  const allergenNote = String(profile?.allergenNote || profile?.allergen_note || "").toLowerCase();
  return {
    noDairy: allergens.includes("dairy")
      || /\bdairy[- ]free\b/.test(asked)
      || /\bdairy[- ]free\b/.test(allergenNote)
      || /\bi'?m dairy free\b/.test(asked),
    noCottage: /\bcottage cheese\b/.test(avoids) || /\bhate cottage cheese\b/.test(asked),
    noChicken: /\bwithout more chicken\b/.test(asked) || /\bno (more )?chicken\b/.test(asked),
    noEggs: /\bbesides eggs\b/.test(asked) || /\bno eggs?\b/.test(asked),
    noSmoothie: /\bnot the smoothie\b/.test(asked) || /\bno smoothie\b/.test(asked),
    noSpinach: /\bdon'?t have spinach\b/.test(asked) || /\bno spinach\b/.test(asked),
    vegetarian: /\bvegetarian\b/.test(asked) || /\bmake it vegetarian\b/.test(asked),
  };
}

export function mealBreaksConstraints(meal, constraints = {}, skipNames = []) {
  const hay = mealHaystack(meal);
  const name = String(meal?.name || "").trim().toLowerCase();
  if (name && skipNames.some((item) => String(item).trim().toLowerCase() === name)) return true;
  if (constraints.noDairy && DAIRY.test(hay)) return true;
  if (constraints.noCottage && COTTAGE.test(hay)) return true;
  if (constraints.noChicken && CHICKEN.test(hay)) return true;
  if (constraints.noEggs && EGGS.test(hay)) return true;
  if (constraints.noSmoothie && SMOOTHIE.test(hay)) return true;
  if (constraints.noSpinach && SPINACH.test(hay)) return true;
  if (constraints.vegetarian && MEAT.test(hay)) return true;
  return false;
}

export function filterCoachMeals(meals, {
  text = "",
  profile = null,
  skipNames = [],
} = {}) {
  const constraints = extractAskConstraints(text, profile);
  const skip = (skipNames || []).map((item) => String(item || "").trim()).filter(Boolean);
  return (Array.isArray(meals) ? meals : []).filter((meal) => (
    meal?.name && !mealBreaksConstraints(meal, constraints, skip)
  ));
}
