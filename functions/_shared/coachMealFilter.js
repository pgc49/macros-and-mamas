/**
 * Drop a plate that breaks a stated constraint, a saved allergen or diet,
 * or a plate she just saw. Shared by the server and the phone so a peanut
 * allergy cannot leak Toast and peanut butter on any path.
 */

import {
  coachPrefsFromProfile,
  dairyScanText,
  mealAllowedForDiet,
  mealHitsDislike,
} from "../../src/utils/coachPrefs.js";

export { dairyScanText };

const DAIRY = /\b(dairy|yogurt|yoghurt|cheese(?:\s*stick)?|string cheese|cheddar|jack|monterey|swiss|provolone|gouda|brie|feta|parmesan|mozzarella|queso|quesadilla|ghee|cheesy|cream|butter|whey|milk|cottage|shake|ricotta|parm|chicken parm|tzatziki|cotija|crema|paneer|halloumi|kefir|alfredo|mascarpone|burrata|labneh|custard|casein|half[- ]and[- ]half|parmigiano|pecorino|romano|asiago|colby|muenster|havarti|gruy[eè]re|manchego|raita|lassi|cr[eè]me fra[iî]che)\b/i;
const CHICKEN = /\bchicken\b/i;
const EGGS = /\beggs?\b|\begg whites?\b/i;
const SMOOTHIE = /\bsmoothie\b/i;
const COTTAGE = /\bcottage cheese\b/i;
const SPINACH = /\bspinach\b/i;
const MEAT = /\b(chicken|turkey|beef|pork|steak|sausage|bacon|meatball|salmon|tuna|fish|halibut|burger|nuggets?)\b/i;

/** Live custom_meals.ingredients is text. Arrays stay arrays. */
export function ingredientList(meal) {
  const raw = meal?.ingredients;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[\n;]+/).map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

export function mealHaystack(meal) {
  if (!meal) return "";
  const bits = [meal.name, meal.desc, meal.title, meal.reason, meal.shownReason, meal.why, meal.notes, meal.tag];
  for (const row of ingredientList(meal)) {
    if (typeof row === "string") bits.push(row);
    else bits.push(row?.item, row?.amount, row?.name);
  }
  return bits.filter(Boolean).join(" ");
}

export function mealLooksDairy(meal) {
  return DAIRY.test(dairyScanText(mealHaystack(meal)));
}

function avoidsFood(asked, food) {
  const word = String(food || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!word) return false;
  return new RegExp(
    `\\b(sick of|tired of|hate|don'?t (?:want|like)|no more|without more|besides)\\b[^.?]{0,60}\\b${word}\\b`,
  ).test(asked)
    || new RegExp(`\\bno (?:more )?${word}\\b`).test(asked);
}

/** She already ate it — do not treat that as inventory or suggest it again. */
function alreadyHadFood(asked, food) {
  const word = String(food || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!word) return false;
  return new RegExp(
    `\\b(?:already\\s+)?(?:had|ate|eaten)\\b[^.?]{0,40}\\b${word}\\b`,
  ).test(asked);
}

export function extractAskConstraints(text = "", profile = null, { currentAsk = null } = {}) {
  const asked = String(text || "").toLowerCase();
  const current = String(currentAsk != null ? currentAsk : text || "").toLowerCase();
  const allergens = (Array.isArray(profile?.allergens) ? profile.allergens : Array.isArray(profile?.allergies) ? profile.allergies : [])
    .map((item) => String(item).toLowerCase());
  const avoids = String(profile?.foodAvoids || profile?.food_avoids || "").toLowerCase();
  const allergenNote = String(profile?.allergenNote || profile?.allergen_note || "").toLowerCase();
  const diet = String(profile?.diet || "").toLowerCase();
  return {
    noDairy: allergens.includes("dairy")
      || /\bdairy[- ]free\b/.test(asked)
      || /\bdairy[- ]free\b/.test(allergenNote)
      || /\bno dairy\b/.test(asked)
      || /\bno dairy (pls|plz|please|for baby)\b/.test(asked)
      || /\bi'?m dairy free\b/.test(asked)
      || /\bcutting dairy\b/.test(asked)
      || /\bdf\b/.test(asked)
      || /\b(baby|he|she|kid).{0,28}\b(fussy|gassy|upset|react).{0,20}\bdairy\b/.test(asked)
      || /\bdairy.{0,20}\b(baby|fussy|gassy)\b/.test(asked)
      || /\bno dairy for baby\b/.test(asked),
    noCottage: /\bcottage cheese\b/.test(avoids)
      || avoidsFood(asked, "cottage cheese")
      || alreadyHadFood(current, "cottage cheese"),
    noChicken: avoidsFood(asked, "chicken") || alreadyHadFood(current, "chicken"),
    noEggs: allergens.includes("eggs")
      || allergens.includes("egg")
      || avoidsFood(asked, "eggs")
      || avoidsFood(asked, "egg")
      || alreadyHadFood(current, "eggs")
      || alreadyHadFood(current, "egg")
      || /\bbesides eggs\b/.test(asked)
      || /\bno eggs this week\b/.test(asked),
    noSalmon: avoidsFood(asked, "salmon") || alreadyHadFood(current, "salmon"),
    noSmoothie: /\bnot the smoothie\b/.test(asked)
      || /\bno smoothie\b/.test(asked)
      || alreadyHadFood(current, "smoothie"),
    noSpinach: /\bdon'?t have spinach\b/.test(asked) || /\bno spinach\b/.test(asked),
    vegetarian: /\bvegetarian\b/.test(asked) || /\bmake it vegetarian\b/.test(asked) || diet === "vegetarian",
    lowCarb: /\blow[- ]?carb/.test(asked) || /\bfewer carbs?\b/.test(asked) || /\bless carbs?\b/.test(asked),
    highProtein: /\bhigh[- ]?protein\b/.test(asked) || /\bmore protein\b/.test(asked),
    light: /\b(something light|lighter|light meal|keep it light)\b/.test(current),
    sweet: (/\bsomething sweet\b/.test(current) || (/\bsweet\b/.test(current) && !/\bsweetgreen\b/.test(current) && !/\bsweet potato/.test(current))),
    snackish: /\b(bedtime|before (a |my )?walk|after (a |my )?walk|snack)\b/.test(current),
  };
}

