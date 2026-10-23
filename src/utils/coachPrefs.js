/**
 * Taste and safety filters for the meal coach.
 *
 * Diet and allergens are hard gates — a card that trips one is never shown,
 * at any scale. Dislikes and likes are soft: dislikes drop a meal, likes only
 * nudge the score. Ported from the Help me decide engine (PR 332).
 */

import { normalizeAllergens, normalizeDiet } from "../content/foodPrefs";

const STOP = new Set([
  "with", "from", "that", "this", "have", "your", "some", "into", "over",
  "plus", "and", "the", "for", "like", "loves", "love", "usually", "often",
]);

const LAND_MEAT = [
  "chicken", "turkey", "beef", "pork", "lamb", "bacon", "sausage", "steak",
  "meatball", "meatballs", "deli", "ham",
];
const FISH = [
  "salmon", "tuna", "halibut", "cod", "fish", "tilapia", "shrimp", "prawn",
  "crab", "lobster", "shellfish",
];
const EGGS = ["egg", "eggs", "whites"];
const DAIRY = [
  "yogurt", "yoghurt", "cottage", "cheese", "milk", "whey", "butter", "cream",
  "feta", "parmesan",
];
const HONEY = ["honey"];

const ALLERGEN_WORDS = {
  dairy: DAIRY,
  eggs: EGGS,
  peanuts: ["peanut", "peanuts"],
  tree_nuts: ["almond", "cashew", "walnut", "pecan", "hazelnut", "pistachio", "nut"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "shellfish"],
  fish: ["salmon", "tuna", "halibut", "cod", "fish", "tilapia"],
  gluten: ["wheat", "barley", "rye", "gluten", "sourdough", "bread", "flour", "pasta"],
  soy: ["soy", "tofu", "tempeh", "edamame"],
  sesame: ["sesame", "tahini"],
};

/** Everything searchable about a meal: name, blurb, category, ingredient lines. */
export function mealHaystack(meal) {
  const bits = [meal?.name, meal?.desc, meal?.cat];
  const ings = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  for (const line of ings) {
    if (typeof line === "string") bits.push(line);
    else bits.push(line?.item, line?.name, line?.amount);
  }
  if (typeof meal?.ingredients === "string") bits.push(meal.ingredients);
  return bits.filter(Boolean).join(" ").toLowerCase();
}

export function tokenizeLikes(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

export function dislikeTokens({ allergens, foodAvoids, allergenNote } = {}) {
  const tokens = [];
  for (const id of normalizeAllergens(allergens)) {
    tokens.push(...(ALLERGEN_WORDS[id] || [id]));
  }
  const extra = [foodAvoids, allergenNote].filter(Boolean).join(",");
  for (const part of String(extra).split(/[\n,]+/)) {
    const t = part.trim().toLowerCase();
    if (t.length >= 3) tokens.push(t);
  }
  return [...new Set(tokens)];
}

/** "mushrooms" typed in Food prefs has to catch a meal called "Mushroom risotto". */
function singularize(word) {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function mealHitsToken(meal, token) {
  const hay = mealHaystack(meal);
  const t = String(token || "").toLowerCase().trim();
  if (!t) return false;
  if (t.includes(" ")) return hay.includes(t);
  const words = hay.split(/[^a-z0-9+]+/);
  if (words.includes(t) || hay.includes(t)) return true;
  const stem = singularize(t);
  return stem !== t && (words.includes(stem) || words.some((w) => singularize(w) === stem));
}

export function mealAllowedForDiet(meal, diet) {
  const d = normalizeDiet(diet);
  if (d === "none") return true;
  const hay = mealHaystack(meal);
  const has = (list) => list.some((w) => hay.includes(w));
  if (d === "pescatarian") return !has(LAND_MEAT);
  if (d === "vegetarian") return !has(LAND_MEAT) && !has(FISH);
  if (d === "vegan") return !has(LAND_MEAT) && !has(FISH) && !has(EGGS) && !has(DAIRY) && !has(HONEY);
  return true;
}

export function mealHitsDislike(meal, tokens) {
  return (tokens || []).some((t) => mealHitsToken(meal, t));
}

export function likeMatch(meal, likeTokens) {
  for (const word of likeTokens || []) {
    if (mealHitsToken(meal, word)) return word;
  }
  return null;
}

/** Her free-text preference for one slot, from Food prefs. */
export function slotPrefText(profile, slot) {
  if (slot === "breakfast") return profile?.prefB || profile?.pref_b || "";
  if (slot === "lunch") return profile?.prefL || profile?.pref_l || "";
  if (slot === "dinner") return profile?.prefD || profile?.pref_d || "";
  if (slot === "snack") return profile?.prefS || profile?.pref_s || "";
  return "";
}

/** Every portion suffix the app writes: "· 2×", "· 2 servings", "· half portion". */
export function stripPortionSuffix(name) {
  return String(name || "")
    .replace(/\s·\s[\d.]+×$/i, "")
    .replace(/\s·\s[\d.]+\sservings?$/i, "")
    .replace(/\s·\shalf portion$/i, "")
    .trim();
}

export function namesMatch(a, b) {
  return stripPortionSuffix(a).toLowerCase() === stripPortionSuffix(b).toLowerCase();
}

const PROTEIN_KEYS = [
  "chicken", "turkey", "beef", "pork", "salmon", "tuna", "halibut", "cod",
  "shrimp", "yogurt", "cottage", "egg", "tofu", "tempeh", "protein",
];

/** Keyword protein so three cards aren't three chicken bowls. */
export function primaryProtein(meal) {
  const hay = mealHaystack(meal);
  for (const key of PROTEIN_KEYS) {
    if (hay.includes(key)) return key;
  }
  return "other";
}

/** Everything the ranker needs about her tastes, from one profile row. */
export function coachPrefsFromProfile(profile, slot) {
  return {
    diet: profile?.diet || "none",
    dislikes: dislikeTokens({
      allergens: profile?.allergens,
      foodAvoids: profile?.foodAvoids ?? profile?.food_avoids,
      allergenNote: profile?.allergenNote ?? profile?.allergen_note,
    }),
    likes: tokenizeLikes(slotPrefText(profile, slot)),
  };
}
