/**
 * Client week planner helpers.
 * Plan shape matches By Day / published plans: days[] with meals[].
 * Empty slots are omitted — grocery only counts meals that are set.
 */

import { RECIPES } from "../content/data.js";
import { withRecipeDetail } from "../content/recipeDetails.js";

export const PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABEL = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function emptyWeekPlan() {
  return PLAN_DAYS.map((day) => ({ day, theme: "", meals: [] }));
}

export function normalizeWeekDays(days) {
  const byDay = new Map();
  (Array.isArray(days) ? days : []).forEach((d) => {
    if (d?.day) byDay.set(d.day, d);
  });
  return PLAN_DAYS.map((day) => {
    const existing = byDay.get(day);
    const meals = Array.isArray(existing?.meals)
      ? existing.meals.filter((m) => m && m.name)
      : [];
    return {
      day,
      theme: existing?.theme || "",
      meals,
      dayTotals: existing?.dayTotals || sumDayTotals(meals),
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
  return {
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
  };
}

/** Find meal in a day's meals for a slot (first match). */
export function mealForSlot(day, slot) {
  const want = String(slot || "").toLowerCase();
  return (day?.meals || []).find((m) => String(m.slot || m.cat || "").toLowerCase() === want) || null;
}

/**
 * Set or replace the meal for day+slot. Pass null to clear.
 * Returns a new days array (immutable).
 */
export function setSlotMeal(days, dayKey, slot, meal) {
  const wantSlot = String(slot).toLowerCase();
  return normalizeWeekDays(days).map((d) => {
    if (d.day !== dayKey) return d;
    const others = (d.meals || []).filter(
      (m) => String(m.slot || m.cat || "").toLowerCase() !== wantSlot,
    );
    const meals = meal ? [...others, { ...meal, slot: wantSlot }] : others;
    // Keep breakfast → lunch → dinner → snack order
    meals.sort((a, b) => {
      const ia = PLAN_SLOTS.indexOf(String(a.slot || "").toLowerCase());
      const ib = PLAN_SLOTS.indexOf(String(b.slot || "").toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return { ...d, meals, dayTotals: sumDayTotals(meals) };
  });
}

/** Seed planner from coach-published plan (or AI suggest result). */
export function cloneDaysToPlan(sourceDays) {
  return normalizeWeekDays(sourceDays).map((d) => ({
    day: d.day,
    theme: d.theme || "",
    meals: (d.meals || []).map((m) => ({
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
    })),
    dayTotals: sumDayTotals(d.meals || []),
  }));
}

export function bankRecipesForSlot(slot) {
  const label = SLOT_LABEL[String(slot || "").toLowerCase()] || "";
  return RECIPES.filter((r) => r.cat === label);
}
