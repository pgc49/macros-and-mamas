import { decidePencilForSlot } from "./decideBudget.js";
import { namesMatch } from "./decidePrefs.js";
import { decidePlanFieldsFromCard } from "./decideScale.js";
import { normalizeSlot } from "./mealSlots.js";
import { addMealToDay, customMealToPlanMeal, recipeToPlanMeal, removeMealById, replaceMealById } from "./weekPlan.js";

/** Sheet-scaled macros + qty 1. recipeToPlanMeal must not pin qty or clobber cal. */
export function buildDecidePlanMeal(card, slot, qtyOverride) {
  const fields = decidePlanFieldsFromCard(card, qtyOverride);
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
    via: "decide",
    qty: 1,
    servings: 1,
    cal: fields.cal,
    p: fields.p,
    c: fields.c,
    f: fields.f,
  };
}

/** Add or replace today's decide pencil. Incoming decide macros/qty win on replace. */
export function writeDecidePencil(days, dayKey, card, slot, qtyOverride) {
  const built = buildDecidePlanMeal(card, slot, qtyOverride);
  const existing = decidePencilForSlot(
    (days || []).find((d) => d.day === dayKey)?.meals,
    slot,
  );
  const next = existing
    ? replaceMealById(days, existing.id, built)
    : addMealToDay(days, dayKey, built);
  return { days: next, meal: built, replaced: Boolean(existing) };
}

/** Drop today's decide pencil for a slot so the Holding row can come back. */
export function clearDecidePencil(days, dayKey, slotOrMeal) {
  const slot = normalizeSlot(typeof slotOrMeal === "string" ? slotOrMeal : slotOrMeal?.slot);
  if (!slot) return days;
  const existing = decidePencilForSlot(
    (days || []).find((d) => d.day === dayKey)?.meals,
    slot,
  );
  if (!existing?.id) return days;
  return removeMealById(days, existing.id);
}

/** Drop the via=decide plan row that Ate-it / decide_bank logged. */
export function removeDecidePencilMatchingLog(days, dayKey, entry) {
  const slot = normalizeSlot(entry?.slot);
  const name = entry?.name;
  if (!slot || !name) return days;
  const existing = (days || []).find((d) => d.day === dayKey)?.meals?.find((m) => (
    m.via === "decide"
    && normalizeSlot(m.slot) === slot
    && namesMatch(m.name, name)
  ));
  if (!existing?.id) return days;
  return removeMealById(days, existing.id);
}
