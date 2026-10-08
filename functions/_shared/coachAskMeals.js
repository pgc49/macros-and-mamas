/**
 * How many plates an ask is allowed to return.
 *
 * Food replies show 2–3 DISTINCT meals. A half portion of the same plate
 * does not count as a second meal.
 */

function plateBase(name) {
  return String(name || "")
    .replace(/\s·\s.*$/, "")
    .replace(/\s*\(half( portion)?\)/gi, "")
    .replace(/\s+half portion$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function mealBaseName(name) {
  return plateBase(name);
}

export function isHalfAskMeal(plate, other) {
  if (!plate || !other) return false;
  const base = plateBase(plate.name);
  const otherName = plateBase(other.name);
  if (!base || base !== otherName) return false;
  return Number(other.servings) === 0.5
    || /half portion|\(half\)/i.test(String(other.name || ""))
    || /half portion|\(half\)/i.test(String(other.desc || ""))
    || /half portion|\(half\)/i.test(String(other.title || ""));
}

export function askedForMealOptions(text) {
  return /\b(options|ideas?|something new|surprise me|bored|a few( ideas| things)?|give me \d|show me (a few|some|others|more)|couple of|two or three|2 or 3)\b/i
    .test(String(text || ""));
}

/** How many plates she asked for. Food always gets at least two. */
export function askedMealCount(text) {
  const asked = String(text || "");
  const numbered = asked.match(/\b(?:give me |show me )?(\d)\s+(options?|ideas?|dinners?|things|plates?)/i);
  if (numbered) return Math.min(3, Math.max(2, Number(numbered[1])));
  return 3;
}

/** Keep the first 2–3 plates with different base names. Halves of a kept plate drop. */
export function distinctCoachMeals(meals, max = 3) {
  const out = [];
  const seen = new Set();
  for (const meal of meals || []) {
    if (!meal?.name) continue;
    const base = plateBase(meal.name);
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push(meal);
    if (out.length >= max) break;
  }
  return out;
}

export function limitAskMeals(meals) {
  return distinctCoachMeals(meals, 3);
}
