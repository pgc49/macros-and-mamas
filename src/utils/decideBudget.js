import { DECIDE_COPY, DECIDE_SLOT_LABEL, DECIDE_SLOT_PHRASE } from "../content/decideVoice.js";
import { REMAINING_OVER_SLACK, mealMacros } from "./eatingOutImpact.js";
import { MEAL_SLOTS, guessSlotFromTime, normalizeSlot } from "./mealSlots.js";
import { namesMatch, stripPortionSuffix } from "./decidePrefs.js";
import { scaledMealMacros, targetBands } from "./weekPlan.js";

export const DEFAULT_MEAL_SHARES = {
  breakfast: 0.24,
  lunch: 0.30,
  dinner: 0.38,
  snack: 0.08,
};

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"];

export function stripDecideName(name) {
  return stripPortionSuffix(name);
}

export function loggedSlotsFromEntries(entries) {
  const set = new Set();
  for (const e of entries || []) {
    const slot = normalizeSlot(e?.slot);
    if (slot) set.add(slot);
  }
  return set;
}

export function laterSlotsAfter(selected, loggedSlots = new Set()) {
  if (selected === "snack") {
    return MAIN_SLOTS.filter((s) => MAIN_SLOTS.indexOf(s) > MAIN_SLOTS.indexOf("lunch") && !loggedSlots.has(s));
  }
  const idx = MAIN_SLOTS.indexOf(selected);
  if (idx < 0) return MAIN_SLOTS.filter((s) => !loggedSlots.has(s));
  return MAIN_SLOTS.filter((s, i) => i > idx && !loggedSlots.has(s));
}

