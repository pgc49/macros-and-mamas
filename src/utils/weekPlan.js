/**
 * Client week planner helpers.
 * Flexible days: any number of meals per day (multiple snacks, no dinner, etc.).
 * Grocery only counts meals that are on the plan.
 */

import { RECIPES } from "../content/data.js";
import { DEFAULT_WEEK } from "../content/defaultWeek.js";
import { withRecipeDetail } from "../content/recipeDetails.js";

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
  return meal.id ? meal : { ...meal, id: newMealId() };
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

export function sumDayTotals(meals) {
  const t = (meals || []).reduce(
    (a, m) => ({
      cal: a.cal + (Number(m.cal) || 0),
      p: a.p + (Number(m.p) || 0),
      c: a.c + (Number(m.c) || 0),
      f: a.f + (Number(m.f) || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );
  return {
    cal: Math.round(t.cal),
    p: Math.round(t.p),
    c: Math.round(t.c),
    f: Math.round(t.f),
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
    ingredients: detail.serving || [],
    batch: detail.batch || null,
    steps: detail.steps || [],
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

/** Replace a meal in place (swap recipe, keep id/position). */
export function replaceMealById(days, mealId, meal) {
  if (!mealId || !meal) return normalizeWeekDays(days);
  return normalizeWeekDays(days).map((d) => {
    const idx = (d.meals || []).findIndex((m) => m.id === mealId);
    if (idx < 0) return d;
    const meals = [...d.meals];
    meals[idx] = withMealId({ ...meal, id: mealId });
    return { ...d, meals: sortMeals(meals), dayTotals: sumDayTotals(meals) };
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

/** @deprecated one-meal-per-slot — prefer addMealToDay / removeMealById */
export function mealForSlot(day, slot) {
  const want = String(slot || "").toLowerCase();
  return (day?.meals || []).find((m) => String(m.slot || m.cat || "").toLowerCase() === want) || null;
}

/** @deprecated prefer addMealToDay / replaceMealById */
export function setSlotMeal(days, dayKey, slot, meal) {
  const wantSlot = String(slot).toLowerCase();
  return normalizeWeekDays(days).map((d) => {
    if (d.day !== dayKey) return d;
    const others = (d.meals || []).filter(
      (m) => String(m.slot || m.cat || "").toLowerCase() !== wantSlot,
    );
    const meals = meal
      ? sortMeals([...others, withMealId({ ...meal, slot: wantSlot })])
      : others;
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
        ingredients: m.ingredients || m.serving || [],
        batch: m.batch ?? null,
        steps: m.steps || [],
      }),
    ),
    dayTotals: sumDayTotals(d.meals || []),
  }));
}

export function bankRecipesForSlot(slot) {
  const key = String(slot || "").toLowerCase();
  if (!key || key === "any" || key === "all") return RECIPES;
  const label = SLOT_LABEL[key] || "";
  if (!label) return RECIPES;
  return RECIPES.filter((r) => r.cat === label);
}
