import { capitalizeDecideLine, DECIDE_COPY, DECIDE_SLOT_LABEL, DECIDE_SLOT_PHRASE, snackReserveCopy } from "../content/decideVoice.js";
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

const DECIDE_SLOT_ORDER = [...MAIN_SLOTS, "snack"];

export function defaultDecideSlot({ now = new Date(), loggedSlots = new Set(), ignoreTime = false } = {}) {
  if (ignoreTime) {
    for (const s of DECIDE_SLOT_ORDER) {
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

/** Decide pencils only. A week-plan lunch does not skip lunch after breakfast. */
export function pencilledSlotsFromPlan(plannedMeals) {
  const set = new Set();
  for (const m of plannedMeals || []) {
    if (m?.via !== "decide") continue;
    const slot = normalizeSlot(m?.slot);
    if (slot) set.add(slot);
  }
  return set;
}

export function decideTakenSlots({ entries = [], plannedMeals = [], extraSlots = [] } = {}) {
  const set = loggedSlotsFromEntries(entries);
  for (const slot of pencilledSlotsFromPlan(plannedMeals)) set.add(slot);
  for (const raw of extraSlots) {
    const slot = normalizeSlot(raw);
    if (slot) set.add(slot);
  }
  return set;
}

/**
 * Next slot after a log or pencil. Pencilled slots count as done.
 * Never returns the slot she just pencilled / logged when another is open.
 */
export function nextDecideSlot({
  now = new Date(),
  entries = [],
  plannedMeals = [],
  extraTaken = [],
} = {}) {
  const taken = decideTakenSlots({ entries, plannedMeals, extraSlots: extraTaken });
  const next = defaultDecideSlot({ now, loggedSlots: taken, ignoreTime: true });
  if (!next || taken.has(next)) return null;
  return next;
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
  return [...later, "snack"];
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
  snackCount = 1,
} = {}) {
  if (!bands || !slot) return null;
  const remaining = remainingForDecide(totals, bands);
  if (!remaining) return null;
  const logged = loggedSlots || loggedSlotsFromEntries([]);
  const snacks = clampSnackCount(snackCount);
  const later = laterSlotsAfter(slot, logged);
  const resolvedShares = resolveDecideShares(shares, later);
  const reserveSlots = reserveSlotsAfter(slot, logged, snacks);
  const rawReserve = reserveForLater({
    laterSlots: reserveSlots,
    shares: resolvedShares,
    bands,
    plannedMeals,
    snackCount: snacks,
  });

  if (remaining.cal <= 0) {
    const reserve = packReserve(
      Object.fromEntries(Object.entries(rawReserve.bySlot).map(([s, piece]) => [s, zeroPiece(piece)])),
    );
    return { slot, laterSlots: later, remaining, reserve, snackCount: snacks, ...leftoverFrom(remaining, reserve) };
  }

  if (remaining.cal - rawReserve.cal >= 0) {
    return { slot, laterSlots: later, remaining, reserve: rawReserve, snackCount: snacks, ...leftoverFrom(remaining, rawReserve) };
  }

  // Extra snacks the user added on top of a reserve that already fit:
  // this meal goes to 0 and later pieces scale into what's left. Do not
  // re-split the day (that made +snack increase leftover).
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

function joinReserveNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function macrosShort(p, c, f) {
  return `P ${Math.round(p || 0)}g · C ${Math.round(c || 0)}g · F ${Math.round(f || 0)}g`;
}

/** Concise leftover for this slot + held-later pieces. Numbers match the budget. */
export function slotLeftRead(budget) {
  if (!budget) return { title: "", cal: 0, macros: "", held: "", heldPieces: [] };
  const slot = DECIDE_SLOT_LABEL[budget.slot] || budget.slot;
  const heldPieces = [];
  for (const s of budget.laterSlots || []) {
    const piece = budget.reserve?.bySlot?.[s];
    if (!piece || !(piece.cal > 0)) continue;
    heldPieces.push({
      slot: s,
      cal: piece.cal,
      p: piece.p,
      c: piece.c,
      f: piece.f,
      meal: piece.meal || null,
    });
  }
  const snack = budget.reserve?.bySlot?.snack;
  if (snack && snack.cal > 0) {
    heldPieces.push({
      slot: "snack",
      cal: snack.cal,
      p: snack.p,
      c: snack.c,
      f: snack.f,
      meal: snack.meal || null,
    });
  }
  const heldBits = heldPieces.map((h) => {
    const label = DECIDE_SLOT_LABEL[h.slot] || h.slot;
    if (h.meal?.name) return `${fmtCal(h.cal)} cal ${label} (${h.meal.name})`;
    return `${fmtCal(h.cal)} cal ${label}`;
  });
  return {
    title: `${DECIDE_COPY.leftFor} ${slot}`,
    cal: budget.cal,
    p: budget.pNeed,
    c: budget.c,
    f: budget.f,
    macros: macrosShort(budget.pNeed, budget.c, budget.f),
    held: heldBits.length ? `${DECIDE_COPY.holdingLead} ${heldBits.join(" · ")}` : "",
    heldPieces,
  };
}

export function budgetSentence(budget) {
  if (!budget) return "";
  const later = budget.laterSlots || [];
  const snackPiece = budget.reserve?.bySlot?.snack;
  const snackReserved = Boolean(snackPiece && snackPiece.cal > 0);
  const snackName = snackReserveCopy(budget.snackCount ?? 1);
  const leaves = `${DECIDE_COPY.thatLeaves} ${fmtCal(budget.cal)} cal and ${fmtP(budget.pNeed)} for ${DECIDE_SLOT_LABEL[budget.slot] || budget.slot}.`;
  let line;
  if (!later.length) {
    if (snackReserved && !snackPiece.meal) {
      const how = snackPiece.source === "usual" ? DECIDE_COPY.usualEat : DECIDE_COPY.normalShare;
      line = `${DECIDE_COPY.savingRoom} ${snackName} ${how} (about ${fmtCal(snackPiece.cal)} cal, ${fmtP(snackPiece.p)}). ${leaves}`;
    } else {
      line = `${DECIDE_COPY.lastMealLead} ${DECIDE_COPY.lastMealRest}: about ${fmtCal(budget.cal)} cal, ${fmtP(budget.pNeed)} to hit range.`;
    }
  } else {
    const first = later[0];
    const piece = budget.reserve?.bySlot?.[first];
    if (piece?.meal) {
      const name = piece.meal.name || "Dinner";
      const snackBit = snackReserved
        ? ` ${DECIDE_COPY.savingRoom} ${snackName} too.`
        : "";
      line = `${DECIDE_SLOT_LABEL[first] || first} ${DECIDE_COPY.pencilledIn} (${name}, ${fmtCal(piece.cal)} cal, ${fmtP(piece.p)}).${snackBit} ${leaves}`;
    } else {
      const names = later.map((s) => DECIDE_SLOT_LABEL[s] || s);
      if (snackReserved) names.push(snackName);
      const laterLabel = joinReserveNames(names);
      const laterSharePieces = later
        .map((s) => budget.reserve?.bySlot?.[s])
        .filter((p) => p && !p.meal);
      const usedUsual = laterSharePieces.length > 0
        && laterSharePieces.every((p) => p.source === "usual");
      const how = usedUsual ? DECIDE_COPY.usualEat : DECIDE_COPY.normalShare;
      const named = later.reduce((acc, s) => {
        const p = budget.reserve?.bySlot?.[s];
        if (!p) return acc;
        return { cal: acc.cal + p.cal, p: acc.p + p.p };
      }, { cal: 0, p: 0 });
      const aboutCal = named.cal + (snackReserved ? snackPiece.cal : 0);
      const aboutP = named.p + (snackReserved ? snackPiece.p : 0);
      line = `${DECIDE_COPY.savingRoom} ${laterLabel} ${how} (about ${fmtCal(aboutCal)} cal, ${fmtP(aboutP)}). ${leaves}`;
    }
  }
  return capitalizeDecideLine(line);
}

/** Lunch/dinner share-reserves that are not yet a named pencil or a log. */
export function decideReservePlaceholders({
  plannedMeals = [],
  entries = [],
  budget,
  shares,
  bands,
} = {}) {
  const logged = loggedSlotsFromEntries(entries);
  const useShares = shares || DEFAULT_MEAL_SHARES;
  const highs = budget?.dayHighs;
  const useBands = bands || (highs
    ? { calHi: highs.cal, pLo: highs.p, pHi: highs.p, cHi: highs.c, fHi: highs.f }
    : null);
  const out = [];
  for (const slot of ["lunch", "dinner"]) {
    if (logged.has(slot)) continue;
    if (planMealForSlot(plannedMeals, slot)) continue;
    let piece = budget?.reserve?.bySlot?.[slot];
    if ((!piece || !(piece.cal > 0)) && useBands) {
      piece = shareReserve(slot, useShares, useBands);
    }
    if (!piece || !(piece.cal > 0)) continue;
    out.push({
      slot,
      cal: piece.cal,
      p: piece.p,
      c: piece.c,
      f: piece.f,
      source: piece.source,
    });
  }
  return out;
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
