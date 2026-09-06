/**
 * Pencilling a coach card into today's plan, and taking it back out again when
 * she logs it. A pencil is a soft commitment: it holds the slot's room so the
 * next answer doesn't spend it twice.
 */

import { COACH_VIA, coachPencilForSlot } from "./coachBudget.js";
import { namesMatch } from "./coachPrefs.js";
import { coachPlanFieldsFromCard } from "./coachScale.js";
import { normalizeSlot } from "./mealSlots.js";
import {
  addMealToDay,
  customMealToPlanMeal,
  PLAN_DAYS,
  recipeToPlanMeal,
  removeMealById,
  replaceMealById,
} from "./weekPlan.js";

const WEEKDAY_KEY_TO_PLAN = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  T2: "Thu",
  F: "Fri",
  S: "Sat",
  S2: "Sun",
};

/** Week plan days are Mon…Sun. Habit checkins use M/T/W/T2. */
export function planDayFromAnyKey(dayKey) {
  if (PLAN_DAYS.includes(dayKey)) return dayKey;
  return WEEKDAY_KEY_TO_PLAN[dayKey] || dayKey;
}

/** Card-scaled macros with qty 1. `recipeToPlanMeal` must not pin qty or clobber cal. */
export function buildCoachPlanMeal(card, slot, qtyOverride) {
  const fields = coachPlanFieldsFromCard(card, qtyOverride);
  const base = {
    ...fields,
    cat: card.source === "pantry" ? "pantry" : slot,
    serves: 1,
    servings: 1,
    qty: 1,
  };
  const built = card.source === "my"
    ? customMealToPlanMeal({ ...card, ...base }, slot)
    : recipeToPlanMeal(base, slot);
  return {
    ...built,
    via: COACH_VIA,
    source: card.source || built.source || null,
    qty: 1,
    servings: 1,
    cal: fields.cal,
    p: fields.p,
    c: fields.c,
    f: fields.f,
  };
}

/** Add or replace today's coach pencil for a slot. Incoming macros win. */
export function writeCoachPencil(days, dayKey, card, slot, qtyOverride) {
  const day = planDayFromAnyKey(dayKey);
  const built = buildCoachPlanMeal(card, slot, qtyOverride);
  const existing = coachPencilForSlot(
    (days || []).find((d) => d.day === day)?.meals,
    slot,
  );
  const next = existing
    ? replaceMealById(days, existing.id, built)
    : addMealToDay(days, day, built);
  return { days: next, meal: built, replaced: Boolean(existing) };
}

/** Drop today's coach pencil for a slot so the held row comes back. */
export function clearCoachPencil(days, dayKey, slotOrMeal) {
  const slot = normalizeSlot(typeof slotOrMeal === "string" ? slotOrMeal : slotOrMeal?.slot);
  if (!slot) return days;
  const day = planDayFromAnyKey(dayKey);
  const existing = coachPencilForSlot(
    (days || []).find((d) => d.day === day)?.meals,
    slot,
  );
  if (!existing?.id) return days;
  return removeMealById(days, existing.id);
}

/** Drop the coach plan row that a matching log has now replaced. */
export function removeCoachPencilMatchingLog(days, dayKey, entry) {
  const slot = normalizeSlot(entry?.slot);
  const name = entry?.name;
  if (!slot || !name) return days;
  const day = planDayFromAnyKey(dayKey);
  const existing = (days || []).find((d) => d.day === day)?.meals?.find((m) => (
    m.via === COACH_VIA
    && normalizeSlot(m.slot) === slot
    && namesMatch(m.name, name)
  ));
  if (!existing?.id) return days;
  return removeMealById(days, existing.id);
}
