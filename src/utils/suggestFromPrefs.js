/**
 * Rank Callie's recipe bank against intake tastes (prefB / prefL / prefD).
 * Instant, offline — used in the slot picker and as AI fallback.
 */

import { RECIPES } from "../content/data.js";
import { SLOT_LABEL, recipeToPlanMeal } from "./weekPlan.js";

const STOP = new Set([
  "a", "an", "the", "and", "or", "with", "for", "to", "of", "in", "on",
  "any", "anything", "something", "love", "loves", "like", "likes", "i",
  "my", "me", "food", "foods", "meal", "meals", "usually", "often",
]);

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s+/&-]/g, " ")
    .split(/[\s+/&,-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function prefForSlot(profile, slot) {
  const s = String(slot || "").toLowerCase();
  if (s === "breakfast") return profile?.prefB || "";
  if (s === "lunch") return profile?.prefL || "";
  if (s === "dinner") return profile?.prefD || "";
  // Snacks: blend all tastes lightly
  return [profile?.prefB, profile?.prefL, profile?.prefD].filter(Boolean).join(" ");
}

function scoreRecipe(recipe, prefTokens) {
  if (!prefTokens.length) return 0;
  const hay = `${recipe.name} ${recipe.desc} ${recipe.cat}`.toLowerCase();
  let score = 0;
  for (const t of prefTokens) {
    if (hay.includes(t)) score += t.length >= 5 ? 3 : 2;
    // Soft aliases
    if (t === "smoothie" && /smoothie|shake/.test(hay)) score += 2;
    if ((t === "taco" || t === "tacos") && /taco/.test(hay)) score += 3;
    if ((t === "salad" || t === "salads") && /salad/.test(hay)) score += 2;
    if ((t === "oat" || t === "oatmeal" || t === "oats") && /oat/.test(hay)) score += 2;
    if ((t === "yogurt" || t === "greek") && /yogurt/.test(hay)) score += 2;
    if ((t === "chicken") && /chicken/.test(hay)) score += 2;
    if ((t === "salmon" || t === "fish") && /(salmon|halibut|tuna|fish)/.test(hay)) score += 2;
    if ((t === "turkey") && /turkey/.test(hay)) score += 2;
    if ((t === "egg" || t === "eggs" || t === "scramble") && /egg/.test(hay)) score += 2;
    if ((t === "rice" || t === "bowl" || t === "bowls") && /(rice|bowl)/.test(hay)) score += 1;
    if ((t === "asian" || t === "teriyaki" || t === "stir") && /(teriyaki|stir|aminos)/.test(hay)) score += 3;
    if ((t === "pasta") && /marinara|meatball/.test(hay)) score += 2;
    if ((t === "sandwich" || t === "sourdough") && /sourdough/.test(hay)) score += 2;
    if ((t === "peanut" || t === "pb") && /peanut/.test(hay)) score += 3;
  }
  return score;
}

/**
 * @returns {Array<{ recipe, score, reason }>} sorted best-first
 */
export function suggestRecipesForSlot(profile, slot, { limit = 6 } = {}) {
  const label = SLOT_LABEL[String(slot || "").toLowerCase()];
  const pool = label ? RECIPES.filter((r) => r.cat === label) : RECIPES;
  const prefTokens = tokens(prefForSlot(profile, slot));
  const ranked = pool
    .map((recipe) => {
      const score = scoreRecipe(recipe, prefTokens);
      return {
        recipe,
        score,
        reason: score > 0 ? "Matches what you told Callie you love" : "From Callie's bank",
      };
    })
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));

  // Prefer scored matches; if none scored, still return bank options
  const hits = ranked.filter((r) => r.score > 0);
  const list = hits.length ? hits : ranked;
  return list.slice(0, limit);
}

/** Build a full week from top bank matches per slot (no AI). */
export function suggestWeekFromBank(profile) {
  const themes = {
    Mon: "your tastes · start strong",
    Tue: "your tastes · keep it simple",
    Wed: "your tastes · midweek fuel",
    Thu: "your tastes · leftovers-friendly",
    Fri: "your tastes · easy Friday",
    Sat: "your tastes · weekend plate",
    Sun: "your tastes · reset Sunday",
  };

  const dinnerPool = suggestRecipesForSlot(profile, "dinner", { limit: 7 }).map((r) => r.recipe);
  const lunchPool = suggestRecipesForSlot(profile, "lunch", { limit: 7 }).map((r) => r.recipe);
  const breakfastPool = suggestRecipesForSlot(profile, "breakfast", { limit: 7 }).map((r) => r.recipe);
  const snackPool = suggestRecipesForSlot(profile, "snack", { limit: 7 }).map((r) => r.recipe);

  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
    const b = breakfastPool[i % Math.max(breakfastPool.length, 1)];
    const l = lunchPool[i % Math.max(lunchPool.length, 1)];
    const d = dinnerPool[i % Math.max(dinnerPool.length, 1)];
    const s = snackPool[i % Math.max(snackPool.length, 1)];
    const meals = [
      b && recipeToPlanMeal(b, "breakfast"),
      l && recipeToPlanMeal(l, "lunch"),
      d && recipeToPlanMeal(d, "dinner"),
      s && recipeToPlanMeal(s, "snack"),
    ].filter(Boolean);
    return { day, theme: themes[day], meals };
  });
}
