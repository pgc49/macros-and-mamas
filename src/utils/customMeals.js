/** Stable identity for My meals rows — prefer id so list order cannot rematch slots. */
export function customMealId(meal) {
  if (meal?.id == null) return "";
  return String(meal.id).trim();
}

export function customMealKey(meal) {
  const id = customMealId(meal);
  if (id) return `id:${id}`;
  const name = String(meal?.name || "").trim();
  return name ? `name:${name}` : "";
}

export function customMealsMatch(a, b) {
  const aId = customMealId(a);
  const bId = customMealId(b);
  if (aId && bId) return aId === bId;
  const aName = String(a?.name || "").trim();
  const bName = String(b?.name || "").trim();
  return Boolean(aName && aName === bName);
}

/** Replace in place when keepOrder; never match a named meal onto a different id. */
export function mergeSavedCustomMeal(list, saved, { keepOrder = false } = {}) {
  const meals = Array.isArray(list) ? list : [];
  if (!saved) return meals;
  const idx = meals.findIndex((m) => customMealsMatch(m, saved));
  if (keepOrder && idx >= 0) {
    const next = meals.slice();
    next[idx] = { ...meals[idx], ...saved, id: saved.id || meals[idx].id };
    return next;
  }
  return [saved, ...meals.filter((m) => !customMealsMatch(m, saved))];
}

/** Slot persist payload — id required so Save all cannot name-upsert the wrong row. */
export function slotOnlySavePayload(meal, slot) {
  const id = customMealId(meal);
  if (!id || !slot) return null;
  return { id, slot };
}

/**
 * Write one meal's draft slot. Never touches other keys — no index, no shared row state.
 * @returns {Record<string, string>}
 */
export function applySlotDraft(pending, key, nextSlot, savedSlot) {
  if (!key || !nextSlot) return pending && typeof pending === "object" ? pending : {};
  const prev = pending && typeof pending === "object" ? pending : {};
  if (nextSlot === savedSlot) {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  }
  if (prev[key] === nextSlot) return prev;
  return { ...prev, [key]: nextSlot };
}
