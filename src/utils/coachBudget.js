/**
 * What's actually available for the meal the coach is being asked about.
 *
 * Not "what's left today" — that would spend dinner's room on lunch. This
 * holds back a share for every later unlogged slot, lets a pencilled-in meal
 * take its real macros instead of a share, and splits the shortfall when the
 * held-back shares no longer fit inside what's left.
 *
 * Ported from the Help me decide engine (PR 332); presentation lives in
 * coachLines.js so this file stays pure math.
 */

import { REMAINING_OVER_SLACK, mealMacros } from "./eatingOutImpact.js";
import { MEAL_SLOTS, guessSlotFromTime, normalizeSlot } from "./mealSlots.js";
import { namesMatch } from "./coachPrefs.js";
import { scaledMealMacros } from "./weekPlan.js";

/** Plan-meal `via` for anything the coach pencilled in. */
export const COACH_VIA = "coach";

export const DEFAULT_MEAL_SHARES = {
  breakfast: 0.24,
  lunch: 0.30,
  dinner: 0.38,
  snack: 0.08,
};

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"];
const SLOT_ORDER = [...MAIN_SLOTS, "snack"];

export function loggedSlotsFromEntries(entries) {
  const set = new Set();
  for (const e of entries || []) {
    const slot = normalizeSlot(e?.slot);
    if (slot) set.add(slot);
  }
  return set;
}

export function laterSlotsAfter(selected, loggedSlots = new Set()) {
  // A snack is squeezed between meals, so every main she hasn't eaten yet is
  // still to come. Placing it after lunch meant a 3pm snack was handed lunch's
  // room on a day she hadn't eaten lunch, and 57g of protein came back as a
  // snack suggestion.
  if (selected === "snack") return MAIN_SLOTS.filter((s) => !loggedSlots.has(s));
  const idx = MAIN_SLOTS.indexOf(selected);
  if (idx < 0) return MAIN_SLOTS.filter((s) => !loggedSlots.has(s));
  return MAIN_SLOTS.filter((s, i) => i > idx && !loggedSlots.has(s));
}

export function defaultCoachSlot({ now = new Date(), loggedSlots = new Set(), ignoreTime = false } = {}) {
  if (ignoreTime) {
    for (const s of SLOT_ORDER) {
      if (!loggedSlots.has(s)) return s;
    }
    return null;
  }
  const guess = guessSlotFromTime(now);
  if (guess === "snack") return "snack";
  const start = MAIN_SLOTS.indexOf(guess);
  for (let i = Math.max(0, start); i < MAIN_SLOTS.length; i += 1) {
    if (!loggedSlots.has(MAIN_SLOTS[i])) return MAIN_SLOTS[i];
  }
  for (const s of MAIN_SLOTS) {
    if (!loggedSlots.has(s)) return s;
  }
  if (!loggedSlots.has("snack")) return "snack";
  return guess;
}

/** Coach pencils only. A week-plan lunch does not skip lunch after breakfast. */
export function pencilledSlotsFromPlan(plannedMeals) {
  const set = new Set();
  for (const m of plannedMeals || []) {
    if (m?.via !== COACH_VIA) continue;
    const slot = normalizeSlot(m?.slot);
    if (slot) set.add(slot);
  }
  return set;
}

export function coachTakenSlots({ entries = [], plannedMeals = [], extraSlots = [] } = {}) {
  const set = loggedSlotsFromEntries(entries);
  for (const slot of pencilledSlotsFromPlan(plannedMeals)) set.add(slot);
  for (const raw of extraSlots) {
    const slot = normalizeSlot(raw);
    if (slot) set.add(slot);
  }
  return set;
}

/**
 * Next slot after a log or pencil. Pencilled slots count as done, so she is
 * never handed back the slot she just answered.
 */
export function nextCoachSlot({
  now = new Date(),
  entries = [],
  plannedMeals = [],
  extraTaken = [],
} = {}) {
  const taken = coachTakenSlots({ entries, plannedMeals, extraSlots: extraTaken });
  const next = defaultCoachSlot({ now, loggedSlots: taken, ignoreTime: true });
  if (!next || taken.has(next)) return null;
  return next;
}

