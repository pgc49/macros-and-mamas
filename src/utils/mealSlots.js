/**
 * Soft meal-log categories for Today's log.
 * Optional on every entry — auto-filled when known, guessed by time otherwise.
 */

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABEL = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
  other: "Uncategorized",
};

/** Short labels for chips */
export const SLOT_CHIP = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * Normalize recipe.cat / plan slot / pantry → meal_logs.slot value.
 * Returns null if unknown (caller may guess).
 */
export function normalizeSlot(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (MEAL_SLOTS.includes(s)) return s;
  if (s === "snacks") return "snack";
  if (s === "pantry") return "snack";
  return null;
}

/**
 * Soft time-of-day guess (local clock).
 * before 10:30 breakfast · 10:30–14:00 lunch · 14:00–17:00 snack · after dinner
 */
export function guessSlotFromTime(date = new Date()) {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins < 10 * 60 + 30) return "breakfast";
  if (mins < 14 * 60) return "lunch";
  if (mins < 17 * 60) return "snack";
  return "dinner";
}

/** Slot for a new log: prefer explicit, else guess. */
export function resolveLogSlot(raw, { when = new Date() } = {}) {
  return normalizeSlot(raw) || guessSlotFromTime(when);
}

/**
 * Group entries for display. Order: breakfast → lunch → dinner → snack → other.
 * Null slots on today use a time guess; older nulls go to "other".
 */
export function groupEntriesBySlot(entries, { logDate, todayIso } = {}) {
  const buckets = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
    other: [],
  };
  const isToday = logDate && todayIso && logDate === todayIso;
  for (const e of entries || []) {
    const normalized = normalizeSlot(e.slot);
    if (normalized) {
      buckets[normalized].push(e);
    } else if (isToday) {
      buckets[guessSlotFromTime()].push(e);
    } else {
      buckets.other.push(e);
    }
  }
  return buckets;
}

export const SLOT_SECTION_ORDER = ["breakfast", "lunch", "dinner", "snack", "other"];
