/**
 * Client week planner helpers.
 * Flexible days: any number of meals per day (multiple snacks, no dinner, etc.).
 * Grocery only counts meals that are on the plan.
 * `qty` = serving multiplier (0.25–4) for range tuning + grocery notes.
 */

import { RECIPES } from "../content/data.js";
import { DEFAULT_WEEK } from "../content/defaultWeek.js";
import { withRecipeDetail } from "../content/recipeDetails.js";
import { snapServings } from "./servings.jsx";

export const PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABEL = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function newMealId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function withMealId(meal) {
  if (!meal) return meal;
  const qty = snapServings(meal.qty ?? 1);
  return meal.id ? { ...meal, qty } : { ...meal, id: newMealId(), qty };
}

export function emptyWeekPlan() {
  return PLAN_DAYS.map((day) => ({ day, theme: "", meals: [] }));
}

/** Callie's sample Mon–Sun week as an editable starting plan. */
export function defaultSampleWeek() {
  return cloneDaysToPlan(DEFAULT_WEEK);
}

export function normalizeWeekDays(days) {
  const byDay = new Map();
  (Array.isArray(days) ? days : []).forEach((d) => {
    if (d?.day) byDay.set(d.day, d);
  });
  return PLAN_DAYS.map((day) => {
    const existing = byDay.get(day);
    const meals = Array.isArray(existing?.meals)
      ? existing.meals.filter((m) => m && m.name).map(withMealId)
      : [];
    return {
      day,
      theme: existing?.theme || "",
      meals,
      dayTotals: sumDayTotals(meals),
    };
  });
}

/** Macros for one planned meal after serving multiplier. */
export function scaledMealMacros(meal) {
  const qty = snapServings(meal?.qty ?? 1);
  const mul = (v) => Math.round((Number(v) || 0) * qty);
  return {
    cal: mul(meal?.cal),
    p: mul(meal?.p),
    c: mul(meal?.c),
    f: mul(meal?.f),
    qty,
  };
}

export function sumDayTotals(meals) {
  const t = (meals || []).reduce(
    (a, m) => {
      const s = scaledMealMacros(m);
      return {
        cal: a.cal + s.cal,
        p: a.p + s.p,
        c: a.c + s.c,
        f: a.f + s.f,
      };
    },
    { cal: 0, p: 0, c: 0, f: 0 },
  );
  return {
    cal: Math.round(t.cal),
    p: Math.round(t.p),
    c: Math.round(t.c),
    f: Math.round(t.f),
  };
}

/** Daily bands from approved macros (same walls as AI meal plan). */
export function targetBands(macros) {
  if (!macros) return null;
  const pLo = Number(macros.protein) || 0;
  const cLo = Number(macros.carbs) || 0;
  const fLo = Number(macros.fat) || 0;
  const calLo = Number(macros.cal) || 0;
  return {
    calLo,
    calHi: calLo + 150,
    pLo,
    pHi: pLo + 10,
    cLo,
    cHi: cLo + 10,
    fLo,
    fHi: fLo + 10,
  };
}

export function dayInRange(totals, bands) {
  if (!bands || !totals) return null;
  return {
    cal: totals.cal >= bands.calLo && totals.cal <= bands.calHi,
    p: totals.p >= bands.pLo && totals.p <= bands.pHi,
    c: totals.c >= bands.cLo && totals.c <= bands.cHi,
    f: totals.f >= bands.fLo && totals.f <= bands.fHi,
  };
}

export function dayAllInRange(inRange) {
  if (!inRange) return null;
  return inRange.cal && inRange.p && inRange.c && inRange.f;
}

/**
 * Coaching while she builds a day — don't yell "out of range" with 1–2 meals.
 * Returns remaining room + short actionable tips.
 */