export function mealBreaksConstraints(meal, constraints = {}, skipNames = []) {
  const hay = mealHaystack(meal);
  const name = String(meal?.name || "").trim().toLowerCase();
  if (name && skipNames.some((item) => String(item).trim().toLowerCase() === name)) return true;
  if (constraints.noDairy && mealLooksDairy(meal)) return true;
  if (constraints.noCottage && COTTAGE.test(hay)) return true;
  if (constraints.noChicken && CHICKEN.test(hay)) return true;
  if (constraints.noEggs && EGGS.test(hay)) return true;
  if (constraints.noSalmon && /\bsalmon\b/i.test(hay)) return true;
  if (constraints.noSmoothie && SMOOTHIE.test(hay)) return true;
  if (constraints.noSpinach && SPINACH.test(hay)) return true;
  if (constraints.vegetarian && MEAT.test(hay)) return true;
  if (constraints.lowCarb && (Number(meal?.c) || 0) > 36) return true;
  if (constraints.light && (Number(meal?.cal) || 0) > 420) return true;
  if (constraints.sweet && !SWEET_PLATE.test(hay)) return true;
  if (constraints.snackish && DINNER_PLATE.test(hay) && !SNACK_OK.test(hay)) return true;
  return false;
}

const SWEET_PLATE = /\b(yogurt|yoghurt|berr|fruit|banana|shake|smoothie|chocolate|cookie|oat|honey|cottage cheese|apple|date|almond)\b/i;
const DINNER_PLATE = /\b(teriyaki|stir[- ]?fry|steak|salmon|taco|burrito|lasagna|meatball|pad krapow|larb)\b/i;
const SNACK_OK = /\b(yogurt|shake|fruit|banana|bar|cheese stick|cottage|apple|nuts|crackers?)\b/i;

export const COACH_THREAD_ASK_LIMIT = 8;

const CONSTRAINT_KEEP = /\b(no dairy|dairy[- ]free|i'?m dairy free|cutting dairy|df|fussy with dairy|no dairy for baby|no eggs|no more eggs|sick of|so sick of|tired of|no more|hate |don'?t (?:want|like)|without more|besides|no chicken|no salmon|no spinach|vegetarian|vegan|not the smoothie)\b/i;

export const PRIOR_ASK_CHAR_CAP = 2500;

/** Keep constraint-setting asks first, then stop around 2500 characters. */
export function capPriorAskChars(asks = [], maxChars = PRIOR_ASK_CHAR_CAP) {
  const out = [];
  let used = 0;
  for (const ask of asks) {
    const text = String(ask || "").trim();
    if (!text) continue;
    const next = used + text.length + (out.length ? 2 : 0);
    if (out.length && next > maxChars) break;
    if (!out.length && text.length > maxChars) {
      out.push(text.slice(0, maxChars));
      break;
    }
    out.push(text);
    used = next;
  }
  return out;
}

export function threadPriorAsks(asks = [], { limit = COACH_THREAD_ASK_LIMIT } = {}) {
  const list = (Array.isArray(asks) ? asks : []).map((row) => String(row || "").trim()).filter(Boolean);
  const newest = list.slice(-limit);
  const extras = list.filter((ask) => CONSTRAINT_KEEP.test(ask) && !newest.includes(ask));
  return [...extras, ...newest];
}

export function constraintTextFrom(text = "", priorAsks = []) {
  return [text, ...threadPriorAsks(priorAsks)].filter(Boolean).join(". ");
}

/** Saved diet + allergens + Food prefs avoids. Same gate the ranker uses. */
export function mealBreaksSavedPrefs(meal, profile = null) {
  if (!meal || !profile) return false;
  const prefs = coachPrefsFromProfile(profile, null);
  if (!mealAllowedForDiet(meal, prefs.diet)) return true;
  if (mealHitsDislike(meal, prefs.dislikes)) return true;
  return false;
}

function askNamesThisPlate(text, name) {
  const hay = String(text || "").toLowerCase();
  const key = String(name || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return key.length >= 6 && hay.includes(key);
}

export function filterCoachMeals(meals, {
  text = "",
  profile = null,
  skipNames = [],
  priorAsks = [],
} = {}) {
  const constraints = extractAskConstraints(constraintTextFrom(text, priorAsks), profile, { currentAsk: text });
  const skip = (skipNames || []).map((item) => String(item || "").trim()).filter((item) => !askNamesThisPlate(text, item));
  return (Array.isArray(meals) ? meals : []).filter((meal) => (
    meal?.name
    && !mealBreaksConstraints(meal, constraints, skip)
    && !mealBreaksSavedPrefs(meal, profile)
  ));
}
