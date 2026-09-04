/**
 * Everything the coach says about numbers.
 *
 * Every phrase here is derived from `rangeProgress`, the same source the Today
 * card uses, so the coach can never quote a number the rest of the app would
 * word differently.
 */

import {
  COACH_COPY,
  COACH_SLOT_LABEL,
  COACH_SLOT_PHRASE,
  capitalizeLine,
  snackReserveCopy,
} from "../content/coachVoice.js";
import { rangeProgress } from "./rangeProgress.js";
import { planMealForSlot } from "./coachBudget.js";

const MACRO_ROWS = [
  { key: "cal", label: "", lo: "calLo", hi: "calHi", unit: " cal" },
  { key: "p", label: "P ", lo: "pLo", hi: "pHi", unit: "g" },
  { key: "c", label: "C ", lo: "cLo", hi: "cHi", unit: "g" },
  { key: "f", label: "F ", lo: "fLo", hi: "fHi", unit: "g" },
];

/** One macro's standing, worded the way the Today card words it. */
export function macroStanding(eaten, lo, hi, unit = "g") {
  const r = rangeProgress(eaten, lo, hi);
  if (r.state === "empty") {
    const low = Math.round(Number(lo) || 0);
    const high = Math.round(Number(hi) || 0);
    return { state: "empty", text: low === high ? `${low}${unit}` : `${low}–${high}${unit}` };
  }
  if (r.state === "under") {
    return {
      state: "under",
      text: r.leftLo === r.leftHi ? `${r.leftLo}${unit}` : `${r.leftLo}–${r.leftHi}${unit}`,
    };
  }
  if (r.state === "in") {
    return { state: "in", text: r.room > 0 ? `${r.room}${unit} room` : "at the top" };
  }
  return { state: "over", text: `${r.over}${unit} over` };
}

/** `845–995 cal · P 76–86g · C 6g room · F 12g over` */
export function leftLine(totals, bands) {
  if (!bands) return "";
  const t = totals || {};
  return MACRO_ROWS
    .map(({ key, label, lo, hi, unit }) => {
      const standing = macroStanding(t[key] || 0, bands[lo], bands[hi], unit);
      return `${label}${standing.text}`;
    })
    .join(" · ");
}

/**
 * The macro closest to its ceiling, as a share of the day's high. Protein is
 * never the answer — it's a floor, so running low on protein headroom is not
 * a constraint on what she can eat next.
 */
export function tightestMacro(totals, bands) {
  if (!bands) return null;
  const t = totals || {};
  const ratios = {
    cal: (bands.calHi - (t.cal || 0)) / Math.max(1, bands.calHi),
    c: (bands.cHi - (t.c || 0)) / Math.max(1, bands.cHi),
    f: (bands.fHi - (t.f || 0)) / Math.max(1, bands.fHi),
  };
  const key = ["f", "c", "cal"].reduce((best, k) => (ratios[k] < ratios[best] ? k : best), "cal");
  if (ratios[key] >= 0.35) return null;
  return { key, ratio: ratios[key] };
}

function round5(n) {
  return Math.max(0, Math.round(n / 5) * 5);
}

function round25(n) {
  return Math.max(0, Math.round(n / 25) * 25);
}

/** Two short lines: where protein stands, then what's actually binding. */
export function coachRead({ budget, slot, over } = {}) {
  const phrase = COACH_SLOT_PHRASE[slot] || "";
  if (over) return { over: true, line1: COACH_COPY.over, line2: "" };

  const pNeed = budget?.pNeed ?? 0;
  let line1;
  if (pNeed >= 15) {
    line1 = `${COACH_COPY.proteinNeed} ${round5(pNeed)} g ${COACH_COPY.proteinNeedTail} ${phrase}.`;
  } else if (pNeed > 0) {
    line1 = `${COACH_COPY.proteinShy} ${Math.round(pNeed)}g ${COACH_COPY.proteinShyTail} ${phrase}. ${COACH_COPY.easyClose}`;
  } else {
    line1 = `${COACH_COPY.proteinCovered} ${phrase}.`;
  }

  const rem = budget?.remaining;
  const dayHighs = budget?.dayHighs;
  let line2 = COACH_COPY.plenty;
  if (rem && dayHighs) {
    const ratios = {
      cal: rem.cal / Math.max(1, dayHighs.cal),
      c: rem.c / Math.max(1, dayHighs.c),
      f: rem.f / Math.max(1, dayHighs.f),
    };
    const binding = ["f", "c", "cal"].reduce((best, k) => (ratios[k] < ratios[best] ? k : best), "cal");
    if (binding === "f" && ratios.f < 0.35) line2 = COACH_COPY.fatSpent;
    else if (binding === "c" && ratios.c < 0.35) line2 = COACH_COPY.carbsClose;
    else if (ratios.cal < 0.3) line2 = `${COACH_COPY.calTightLead} ${round25(budget.cal)} ${COACH_COPY.calTightTail}`;
  }
  return { over: false, line1, line2 };
}

function fmtCal(n) {
  return String(Math.round(n));
}