export function rangeCoach(totals, bands, mealCount = 0) {
  if (!bands) return null;
  const n = Number(mealCount) || 0;
  if (!n) {
    return {
      phase: "empty",
      headline: null,
      remaining: null,
      tips: [],
    };
  }

  const rem = {
    cal: bands.calLo - (totals?.cal || 0),
    p: bands.pLo - (totals?.p || 0),
    c: bands.cLo - (totals?.c || 0),
    f: bands.fLo - (totals?.f || 0),
  };
  const over = {
    cal: (totals?.cal || 0) - bands.calHi,
    p: (totals?.p || 0) - bands.pHi,
    c: (totals?.c || 0) - bands.cHi,
    f: (totals?.f || 0) - bands.fHi,
  };
  const ir = dayInRange(totals, bands);
  const allIn = dayAllInRange(ir);

  // Still filling the day — show budget left, not failure
  const looksComplete = n >= 3 || (totals?.cal || 0) >= bands.calLo * 0.85;
  if (!looksComplete) {
    const tips = [];
    if (rem.p > 8) tips.push(`Still need ~${Math.round(rem.p)}g protein — add a protein-forward meal or bump a serving.`);
    else if (rem.cal > 200) tips.push(`~${Math.round(rem.cal)} cal left in range — keep adding lunch/dinner/snack.`);
    else tips.push("Keep building the day — ranges apply to the full plate, not one meal.");
    return {
      phase: "building",
      headline: "Building this day",
      remaining: rem,
      tips: tips.slice(0, 2),
    };
  }

  if (allIn) {
    return {
      phase: "in",
      headline: "In range",
      remaining: rem,
      tips: ["Nice — this day lands in your bands. Tweak servings anytime."],
    };
  }

  const tips = [];
  if (over.p > 0) tips.push(`Protein is ~${Math.round(over.p)}g over — trim a serving on the highest-protein meal.`);
  else if (rem.p > 0) tips.push(`Need ~${Math.round(rem.p)}g more protein — bump a serving or add yogurt, chicken, or a shake.`);

  if (over.c > 0) tips.push(`Carbs are ~${Math.round(over.c)}g over — ease rice/fruit/tortilla portions (0.75× works).`);
  else if (rem.c > 0 && tips.length < 2) tips.push(`Need ~${Math.round(rem.c)}g more carbs — fruit, rice, or oats on a meal.`);

  if (over.f > 0 && tips.length < 2) tips.push(`Fat is ~${Math.round(over.f)}g over — watch oils, PB, avocado, cheese.`);
  else if (rem.f > 0 && tips.length < 2) tips.push(`Need ~${Math.round(rem.f)}g more fat — olive oil, avocado, or nuts.`);

  if (over.cal > 0 && tips.length < 2) tips.push(`~${Math.round(over.cal)} cal over the top of your band — dial a serving down.`);
  else if (rem.cal > 0 && tips.length < 2) tips.push(`~${Math.round(rem.cal)} cal short of the bottom — add a snack or bump a serving.`);

  if (!tips.length) tips.push("Close — nudge servings until the chips go green.");

  return {
    phase: "adjust",
    headline: "Nudge to land in range",
    remaining: rem,
    tips: tips.slice(0, 2),
  };
}

export function countPlannedMeals(days) {
  return (days || []).reduce((n, d) => n + (d.meals?.length || 0), 0);
}

/** Convert a bank recipe into a planner meal row (with ingredients for grocery). */
export function recipeToPlanMeal(recipe, slotOverride = null) {
  const detail = withRecipeDetail(recipe);
  const slot = (slotOverride || recipe.cat || "meal").toString().toLowerCase();
  return withMealId({
    slot,
    name: recipe.name,
    basedOn: recipe.name,
    desc: recipe.desc || "",
    cal: Number(recipe.cal) || 0,
    p: Number(recipe.p) || 0,
    c: Number(recipe.c) || 0,
    f: Number(recipe.f) || 0,
    servings: Number(recipe.serves) || 1,
    qty: 1,
    ingredients: detail.serving || [],
    batch: detail.batch || null,
    steps: detail.steps || [],
  });
}

/** My meals are macros-only — fine for ranges; grocery lines will be thin. */
export function customMealToPlanMeal(custom, slotOverride = "snack") {
  const slot = String(slotOverride || "snack").toLowerCase();
  return withMealId({
    slot: PLAN_SLOTS.includes(slot) ? slot : "snack",
    name: custom.name,
    basedOn: null,
    desc: "From My meals",
    cal: Number(custom.cal) || 0,
    p: Number(custom.p) || 0,
    c: Number(custom.c) || 0,
    f: Number(custom.f) || 0,
    servings: 1,
    qty: 1,
    ingredients: [],
    batch: null,
    steps: [],
  });
}

/** AI describe / slot-options meal → planner row (keeps ingredients for grocery). */
export function aiIdeaToPlanMeal(idea, slotOverride = null) {
  const raw = String(slotOverride || idea?.slot || "dinner").toLowerCase();
  const slot = PLAN_SLOTS.includes(raw) ? raw : "dinner";
  return withMealId({
    slot,
    name: idea.name,
    basedOn: idea.basedOn || null,
    desc: idea.desc || "",
    cal: Number(idea.cal) || 0,
    p: Number(idea.p) || 0,
    c: Number(idea.c) || 0,
    f: Number(idea.f) || 0,
    servings: Number(idea.servings) || 1,
    qty: 1,
    ingredients: Array.isArray(idea.ingredients) ? idea.ingredients : [],
    batch: Array.isArray(idea.batch) && idea.batch.length ? idea.batch : null,
    steps: Array.isArray(idea.steps) ? idea.steps : [],
  });
}

