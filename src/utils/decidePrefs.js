import { normalizeAllergens, normalizeDiet } from "../content/foodPrefs";
import { DECIDE_COPY } from "../content/decideVoice";

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

export function mealHaystack(meal) {
  const bits = [meal?.name, meal?.desc, meal?.cat];
  const ings = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  for (const line of ings) {
    if (typeof line === "string") bits.push(line);
    else bits.push(line?.item, line?.name, line?.amount);
  }
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

export function mealHitsToken(meal, token) {
  const hay = mealHaystack(meal);
  const t = String(token || "").toLowerCase().trim();
  if (!t) return false;
  if (t.includes(" ")) return hay.includes(t);
  return hay.split(/[^a-z0-9+]+/).includes(t) || hay.includes(t);
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

export function prefsLine({ allergens, foodAvoids, likes } = {}) {
  const nos = [];
  for (const id of normalizeAllergens(allergens).slice(0, 2)) {
    nos.push(id.replace(/_/g, " "));
  }
  const avoidBits = String(foodAvoids || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const bit of avoidBits) {
    if (nos.length >= 2) break;
    if (!nos.includes(bit.toLowerCase())) nos.push(bit.toLowerCase());
  }
  const likeBits = (likes || []).slice(0, 2);
  const parts = [
    ...nos.map((n) => `no ${n}`),
    ...likeBits.map((w) => w),
  ];
  if (!parts.length) return "";
  const noPart = nos.map((n) => `no ${n}`).join(", ");
  const mid = [noPart, likeBits.length ? `likes ${likeBits.join(", ")}` : ""]
    .filter(Boolean)
    .join(", ");
  return `${DECIDE_COPY.usingPrefs}: ${mid} · ${DECIDE_COPY.editPrefs}`;
}

export function slotPrefText(profile, slot) {
  if (slot === "breakfast") return profile?.prefB || "";
  if (slot === "lunch") return profile?.prefL || "";
  if (slot === "dinner") return profile?.prefD || "";
  if (slot === "snack") return profile?.prefS || "";
  return "";
}

export function stripPortionSuffix(name) {
  return String(name || "").replace(/\s·\s[\d.]+×$/i, "").trim();
}

export function namesMatch(a, b) {
  return stripPortionSuffix(a).toLowerCase() === stripPortionSuffix(b).toLowerCase();
}

const PROTEIN_KEYS = [
  "chicken", "turkey", "beef", "pork", "salmon", "tuna", "halibut", "cod",
  "shrimp", "yogurt", "cottage", "egg", "tofu", "tempeh", "protein",
];

export function primaryProtein(meal) {
  const hay = mealHaystack(meal);
  for (const key of PROTEIN_KEYS) {
    if (hay.includes(key)) return key;
  }
  return "other";
}

export function pantryHits(meal, pantryNames = []) {
  const hay = mealHaystack(meal);
  return (pantryNames || []).filter((n) => {
    const t = String(n || "").toLowerCase().trim();
    return t.length >= 3 && hay.includes(t);
  });
}
