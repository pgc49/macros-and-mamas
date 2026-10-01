/**
 * One place that turns everything the app already knows about her into the
 * coach's answer. No React, no network — the common question ("what should I
 * eat?") is answered here, on her device, before anything can spin.
 */

import { RECIPES } from "../content/data.js";
import { PANTRY_ITEMS } from "../content/pantry.js";
import { withRecipeDetail } from "../content/recipeDetails.js";
import { targetBands } from "./weekPlan.js";
import { localDateIso } from "./dates.js";
import { coachSlotFromTime, normalizeSlot } from "./mealSlots.js";
import {
  attachDayHighs,
  coachPencilForSlot,
  computeSlotBudget,
  deriveMealShares,
  snackHabitFromHistory,
  isOverDay,
  loggedSlotsFromEntries,
  nextCoachSlot,
  remainingForCoach,
  skippedSlotsBefore,
} from "./coachBudget.js";
import { buildCoachCard, rankBankCards, shownCoachReason } from "./coachRank.js";
import { coachPrefsFromProfile } from "./coachPrefs.js";
import { budgetSentence, coachRead, leftLine, shownCoachLead, slotLeftRead } from "./coachLines.js";
import { bankMealNameSet, buildLiveMyMealsLookup, cardIsGoneCustom } from "./coachMyMeals.js";

const HISTORY_DAYS = 28;

/** Bank recipes with their ingredients and steps attached, so cards can open. */
export function bankMeals(recipes = RECIPES) {
  return recipes.map((r) => {
    const detail = withRecipeDetail(r);
    return {
      ...r,
      ingredients: detail.serving || [],
      steps: detail.steps || [],
      batch: detail.batch || null,
    };
  });
}

function recentDates(mealHistoryByDate, days = HISTORY_DAYS) {
  return Object.keys(mealHistoryByDate || {}).sort().slice(-days);
}

function historyNames(mealHistoryByDate, { slot = null, days = HISTORY_DAYS } = {}) {
  const names = [];
  for (const date of recentDates(mealHistoryByDate, days)) {
    for (const entry of mealHistoryByDate[date] || []) {
      if (slot && normalizeSlot(entry?.slot) !== slot) continue;
      if (entry?.name) names.push(entry.name);
    }
  }
  return names;
}

/**
 * Which meal she's asking about. Time of day picks it, but a slot she has
 * already logged or pencilled is never offered again.
 */
export function resolveCoachSlot({ entries = [], plannedMeals = [], now = new Date(), requested = null } = {}) {
  const asked = normalizeSlot(requested);
  if (asked) return asked;
  // A passed breakfast is not the fallback once the clock has moved on.
  // `nextCoachSlot` already walks only what is still ahead.
  return nextCoachSlot({ now, entries, plannedMeals }) || coachSlotFromTime(now);
}

/**
 * Everything the coach knows right now: what this meal can afford, what's
 * held back for later, and three cards that fit.
 *
 * `cards` is empty when nothing in her banks fits at a portion she'd eat —
 * that is a real answer, not a failure, and the caller says so.
 */
export function buildCoachAnswer({
  profile,
  macros,
  totals,
  entries = [],
  plannedMeals = [],
  mealHistoryByDate = {},
  customMeals = [],
  recipes = RECIPES,
  pantryItems = PANTRY_ITEMS,
  slot: requestedSlot = null,
  snackCount,
  prefer = null,
  skipNames = [],
  matchQuery = "",
  offset = 0,
  now = new Date(),
} = {}) {
  const bands = targetBands(macros);
  if (!bands) return null;

  const slot = resolveCoachSlot({ entries, plannedMeals, now, requested: requestedSlot });
  const loggedSlots = loggedSlotsFromEntries(entries);
  const shares = deriveMealShares(mealHistoryByDate);
  const habit = snackCount == null ? snackHabitFromHistory(mealHistoryByDate) : null;
  const resolvedSnackCount = habit ? habit.count : snackCount;
  const budget = attachDayHighs(
    computeSlotBudget({ totals, bands, slot, plannedMeals, shares, loggedSlots, snackCount: resolvedSnackCount, now }),
    bands,
  );
  const remaining = remainingForCoach(totals, bands);
  const over = isOverDay(remaining);
  const skipped = budget?.skipped || skippedSlotsBefore(slot, loggedSlots, now);
  const prefs = coachPrefsFromProfile(profile, slot);
  const pencilled = coachPencilForSlot(plannedMeals, slot);

  const { cards: rankedCards, meals: rankedMeals } = rankBankCards({
    bankMeals: bankMeals(recipes),
    myMeals: customMeals,
    liveMyMeals: customMeals,
    pantryItems,
    budget,
    likes: prefs.likes,
    dislikes: prefs.dislikes,
    diet: prefs.diet,
    loggedTodayNames: entries.map((e) => e.name).filter(Boolean),
    loggedRecentNames: historyNames(mealHistoryByDate, { days: 3 }),
    slotHistoryNames: historyNames(mealHistoryByDate, { slot }),
    anyHistoryNames: historyNames(mealHistoryByDate),
    skipNames,
    matchQuery,
    prefer,
    offset,
    pencilled,
    over,
    slot,
  });
  const cards = pruneStaleMyMealCards(rankedCards, customMeals);
  const meals = pruneStaleMyMealCards(rankedMeals, customMeals);

  const read = coachRead({ budget, slot, over });
  return {
    slot,
    bands,
    budget,
    remaining,
    over,
    skipped,
    prefs,
    pencilled,
    cards,
    meals,
    read,
    left: leftLine(totals, bands),
    strip: slotLeftRead(budget),
    why: budgetSentence(budget),
    shares,
    snackAsk: Boolean(habit?.ask),
  };
}