function fmtP(n) {
  return `${Math.round(n)}g protein`;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Why this slot's number is what it is. She can check the arithmetic herself. */
export function budgetSentence(budget) {
  if (!budget) return "";
  const later = budget.laterSlots || [];
  const snackPiece = budget.reserve?.bySlot?.snack;
  const snackReserved = Boolean(snackPiece && snackPiece.cal > 0);
  const snackName = snackReserveCopy(budget.snackCount ?? 1);
  const slotLabel = COACH_SLOT_LABEL[budget.slot] || budget.slot;
  const leaves = `${COACH_COPY.thatLeaves} ${fmtCal(budget.cal)} cal and ${fmtP(budget.pNeed)} for ${slotLabel}.`;
  let line;

  if (!later.length) {
    if (snackReserved && !snackPiece.meal) {
      const how = snackPiece.source === "usual" ? COACH_COPY.usualEat : COACH_COPY.normalShare;
      line = `${COACH_COPY.savingRoom} ${snackName} ${how} (about ${fmtCal(snackPiece.cal)} cal, ${fmtP(snackPiece.p)}). ${leaves}`;
    } else {
      line = `${COACH_COPY.lastMealLead} ${COACH_COPY.lastMealRest}: about ${fmtCal(budget.cal)} cal, ${fmtP(budget.pNeed)} to hit range.`;
    }
  } else {
    const first = later[0];
    const piece = budget.reserve?.bySlot?.[first];
    if (piece?.meal) {
      const name = piece.meal.name || COACH_SLOT_LABEL[first] || first;
      const snackBit = snackReserved ? ` ${COACH_COPY.savingRoom} ${snackName} too.` : "";
      line = `${COACH_SLOT_LABEL[first] || first} ${COACH_COPY.pencilledIn} (${name}, ${fmtCal(piece.cal)} cal, ${fmtP(piece.p)}).${snackBit} ${leaves}`;
    } else {
      const names = later.map((s) => COACH_SLOT_LABEL[s] || s);
      if (snackReserved) names.push(snackName);
      const sharePieces = later.map((s) => budget.reserve?.bySlot?.[s]).filter((p) => p && !p.meal);
      const usedUsual = sharePieces.length > 0 && sharePieces.every((p) => p.source === "usual");
      const how = usedUsual ? COACH_COPY.usualEat : COACH_COPY.normalShare;
      const named = later.reduce((acc, s) => {
        const p = budget.reserve?.bySlot?.[s];
        if (!p) return acc;
        return { cal: acc.cal + p.cal, p: acc.p + p.p };
      }, { cal: 0, p: 0 });
      const aboutCal = named.cal + (snackReserved ? snackPiece.cal : 0);
      const aboutP = named.p + (snackReserved ? snackPiece.p : 0);
      line = `${COACH_COPY.savingRoom} ${joinNames(names)} ${how} (about ${fmtCal(aboutCal)} cal, ${fmtP(aboutP)}). ${leaves}`;
    }
  }
  return capitalizeLine(line);
}

/**
 * Protein and the two ceilings, said as what they are.
 *
 * `P 30g · C 44g · F 13g` gives all three the same weight, which is the one
 * thing the program does not believe: protein is a number to reach and the
 * other two are room not to blow through.
 */
function macrosShort(p, c, f) {
  const protein = Math.round(p || 0);
  const ceilings = `up to ${Math.round(c || 0)}g carbs and ${Math.round(f || 0)}g fat`;
  if (protein <= 0) return `${capitalizeLine(ceilings)}. Protein's already covered.`;
  return `Aim for ${protein}g protein. ${capitalizeLine(ceilings)}.`;
}

/** The header strip above a set of cards: this slot's room, and what's held back. */
export function slotLeftRead(budget) {
  if (!budget) return { title: "", cal: 0, macros: "", held: "", heldPieces: [] };
  const slot = COACH_SLOT_LABEL[budget.slot] || budget.slot;
  const heldPieces = [];
  for (const s of budget.laterSlots || []) {
    const piece = budget.reserve?.bySlot?.[s];
    if (!piece || !(piece.cal > 0)) continue;
    heldPieces.push({ slot: s, cal: piece.cal, p: piece.p, c: piece.c, f: piece.f, meal: piece.meal || null });
  }
  const snack = budget.reserve?.bySlot?.snack;
  if (snack && snack.cal > 0) {
    heldPieces.push({ slot: "snack", cal: snack.cal, p: snack.p, c: snack.c, f: snack.f, meal: snack.meal || null });
  }
  // "cal" once, on the first number, so a three-slot strip stays readable.
  const heldBits = heldPieces.map((h, i) => {
    const label = COACH_SLOT_LABEL[h.slot] || h.slot;
    const amount = i === 0 ? `${fmtCal(h.cal)} cal` : fmtCal(h.cal);
    if (h.meal?.name) return `${amount} for ${label} (${h.meal.name})`;
    return `${amount} for ${label}`;
  });
  return {
    title: `${COACH_COPY.leftFor} ${slot}`,
    cal: budget.cal,
    p: budget.pNeed,
    c: budget.c,
    f: budget.f,
    macros: macrosShort(budget.pNeed, budget.c, budget.f),
    held: heldBits.length ? `${COACH_COPY.holdingLead} ${heldBits.join(" · ")}` : "",
    heldPieces,
  };
}

/** One-line prompt for the Today card entry point. */
export function coachEntryHint({ loggedSlots = new Set(), plannedMeals = [], read } = {}) {
  const dinnerLogged = loggedSlots.has("dinner");
  const lunchLogged = loggedSlots.has("lunch");
  if (lunchLogged && !dinnerLogged && !planMealForSlot(plannedMeals, "dinner")) {
    return "Know what dinner is yet? I'll size it to what's left.";
  }
  return read?.line1 || COACH_COPY.plenty;
}