function sortMeals(meals) {
  return [...meals].sort((a, b) => {
    const ia = PLAN_SLOTS.indexOf(String(a.slot || "").toLowerCase());
    const ib = PLAN_SLOTS.indexOf(String(b.slot || "").toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/** Append a meal to a day (allows multiple snacks / extras). */
export function addMealToDay(days, dayKey, meal) {
  const nextMeal = withMealId({ ...meal, slot: String(meal.slot || "snack").toLowerCase() });
  return normalizeWeekDays(days).map((d) => {
    if (d.day !== dayKey) return d;
    const meals = sortMeals([...(d.meals || []), nextMeal]);
    return { ...d, meals, dayTotals: sumDayTotals(meals) };
  });
}

/** Remove one meal by id. */
export function removeMealById(days, mealId) {
  if (!mealId) return normalizeWeekDays(days);
  return normalizeWeekDays(days).map((d) => {
    const meals = (d.meals || []).filter((m) => m.id !== mealId);
    if (meals.length === (d.meals || []).length) return d;
    return { ...d, meals, dayTotals: sumDayTotals(meals) };
  });
}

/** Replace a meal in place (swap recipe, keep id/position/qty). */
export function replaceMealById(days, mealId, meal) {
  if (!mealId || !meal) return normalizeWeekDays(days);
  return normalizeWeekDays(days).map((d) => {
    const idx = (d.meals || []).findIndex((m) => m.id === mealId);
    if (idx < 0) return d;
    const prev = d.meals[idx];
    const meals = [...d.meals];
    meals[idx] = withMealId({ ...meal, id: mealId, qty: prev.qty ?? meal.qty ?? 1 });
    return { ...d, meals: sortMeals(meals), dayTotals: sumDayTotals(meals) };
  });
}

export function setMealQty(days, mealId, qty) {
  if (!mealId) return normalizeWeekDays(days);
  const nextQty = snapServings(qty);
  return normalizeWeekDays(days).map((d) => {
    const idx = (d.meals || []).findIndex((m) => m.id === mealId);
    if (idx < 0) return d;
    const meals = [...d.meals];
    meals[idx] = { ...meals[idx], qty: nextQty };
    return { ...d, meals, dayTotals: sumDayTotals(meals) };
  });
}

/**
 * Move a meal to another day (and optional index).
 * toIndex omitted → append then sort by slot.
 */
export function moveMeal(days, mealId, toDay, toIndex = null) {
  const normalized = normalizeWeekDays(days);
  let moving = null;
  const stripped = normalized.map((d) => {
    const keep = [];
    (d.meals || []).forEach((m) => {
      if (m.id === mealId) moving = m;
      else keep.push(m);
    });
    return { ...d, meals: keep, dayTotals: sumDayTotals(keep) };
  });
  if (!moving) return normalized;

  return stripped.map((d) => {
    if (d.day !== toDay) return d;
    const meals = [...(d.meals || [])];
    if (toIndex == null || toIndex < 0 || toIndex > meals.length) {
      meals.push(moving);
      return { ...d, meals: sortMeals(meals), dayTotals: sumDayTotals(meals) };
    }
    meals.splice(toIndex, 0, moving);
    return { ...d, meals, dayTotals: sumDayTotals(meals) };
  });
}

/** Seed planner from coach-published plan, AI, or DEFAULT_WEEK. */
export function cloneDaysToPlan(sourceDays) {
  return normalizeWeekDays(sourceDays).map((d) => ({
    day: d.day,
    theme: d.theme || "",
    meals: (d.meals || []).map((m) =>
      withMealId({
        slot: String(m.slot || m.cat || "meal").toLowerCase(),
        name: m.name,
        basedOn: m.basedOn || null,
        desc: m.desc || "",
        cal: Number(m.cal) || 0,
        p: Number(m.p) || 0,
        c: Number(m.c) || 0,
        f: Number(m.f) || 0,
        servings: Number(m.servings || m.serves) || 1,
        qty: m.qty ?? 1,
        ingredients: m.ingredients || m.serving || [],
        batch: m.batch ?? null,
        steps: m.steps || [],
      }),
    ),
    dayTotals: sumDayTotals(
      (d.meals || []).map((m) => ({ ...m, qty: m.qty ?? 1 })),
    ),
  }));
}

export function bankRecipesForSlot(slot) {
  const key = String(slot || "").toLowerCase();
  if (!key || key === "any" || key === "all") return RECIPES;
  const label = SLOT_LABEL[key] || "";
  if (!label) return RECIPES;
  return RECIPES.filter((r) => r.cat === label);
}