export function pruneStaleMyMealCards(cards = [], customMeals = [], bankNames = bankMealNameSet()) {
  const liveMyMeals = buildLiveMyMealsLookup(customMeals);
  return (cards || []).filter((card) => !cardIsGoneCustom(card, liveMyMeals, bankNames));
}

/** One plate and one swap. A stored bank dump does not come back as three. */
const FIRST_PAINT_CARDS = 2;

/** Thread rows as she should see them now. Raw history stays; deleted customs do not. */
export function replayCoachMessages(messages = [], customMeals = []) {
  return (messages || []).map((message) => {
    const hasCards = Array.isArray(message?.cards) && message.cards.length > 0;
    const body = hasCards && message.role !== "mama"
      ? shownCoachLead(message.body)
      : message.body;
    if (!hasCards) {
      return body === message.body ? message : { ...message, body };
    }
    const rewritten = pruneStaleMyMealCards(message.cards, customMeals).map((card) => {
      const reason = shownCoachReason(card);
      if (reason === (card?.reason || "")) return card;
      return { ...card, reason };
    });
    const cards = rewritten.slice(0, FIRST_PAINT_CARDS);
    const same = body === (message.body || "")
      && cards.length === message.cards.length
      && cards.every((card, i) => card === message.cards[i]);
    if (same) return message;
    return { ...message, body, cards };
  });
}

/**
 * Dress meals the coach built (from a menu photo, her kitchen, or a written
 * ask) as cards, using the same fit check and the same portioning as the bank.
 * A meal that doesn't fit is dropped here rather than shown with a caveat.
 */
export function buildSuggestedCards(meals, answer, { source = "new", slot = null } = {}) {
  if (!answer?.budget) return [];
  const cardSlot = slot || answer.slot;
  const out = [];
  for (const meal of meals || []) {
    const card = buildCoachCard({ ...meal, source }, answer.budget, {
      likes: answer.prefs?.likes,
      slot: cardSlot,
      over: answer.over,
    });
    if (card) out.push({ kind: "meal", ...card });
  }
  return out;
}

function clipPromptText(value, max = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * The part of today the model cannot see unless we hand it over: what she
 * already ate, what's sitting on the plan, what she usually has at this
 * meal, and what she just turned down. Names only. The budget already
 * carries the numbers.
 */
export function coachDayForPrompt({
  entries = [],
  plannedMeals = [],
  mealHistoryByDate = {},
  slot = null,
  skipped = [],
  snackCount = 1,
  turnedDown = [],
} = {}) {
  const eaten = [];
  for (const entry of entries) {
    const name = clipPromptText(entry?.name);
    if (!name) continue;
    const slotName = normalizeSlot(entry?.slot);
    eaten.push(slotName ? `${slotName}: ${name}` : name);
    if (eaten.length === 8) break;
  }

  const planned = [];
  for (const meal of plannedMeals || []) {
    const name = clipPromptText(meal?.name);
    if (!name) continue;
    const slotName = normalizeSlot(meal?.slot);
    planned.push(slotName ? `${slotName}: ${name}` : name);
    if (planned.length === 6) break;
  }

  const usual = [];
  for (const name of historyNames(mealHistoryByDate, { slot, days: 14 })) {
    const clean = clipPromptText(name);
    if (!clean || usual.includes(clean)) continue;
    usual.push(clean);
    if (usual.length === 6) break;
  }

  const skippedSlots = [];
  for (const raw of skipped || []) {
    const slotName = normalizeSlot(raw);
    if (!slotName || skippedSlots.includes(slotName)) continue;
    skippedSlots.push(slotName);
    if (skippedSlots.length === 4) break;
  }

  const declined = [];
  for (const name of turnedDown || []) {
    const clean = clipPromptText(name);
    if (!clean || declined.includes(clean)) continue;
    declined.push(clean);
    if (declined.length === 8) break;
  }

  const snacks = Math.round(Number(snackCount));
  return {
    eaten,
    planned,
    usual,
    skipped: skippedSlots,
    turnedDown: declined,
    snackCount: Number.isFinite(snacks) ? Math.max(0, Math.min(4, snacks)) : 1,
  };
}

/** What she's been eating, for the model to lean on. Names only. */
export function recentNamesForPrompt(mealHistoryByDate, entries = []) {
  const today = entries.map((e) => e.name).filter(Boolean);
  const recent = historyNames(mealHistoryByDate, { days: 10 });
  return [...new Set([...today, ...recent.reverse()])].slice(0, 25);
}

/** True when the coach can answer at all: her ranges are approved and it's today. */
export function coachIsAvailable({ macros, mealLogDate } = {}) {
  if (!targetBands(macros)) return false;
  return !mealLogDate || mealLogDate === localDateIso();
}
