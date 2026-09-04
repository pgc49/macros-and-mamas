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
  recipeToPlanMeal,
  removeMealById,
  replaceMealById,
} from "./weekPlan.js";

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
  const built = buildCoachPlanMeal(card, slot, qtyOverride);
  const existing = coachPencilForSlot(
    (days || []).find((d) => d.day === dayKey)?.meals,
    slot,
  );
  const next = existing
    ? replaceMealById(days, existing.id, built)
    : addMealToDay(days, dayKey, built);
  return { days: next, meal: built, replaced: Boolean(existing) };
}

/** Drop today's coach pencil for a slot so the held row comes back. */
export function clearCoachPencil(days, dayKey, slotOrMeal) {
  const slot = normalizeSlot(typeof slotOrMeal === "string" ? slotOrMeal : slotOrMeal?.slot);
  if (!slot) return days;
  const existing = coachPencilForSlot(
    (days || []).find((d) => d.day === dayKey)?.meals,
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
  const existing = (days || []).find((d) => d.day === dayKey)?.meals?.find((m) => (
    m.via === COACH_VIA
    && normalizeSlot(m.slot) === slot
    && namesMatch(m.name, name)
  ));
  if (!existing?.id) return days;
  return removeMealById(days, existing.id);
}
