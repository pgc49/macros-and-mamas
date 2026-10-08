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
  if (s === "treat" || s === "treats") return "snack";
  return null;
}

/**
 * Soft time-of-day guess for a new log row (device local hours).
 * before 10:30 breakfast · 10:30–14:00 lunch · 14:00–17:00 snack · after dinner
 *
 * The coach door does not use this. Agent Chromium can report
 * America/Los_Angeles from Intl while `getHours()` is still UTC morning.
 */
export function guessSlotFromTime(date = new Date()) {
  return slotFromClockMinutes(date.getHours() * 60 + date.getMinutes());
}

/** Callie's meal door. Sticky QA and the program clock are Pacific. */
export const COACH_CLOCK_TZ = "America/Los_Angeles";

function slotFromClockMinutes(mins) {
  // A 3am grab is a snack, not breakfast.
  if (mins < 5 * 60) return "snack";
  if (mins < 10 * 60 + 30) return "breakfast";
  if (mins < 14 * 60) return "lunch";
  if (mins < 17 * 60) return "snack";
  return "dinner";
}

/** Wall-clock fields of `instant` in `timeZone`. Hour 24 (some engines at midnight) is 0. */
export function wallClockParts(instant, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
  };
}

/**
 * Which meal the coach is standing in front of.
 *
 * Always Pacific wall time, from `wallClockParts`, never `Date#getHours`.
 * `41d358a` rewrote the Date only when Intl said UTC, then read local hours.
 * On the sticky retest Intl already said America/Los_Angeles, so the rewrite
 * did not run, and the browser's local hour was still breakfast at 9:07pm PDT.
 */
export function coachSlotFromTime(instant = new Date(), timeZone = COACH_CLOCK_TZ) {
  const { hour, minute } = wallClockParts(instant, timeZone);
  return slotFromClockMinutes(hour * 60 + minute);
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