export function defaultDecideSlot({ now = new Date(), loggedSlots = new Set() } = {}) {
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

function median(values) {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Slot calorie shares from the last 28 days of slotted logs. Not stored. */
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
  const usual = Boolean(
    shares?.fromHistory
    && Number.isFinite(derived)
    && derived + 1e-9 >= floor,
  );
  return { share, usual };
}

/**
 * History that zeros lunch/dinner is not "usual" — use the default split.
 * Stronger-than-default later shares stay (pencils still win later).
 */
export function resolveDecideShares(shares = DEFAULT_MEAL_SHARES, laterMains = []) {
  if (!shares?.fromHistory) {
    return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  }
  const collapsed = laterMains.some((s) => {
    const derived = Number(shares[s]);
    const floor = DEFAULT_MEAL_SHARES[s] ?? 0;
    return !Number.isFinite(derived) || derived + 1e-9 < floor;
  });
  if (collapsed) return { ...DEFAULT_MEAL_SHARES, fromHistory: false };
  return shares;
}

function reserveSlotsAfter(selected, loggedSlots = new Set()) {
  const later = laterSlotsAfter(selected, loggedSlots);
  if ((selected === "breakfast" || selected === "lunch") && !loggedSlots.has("snack")) {
    return [...later, "snack"];
  }
  return later;
}

export function remainingForDecide(totals, bands) {
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
  return list.find((m) => m.via === "decide") || list[0];
}

function shareReserve(slot, shares, bands) {
  const { share, usual } = effectiveSlotShare(slot, shares);
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
    source: meal.via === "decide" ? "decide" : "plan",
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
  for (const piece of Object.values(bySlot)) {
    totals = addMacros(totals, piece);
  }
  return { ...totals, bySlot };
}

export function reserveForLater({ laterSlots = [], shares, bands, plannedMeals } = {}) {
  if (!bands) return { ...emptyMacros(), bySlot: {} };
  const bySlot = {};
  for (const slot of laterSlots) {
    const planned = planMealForSlot(plannedMeals, slot);
    bySlot[slot] = planned ? mealReserve(planned, slot) : shareReserve(slot, shares, bands);
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

export function budgetAsRemaining(budget) {
  if (!budget) return undefined;
  return {
    cal: budget.cal,
    p: budget.pHigh,
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
} = {}) {
  if (!bands || !slot) return null;
  const remaining = remainingForDecide(totals, bands);
  if (!remaining) return null;
  const logged = loggedSlots || loggedSlotsFromEntries([]);
  const later = laterSlotsAfter(slot, logged);
  const resolvedShares = resolveDecideShares(shares, later);
  const reserveSlots = reserveSlotsAfter(slot, logged);
  const rawReserve = reserveForLater({
    laterSlots: reserveSlots,
    shares: resolvedShares,
    bands,
    plannedMeals,
  });

  if (remaining.cal <= 0) {
    const reserve = packReserve(
      Object.fromEntries(Object.entries(rawReserve.bySlot).map(([s, piece]) => [s, zeroPiece(piece)])),
    );
    return { slot, laterSlots: later, remaining, reserve, ...leftoverFrom(remaining, reserve) };
  }

  if (remaining.cal - rawReserve.cal >= 0) {
    return { slot, laterSlots: later, remaining, reserve: rawReserve, ...leftoverFrom(remaining, rawReserve) };
  }

  // Raw later shares (full-day) do not fit what's left. Split the leftover
  // day across this slot and later unlogged slots so the cards add up and
  // breakfast is not wiped to 0. Pencilled later meals still take first.
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
  const currentShare = effectiveSlotShare(slot, resolvedShares).share;
  const totalW = shareSlots.reduce((n, s) => n + effectiveSlotShare(s, resolvedShares).share, currentShare);
  const denom = totalW > 0 ? totalW : 1;

  for (const s of shareSlots) {
    const frac = effectiveSlotShare(s, resolvedShares).share / denom;
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
    cal: leftover.cal,
    pNeed: leftover.p,
    pHigh: leftover.pHigh,
    c: leftover.c,
    f: leftover.f,
  };
}

export function isOverDay(remaining) {
  if (!remaining) return false;
  return remaining.cal <= 0 || remaining.f < -REMAINING_OVER_SLACK.f;
}

function round5(n) {
  return Math.max(0, Math.round(n / 5) * 5);
}

function round25(n) {
  return Math.max(0, Math.round(n / 25) * 25);
}

export function coachRead({ budget, remaining, slot, over } = {}) {
  const phrase = DECIDE_SLOT_PHRASE[slot] || "";
  if (over) {
    return { over: true, line1: DECIDE_COPY.over, line2: "" };
  }
  const pNeed = budget?.pNeed ?? 0;
  let line1;
  if (pNeed >= 15) {
    line1 = `${DECIDE_COPY.proteinNeed} ${round5(pNeed)} g ${DECIDE_COPY.proteinNeedTail} ${phrase}.`;
  } else if (pNeed > 0) {
    line1 = `${DECIDE_COPY.proteinShy} ${Math.round(pNeed)}g ${DECIDE_COPY.proteinShyTail} ${phrase}. ${DECIDE_COPY.easyClose}`;
  } else {
    line1 = `${DECIDE_COPY.proteinCovered} ${phrase}.`;
  }

  const rem = remaining || budget?.remaining;
  const dayHighs = budget?.dayHighs;
  let line2 = DECIDE_COPY.plenty;
  if (rem && dayHighs) {
    const ratios = {
      cal: rem.cal / Math.max(1, dayHighs.cal),
      c: rem.c / Math.max(1, dayHighs.c),
      f: rem.f / Math.max(1, dayHighs.f),
    };
    const binding = ["f", "c", "cal"].reduce((best, k) => (ratios[k] < ratios[best] ? k : best), "cal");
    if (binding === "f" && ratios.f < 0.35) line2 = DECIDE_COPY.fatSpent;
    else if (binding === "c" && ratios.c < 0.35) line2 = DECIDE_COPY.carbsClose;
    else if (ratios.cal < 0.3) {
      line2 = `${DECIDE_COPY.calTightLead} ${round25(budget.cal)} ${DECIDE_COPY.calTightTail}`;
    }
  }
  return { over: false, line1, line2 };
}

export function attachCoachContext(budget, bands) {
  if (!budget || !bands) return budget;
  return {
    ...budget,
    dayHighs: { cal: bands.calHi, c: bands.cHi, f: bands.fHi, p: bands.pHi },
  };
}

function fmtCal(n) {
  return String(Math.round(n));
}

function fmtP(n) {
  return `${Math.round(n)}g protein`;
}

export function budgetSentence(budget) {
  if (!budget) return "";
  const later = budget.laterSlots || [];
  if (!later.length) {
    return `${DECIDE_COPY.lastMealLead} ${DECIDE_COPY.lastMealRest}: about ${fmtCal(budget.cal)} cal, ${fmtP(budget.pNeed)} to hit range.`;
  }
  const first = later[0];
  const piece = budget.reserve?.bySlot?.[first];
  const leaves = `${DECIDE_COPY.thatLeaves} ${fmtCal(budget.cal)} cal and ${fmtP(budget.pNeed)} for ${DECIDE_SLOT_LABEL[budget.slot] || budget.slot}.`;
  if (piece?.meal) {
    const name = piece.meal.name || "Dinner";
    return `${DECIDE_SLOT_LABEL[first] || first} ${DECIDE_COPY.pencilledIn} (${name}, ${fmtCal(piece.cal)} cal, ${fmtP(piece.p)}). ${leaves}`;
  }
  const laterLabel = later.length === 1
    ? (DECIDE_SLOT_LABEL[first] || first)
    : later.map((s) => DECIDE_SLOT_LABEL[s] || s).join(" and ");
  const laterSharePieces = later
    .map((s) => budget.reserve?.bySlot?.[s])
    .filter((p) => p && !p.meal);
  const usedUsual = laterSharePieces.length > 0
    && laterSharePieces.every((p) => p.source === "usual");
  const how = usedUsual ? DECIDE_COPY.usualEat : DECIDE_COPY.normalShare;
  const aboutCal = budget.reserve?.cal ?? piece?.cal ?? 0;
  const aboutP = budget.reserve?.p ?? piece?.p ?? 0;
  return `${DECIDE_COPY.savingRoom} ${laterLabel} ${how} (about ${fmtCal(aboutCal)} cal, ${fmtP(aboutP)}). ${leaves}`;
}

export function decideBarHint({
  loggedSlots = new Set(),
  plannedMeals = [],
  coach,
} = {}) {
  const dinnerLogged = loggedSlots.has("dinner");
  const lunchLogged = loggedSlots.has("lunch");
  const dinnerPencil = planMealForSlot(plannedMeals, "dinner");
  if (lunchLogged && !dinnerLogged && !dinnerPencil) {
    return DECIDE_COPY.barDinnerAsk;
  }
  return coach?.line1 || DECIDE_COPY.plenty;
}

export function canOpenDecide({ macros, remaining, isToday, budget } = {}) {
  return Boolean(isToday && macros && remaining && budget);
}

export function unmatchedDecidePencils(plannedMeals, entries) {
  return (plannedMeals || []).filter((m) => {
    if (m.via !== "decide") return false;
    const slot = normalizeSlot(m.slot);
    return !(entries || []).some(
      (e) => normalizeSlot(e.slot) === slot && namesMatch(e.name, m.name),
    );
  });
}

export function decidePencilForSlot(plannedMeals, slot) {
  return (plannedMeals || []).find(
    (m) => m.via === "decide" && normalizeSlot(m.slot) === slot,
  ) || null;
}

export function bandsFromMacros(macros) {
  return targetBands(macros);
}
