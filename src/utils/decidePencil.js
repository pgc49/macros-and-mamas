import { decidePencilForSlot } from "./decideBudget.js";
import { decidePlanFieldsFromCard } from "./decideScale.js";
import { addMealToDay, customMealToPlanMeal, recipeToPlanMeal, replaceMealById } from "./weekPlan.js";

/** 1× macros + decide qty. recipeToPlanMeal must not pin qty at 1. */
export function buildDecidePlanMeal(card, slot, qtyOverride) {
  const fields = decidePlanFieldsFromCard(card, qtyOverride);
  const base = {
    ...fields,
    cat: card.source === "pantry" ? "pantry" : slot,
    serves: 1,
  };
  const built = card.source === "my"
    ? customMealToPlanMeal({ ...card, ...base }, slot)
    : recipeToPlanMeal(base, slot);
  return {
    ...built,
    via: "decide",
    qty: fields.qty,
    servings: fields.qty,
    cal: fields.cal,
    p: fields.p,
    c: fields.c,
    f: fields.f,
  };
}

/** Add or replace today's decide pencil. Incoming qty wins on replace. */
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