function median(values) {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Slot calorie shares from the last 28 days of slotted logs. Derived, never stored. */
export function deriveMealShares(mealHistoryByDate) {
  const days = [];
  for (const entries of Object.values(mealHistoryByDate || {})) {
    const slotted = (entries || []).filter((e) => normalizeSlot(e?.slot));
    const dayCal = slotted.reduce((sum, e) => sum + (Number(e.cal) || 0), 0);
    if (dayCal <= 0) continue;
    const share = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    for (const e of slotted) {
      share[normalizeSlot(e.slot)] += (Number(e.cal) || 0) / dayCal;
    }
    days.push(share);
  }
  if (days.length < 5) return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  const raw = {};
  let sum = 0;
  for (const slot of MEAL_SLOTS) {
    raw[slot] = median(days.map((d) => d[slot] || 0));
    sum += raw[slot];
  }
  if (sum <= 0) return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  return {
    ...Object.fromEntries(MEAL_SLOTS.map((s) => [s, raw[s] / sum])),
    fromHistory: true,
  };
}

/** Later unlogged slots cannot collapse below the default share. */
export function effectiveSlotShare(slot, shares = DEFAULT_MEAL_SHARES) {
  const floor = DEFAULT_MEAL_SHARES[slot] ?? 0;
  const derived = Number(shares?.[slot]);
  const share = Number.isFinite(derived) ? Math.max(derived, floor) : floor;
  const usual = Boolean(shares?.fromHistory && Number.isFinite(derived) && derived + 1e-9 >= floor);
  return { share, usual };
}

/**
 * History that zeros lunch or dinner is not "usual" — fall back to the default
 * split. Stronger-than-default later shares stay, so pencils still win later.
 */
export function resolveCoachShares(shares = DEFAULT_MEAL_SHARES, laterMains = []) {
  if (!shares?.fromHistory) return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  const collapsed = laterMains.some((s) => {
    const derived = Number(shares[s]);
    const floor = DEFAULT_MEAL_SHARES[s] ?? 0;
    return !Number.isFinite(derived) || derived + 1e-9 < floor;
  });
  if (collapsed) return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  return shares;
}

function clampSnackCount(n) {
  const count = Math.round(Number(n));
  if (!Number.isFinite(count)) return 1;
  return Math.max(0, Math.min(4, count));
}

function slotShareWeight(slot, shares, snackCount = 1) {
  const base = effectiveSlotShare(slot, shares).share;
  if (slot !== "snack") return base;
  return base * clampSnackCount(snackCount);
}

function reserveSlotsAfter(selected, loggedSlots = new Set(), snackCount = 1) {
  const later = laterSlotsAfter(selected, loggedSlots);
  if (selected === "snack") return later;
  if (clampSnackCount(snackCount) <= 0) return later;
  // A snack she has already eaten is not a snack to save room for. Reserving
  // for it anyway charged this meal twice for the same food.
  if (loggedSlots.has("snack")) return later;
  return [...later, "snack"];
}

/**
 * Day-level room. `p` is how much protein is still needed to reach the low end
 * of her range; `pHigh` is how much is left before the high end. Protein is a
 * floor she is trying to reach, so `p` is a goal and `pHigh` is only ever a note.
 */
export function remainingForCoach(totals, bands) {
  if (!bands) return null;
  const t = totals || { cal: 0, p: 0, c: 0, f: 0 };
  return {
    cal: bands.calHi - (t.cal || 0),
    p: bands.pLo - (t.p || 0),
    pHigh: bands.pHi - (t.p || 0),
    c: bands.cHi - (t.c || 0),
    f: bands.fHi - (t.f || 0),
  };
}

export function planMealForSlot(plannedMeals, slot) {
  const list = (plannedMeals || []).filter((m) => normalizeSlot(m?.slot) === slot);
  if (!list.length) return null;
  return list.find((m) => m.via === COACH_VIA) || list[0];
}

function shareReserve(slot, shares, bands, snackCount = 1) {
  const { usual } = effectiveSlotShare(slot, shares);
  const share = slotShareWeight(slot, shares, snackCount);
  return {
    cal: share * bands.calHi,
    p: share * bands.pLo,
    pHigh: share * bands.pHi,
    c: share * bands.cHi,
    f: share * bands.fHi,
    source: usual ? "usual" : "default",
    meal: null,
    slot,
  };
}

function mealReserve(meal, slot) {
  const m = meal.qty != null ? scaledMealMacros(meal) : mealMacros(meal);
  return {
    cal: m.cal,
    p: m.p,
    pHigh: m.p,
    c: m.c,
    f: m.f,
    source: meal.via === COACH_VIA ? "coach" : "plan",
    meal,
    slot,
  };
}

function emptyMacros() {
  return { cal: 0, p: 0, pHigh: 0, c: 0, f: 0 };
}

function addMacros(a, b) {
  return {
    cal: a.cal + b.cal,
    p: a.p + b.p,
    pHigh: a.pHigh + b.pHigh,
    c: a.c + b.c,
    f: a.f + b.f,
  };
}

function scalePiece(piece, factor) {
  return {
    ...piece,
    cal: piece.cal * factor,
    p: piece.p * factor,
    pHigh: piece.pHigh * factor,
    c: piece.c * factor,
    f: piece.f * factor,
  };
}

function zeroPiece(piece) {
  return scalePiece(piece, 0);
}

function leftoverFrom(remaining, reserve) {
  return {
    cal: Math.max(0, remaining.cal - reserve.cal),
    pNeed: Math.max(0, remaining.p - reserve.p),
    pHigh: Math.max(0, remaining.pHigh - reserve.pHigh),
    c: Math.max(0, remaining.c - reserve.c),
    f: Math.max(0, remaining.f - reserve.f),
  };
}

function restAfter(remaining, used) {
  return {
    cal: Math.max(0, remaining.cal - used.cal),
    p: Math.max(0, remaining.p - used.p),
    pHigh: Math.max(0, remaining.pHigh - used.pHigh),
    c: Math.max(0, remaining.c - used.c),
    f: Math.max(0, remaining.f - used.f),
  };
}

function sliceRemaining(remaining, fraction) {
  return {
    cal: remaining.cal * fraction,
    p: remaining.p * fraction,
    pHigh: remaining.pHigh * fraction,
    c: remaining.c * fraction,
    f: remaining.f * fraction,
  };
}

function packReserve(bySlot) {
  let totals = emptyMacros();
  for (const piece of Object.values(bySlot)) totals = addMacros(totals, piece);
  return { ...totals, bySlot };
}

const CAPPED_MACROS = ["cal", "p", "pHigh", "c", "f"];

/**
 * A reserve may not claim more of a macro than the later slots' fair share of
 * what is actually left.
 *
 * Shares are taken against the day's targets, which is what stops breakfast
 * spending dinner's room. But the targets don't know what she has already
 * eaten, so a macro she went heavy on earlier — 11g of fat in one chocolate,
 * say — was subtracted from what's left and then reserved for again at full
 * strength, and the next meal absorbed the entire overspend on its own. Her
 * breakfast came back with 8g of fat to work with and nothing in the bank fit.
 *
 * Capping at the proportional share shares that shortfall across the meals
 * that are still to come. On a day where she is tracking her targets the raw
 * reserve is already under the cap and nothing here changes.
 */
function capReserveToRemaining(reserve, remaining, { currentWeight, weightFor }) {
  if (!remaining) return reserve;
  const entries = Object.entries(reserve.bySlot);
  // A meal she has pencilled in costs what it costs; only shares give way.
  const shared = entries.filter(([, piece]) => !piece.meal);
  const planned = entries.filter(([, piece]) => piece.meal);
  if (!shared.length) return reserve;

  const laterWeight = shared.reduce((n, [slot]) => n + weightFor(slot), 0);
  const total = currentWeight + laterWeight;
  if (!(total > 0)) return reserve;
  const laterFraction = laterWeight / total;

  const factors = {};
  let capped = false;
  for (const key of CAPPED_MACROS) {
    const claimed = shared.reduce((n, [, piece]) => n + piece[key], 0);
    const spokenFor = planned.reduce((n, [, piece]) => n + piece[key], 0);
    const allowed = Math.max(0, (remaining[key] ?? 0) - spokenFor) * laterFraction;
    if (!(claimed > allowed)) continue;
    factors[key] = claimed > 0 ? allowed / claimed : 0;
    capped = true;
  }
  if (!capped) return reserve;

  const bySlot = Object.fromEntries(entries.map(([slot, piece]) => {
    if (piece.meal) return [slot, piece];
    const next = { ...piece };
    for (const [key, factor] of Object.entries(factors)) next[key] = piece[key] * factor;
    return [slot, next];
  }));
  return packReserve(bySlot);
}

export function reserveForLater({ laterSlots = [], shares, bands, plannedMeals, snackCount = 1 } = {}) {
  if (!bands) return { ...emptyMacros(), bySlot: {} };
  const bySlot = {};
  for (const slot of laterSlots) {
    const planned = planMealForSlot(plannedMeals, slot);
    bySlot[slot] = planned ? mealReserve(planned, slot) : shareReserve(slot, shares, bands, snackCount);
  }
  return packReserve(bySlot);
}

export function laterSlotAsBudget(slot, shares, bands) {
  const piece = shareReserve(slot, shares, bands);
  return {
    cal: Math.max(0, piece.cal),
    pNeed: Math.max(0, piece.p),
    pHigh: Math.max(0, piece.pHigh),
    c: Math.max(0, piece.c),
    f: Math.max(0, piece.f),
  };
}

/**
 * The budget as a `remaining`-shaped object for `mealFitsRemaining`.
 *
 * Protein is deliberately unbounded. Callie's rule is that protein is the win
 * and the range high is a target, not a wall; calories, carbs and fat are the
 * real ceilings and they already bound how much protein a meal can carry. A
 * meal that is high protein and still inside cal/carb/fat is exactly the meal
 * she should be shown, so it must not be filtered out for being "too much
 * protein". `pHigh` survives on the budget for the copy layer to mention.
 */
export function budgetAsRemaining(budget) {
  if (!budget) return undefined;
  return {
    cal: budget.cal,
    p: Number.POSITIVE_INFINITY,
    c: budget.c,
    f: budget.f,
  };
}

export function computeSlotBudget({
  totals,
  bands,
  slot,
  plannedMeals = [],
  shares = DEFAULT_MEAL_SHARES,
  loggedSlots,
  snackCount = 1,
} = {}) {
  if (!bands || !slot) return null;
  const remaining = remainingForCoach(totals, bands);
  if (!remaining) return null;
  const logged = loggedSlots || loggedSlotsFromEntries([]);
  const snacks = clampSnackCount(snackCount);
  const later = laterSlotsAfter(slot, logged);
  const resolvedShares = resolveCoachShares(shares, later);
  const reserveSlots = reserveSlotsAfter(slot, logged, snacks);
  const rawReserve = capReserveToRemaining(
    reserveForLater({
      laterSlots: reserveSlots,
      shares: resolvedShares,
      bands,
      plannedMeals,
      snackCount: snacks,
    }),
    remaining,
    {
      currentWeight: slotShareWeight(slot, resolvedShares, snacks),
      weightFor: (s) => slotShareWeight(s, resolvedShares, snacks),
    },
  );

  if (remaining.cal <= 0) {
    const reserve = packReserve(
      Object.fromEntries(Object.entries(rawReserve.bySlot).map(([s, piece]) => [s, zeroPiece(piece)])),
    );
    return { slot, laterSlots: later, remaining, reserve, snackCount: snacks, ...leftoverFrom(remaining, reserve) };
  }

  if (remaining.cal - rawReserve.cal >= 0) {
    return {
      slot,
      laterSlots: later,
      remaining,
      reserve: rawReserve,
      snackCount: snacks,
      ...leftoverFrom(remaining, rawReserve),
    };
  }

  // Extra snacks on top of a reserve that already fit: this meal goes to 0 and
  // the later pieces scale into what's left. Re-splitting the day here made
  // "+1 snack" increase the leftover, which is nonsense.
  if (snacks > 1) {
    const atOne = reserveForLater({
      laterSlots: reserveSlotsAfter(slot, logged, 1),
      shares: resolvedShares,
      bands,
      plannedMeals,
      snackCount: 1,
    });
    if (remaining.cal - atOne.cal >= 0 && rawReserve.cal > 0) {
      const factor = remaining.cal / rawReserve.cal;
      const bySlot = Object.fromEntries(
        Object.entries(rawReserve.bySlot).map(([s, piece]) => [s, scalePiece(piece, factor)]),
      );
      const reserve = packReserve(bySlot);
      return { slot, laterSlots: later, remaining, reserve, snackCount: snacks, ...leftoverFrom(remaining, reserve) };
    }
  }

  // Full-day later shares do not fit what's left. Split the leftover across
  // this slot and the later unlogged slots so the cards add up and breakfast
  // is not wiped to zero. Pencilled later meals still take theirs first.
  const bySlot = {};
  let used = emptyMacros();
  for (const s of reserveSlots) {
    const raw = rawReserve.bySlot[s];
    if (!raw?.meal) continue;
    const room = Math.max(0, remaining.cal - used.cal);
    const factor = raw.cal > 0 ? Math.min(1, room / raw.cal) : 0;
    bySlot[s] = scalePiece(raw, factor);
    used = addMacros(used, bySlot[s]);
  }

  const rest = restAfter(remaining, used);
  const shareSlots = reserveSlots.filter((s) => !rawReserve.bySlot[s]?.meal);
  const currentShare = slotShareWeight(slot, resolvedShares, snacks);
  const totalW = shareSlots.reduce((n, s) => n + slotShareWeight(s, resolvedShares, snacks), currentShare);
  const denom = totalW > 0 ? totalW : 1;

  for (const s of shareSlots) {
    const frac = slotShareWeight(s, resolvedShares, snacks) / denom;
    const slice = sliceRemaining(rest, frac);
    bySlot[s] = { ...rawReserve.bySlot[s], ...slice };
    used = addMacros(used, slice);
  }

  const leftover = sliceRemaining(rest, currentShare / denom);
  return {
    slot,
    laterSlots: later,
    remaining,
    reserve: packReserve(bySlot),
    snackCount: snacks,
    cal: leftover.cal,
    pNeed: leftover.p,
    pHigh: leftover.pHigh,
    c: leftover.c,
    f: leftover.f,
  };
}

/** Past the day's ceilings. Being over on protein alone is never "over". */
export function isOverDay(remaining) {
  if (!remaining) return false;
  return remaining.cal <= 0 || remaining.f < -REMAINING_OVER_SLACK.f;
}

export function attachDayHighs(budget, bands) {
  if (!budget || !bands) return budget;
  return {
    ...budget,
    dayHighs: { cal: bands.calHi, c: bands.cHi, f: bands.fHi, p: bands.pHi },
  };
}

/** Coach pencils with no matching log yet — the reconciliation queue. */
export function unmatchedCoachPencils(plannedMeals, entries) {
  return (plannedMeals || []).filter((m) => {
    if (m.via !== COACH_VIA) return false;
    const slot = normalizeSlot(m.slot);
    return !(entries || []).some(
      (e) => normalizeSlot(e.slot) === slot && namesMatch(e.name, m.name),
    );
  });
}

export function coachPencilForSlot(plannedMeals, slot) {
  return (plannedMeals || []).find(
    (m) => m.via === COACH_VIA && normalizeSlot(m.slot) === slot,
  ) || null;
}
