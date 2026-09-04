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
import { guessSlotFromTime, normalizeSlot } from "./mealSlots.js";
import {
  attachDayHighs,
  coachPencilForSlot,
  computeSlotBudget,
  defaultCoachSlot,
  deriveMealShares,
  isOverDay,
  loggedSlotsFromEntries,
  nextCoachSlot,
  remainingForCoach,
} from "./coachBudget.js";
import { buildCoachCard, rankBankCards } from "./coachRank.js";
import { coachPrefsFromProfile } from "./coachPrefs.js";
import { budgetSentence, coachRead, leftLine, slotLeftRead } from "./coachLines.js";

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
  const logged = loggedSlotsFromEntries(entries);
  const next = nextCoachSlot({ now, entries, plannedMeals });
  return next || defaultCoachSlot({ now, loggedSlots: logged }) || guessSlotFromTime(now);
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
  snackCount = 1,
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
  const budget = attachDayHighs(
    computeSlotBudget({ totals, bands, slot, plannedMeals, shares, loggedSlots, snackCount }),
    bands,
  );
  const remaining = remainingForCoach(totals, bands);
  const over = isOverDay(remaining);
  const prefs = coachPrefsFromProfile(profile, slot);
  const pencilled = coachPencilForSlot(plannedMeals, slot);

  const { cards, meals } = rankBankCards({
    bankMeals: bankMeals(recipes),
    myMeals: customMeals,
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

  const read = coachRead({ budget, slot, over });
  return {
    slot,
    bands,
    budget,
    remaining,
    over,
    prefs,
    pencilled,
    cards,
    meals,
    read,
    left: leftLine(totals, bands),
    strip: slotLeftRead(budget),
    why: budgetSentence(budget),
    shares,
  };
}

/**
 * Dress meals the coach built (from a menu photo, her kitchen, or a written
 * ask) as cards, using the same fit check and the same portioning as the bank.
 * A meal that doesn't fit is dropped here rather than shown with a caveat.
 */
export function buildSuggestedCards(meals, answer, { source = "new" } = {}) {
  if (!answer?.budget) return [];
  const out = [];
  for (const meal of meals || []) {
    const card = buildCoachCard({ ...meal, source }, answer.budget, {
      likes: answer.prefs?.likes,
      slot: answer.slot,
      over: answer.over,
    });
    if (card) out.push({ kind: "meal", ...card });
  }
  return out;
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
