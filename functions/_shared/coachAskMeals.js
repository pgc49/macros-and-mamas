/**
 * How many plates an ask is allowed to return.
 *
 * One plate is the default. A second card is only the half portion of that
 * same plate. Up to three only when she asked for options.
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
  return /\b(options|a few( ideas| things)?|give me \d|show me (a few|some|others|more)|couple of|two or three|2 or 3)\b/i
    .test(String(text || ""));
}

export function limitAskMeals(meals, { askedForOptions = false } = {}) {
  const list = (Array.isArray(meals) ? meals : []).filter((meal) => meal?.name);
  if (askedForOptions) return list.slice(0, 3);
  if (!list.length) return [];
  const plate = list[0];
  const half = list.slice(1).find((meal) => isHalfAskMeal(plate, meal));
  return half ? [plate, half] : [plate];
}
