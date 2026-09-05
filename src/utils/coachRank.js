/**
 * Turns her meal bank, My meals and pantry into three cards that actually fit
 * the slot budget, at a portion she'd really eat.
 *
 * The only rejection axes are calories, carbs and fat. Protein is a floor she
 * is trying to reach, so a card is never dropped for carrying too much of it —
 * see `budgetAsRemaining`. Ported from the Help me decide ranker (PR 332).
 */

import { COACH_COPY, COACH_SLOT_LABEL } from "../content/coachVoice.js";
import { mealFitsRemaining, mealMacros } from "./eatingOutImpact.js";
import { snapServings } from "./servings.jsx";
import {
  likeMatch,
  mealAllowedForDiet,
  mealHitsDislike,
  namesMatch,
  primaryProtein,
} from "./coachPrefs.js";
import { budgetAsRemaining } from "./coachBudget.js";
import { mealMatchesQuery, mealSlotFilterKey } from "./mealSearch.js";

export const SCALE_CANDIDATES = [1, 1.5, 2, 0.75, 0.5];

function hasMacros(meal) {
  const m = mealMacros(meal);
  return m.cal > 0 || m.p > 0 || m.c > 0 || m.f > 0;
}

function scaleMeal(meal, servings) {
  const { cal, p, c, f } = mealMacros(meal);
  const snapped = snapServings(servings);
  return {
    ...meal,
    servings: snapped,
    cal: cal * snapped,
    p: p * snapped,
    c: c * snapped,
    f: f * snapped,
  };
}

export function coachMealFits(meal, budget) {
  return mealFitsRemaining(meal, budgetAsRemaining(budget));
}

/**
 * 1× if it fits; halves only if 1× doesn't.
 *
 * A bigger portion is offered only when the single serving leaves her short on
 * protein, closes at least 15g more of it, and doesn't overshoot what she
 * actually needs. Calories used to hold that line indirectly through the
 * protein ceiling; now that protein is a floor, the need itself has to.
 */
export function pickScale(meal, budget) {
  if (!budget) return null;
  const fits = (s) => coachMealFits(scaleMeal(meal, s), budget);
  const p1 = mealMacros(meal).p;
  const pNeed = budget?.pNeed || 0;
  if (fits(1)) {
    let best = 1;
    if (p1 < pNeed) {
      for (const s of [1.5, 2]) {
        if (!fits(s)) continue;
        if (p1 * s < p1 + 15) continue;
        if (p1 * s > pNeed + 10) continue;
        best = s;
      }
    }
    return best;
  }
  if (fits(0.75)) return 0.75;
  if (fits(0.5)) return 0.5;
  return null;
}

export function portionTitle(name, servings) {
  const base = String(name || "Meal");
  const s = snapServings(servings || 1);
  if (s === 1) return base;
  if (s === 0.5) return `${base} · half portion`;
  if (s === 0.75) return `${base} · 0.75 servings`;
  return `${base} · ${s} servings`;
}

export function sourceTag(source) {
  if (source === "my") return COACH_COPY.sourceMy;
  if (source === "pantry") return COACH_COPY.sourcePantry;
  if (source === "menu") return COACH_COPY.sourceMenu;
  if (source === "kitchen") return COACH_COPY.sourceKitchen;
  if (source === "new") return COACH_COPY.sourceNew;
  return COACH_COPY.sourceBank;
}

function usualCount(name, historyNames) {
  return (historyNames || []).filter((n) => namesMatch(n, name)).length;
}

const SLOT_FILTER_KEY = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * Does this meal belong at this meal?
 *
 * Halibut and rice fits a 582-calorie breakfast on every number the budget
 * checks, and offering it at 7am is the fastest way to look like something
 * that has never eaten breakfast. The bank is already categorised and her own
 * meals carry a slot, so the question is answerable without guessing.
 *
 * "belongs" — she has eaten it at this meal before, or it is filed under it.
 * "neutral" — nothing filed, which is most of My meals; no claim either way,
 *   and punishing her own meals for missing metadata would be wrong.
 * "elsewhere" — filed under a different meal.
 *
 * Leftovers for breakfast are a real thing, so this orders rather than
 * filters: an "elsewhere" meal still shows once the ones that belong run out.
 */
export function slotAffinity(meal, slot, { slotHistoryNames = [] } = {}) {
  if (!slot) return "neutral";
  if (usualCount(meal?.name, slotHistoryNames) >= 1) return "belongs";
  const want = SLOT_FILTER_KEY[slot];
  if (!want) return "neutral";
  // A pantry item is a component, not a meal. Fine to reach for at a snack,
  // filler at a meal — but never ahead of an actual snack from the bank, or
  // "what should I snack on" answers with cooked chicken breast.
  if (meal?.source === "pantry") return slot === "snack" ? "neutral" : "elsewhere";
  const key = mealSlotFilterKey(meal);
  if (!key) return "neutral";
  if (key === want) return "belongs";
  // Treats sit next to snacks, never at a meal.
  if (key === "Treats") return slot === "snack" ? "belongs" : "elsewhere";
  return "elsewhere";
}

const AFFINITY_RANK = { belongs: 2, neutral: 1, elsewhere: 0 };

export function scoreScaledMeal(meal, budget, ctx = {}) {
  const { p } = mealMacros(meal);
  const pNeed = budget?.pNeed || 0;
  const protein = pNeed <= 0 ? 1 : 3.0 * Math.min(1, p / pNeed);
  const myBonus = meal.source === "my" ? 0.3 : 0;
  const likeBonus = likeMatch(meal, ctx.likes) ? 0.4 : 0;
  const scaleBonus = (meal.servings || 1) === 1 ? 0.2 : 0;
  const slotUsual = usualCount(meal.name, ctx.slotHistoryNames) >= 3 ? 0.3 : 0;
  const todayPen = (ctx.loggedTodayNames || []).some((n) => namesMatch(n, meal.name)) ? -0.5 : 0;
  const recentPen = (ctx.loggedRecentNames || []).some((n) => namesMatch(n, meal.name)) ? -0.2 : 0;
  return protein + myBonus + likeBonus + scaleBonus + slotUsual + todayPen + recentPen;
}

function proteinClosesNeed(p, pNeed) {
  return pNeed > 0 && p >= pNeed;
}

function meaningfulProtein(meal, budget) {
  const p = mealMacros(meal).p;
  const need = budget?.pNeed || 0;
  if (p <= 0) return false;
  if (need <= 0) return p >= 8;
  return p >= Math.min(8, need * 0.25);
}

/**
 * A card that takes her past the top of her protein range is still a good card.
 * Say so on the card instead of hiding it, so the number is never a surprise.
 *
 * Measured against the day, not the slot. A slot's protein share is small by
 * construction — a snack squeezed behind three unlogged meals gets around 12g
 * of what's left — so reading the slot's number flagged a Greek yogurt as
 * "over the top" on a morning she was still 130g short of her range. Only the
 * day's high can make that sentence true.
 */
export function proteinOverNote(meal, budget) {
  const p = mealMacros(meal).p;
  const headroom = budget?.remaining?.pHigh;
  if (!Number.isFinite(headroom)) return null;
  return p > headroom + 5 ? COACH_COPY.proteinOver : null;
}

/**
 * The reason is not the place to restate the portion. The title above it
 * already says "half portion", and "0.5 servings." underneath said the same
 * fact in different words — two sentences for one number.
 */
export function coachReason(meal, budget, { over = false } = {}) {
  if (over) return COACH_COPY.reasonOver;
  const { p, f } = mealMacros(meal);
  const pNeed = budget?.pNeed || 0;
  if (proteinClosesNeed(p, pNeed) && (budget?.f ?? 99) < 6) {
    // "Leaves 0g fat" is a sentence that tells her nothing and reads like the
    // meal only just scraped in. Say the plain thing instead.
    const fatLeft = Math.round(Math.max(0, (budget?.f || 0) - f));
    if (fatLeft > 0) return `${COACH_COPY.reasonFills} ${fatLeft}${COACH_COPY.reasonFillsTail}`;
    return COACH_COPY.reasonGets;
  }
  if (proteinClosesNeed(p, pNeed)) return COACH_COPY.reasonGets;
  if (pNeed > 0 && p / pNeed >= 0.7) {
    // The gap, not a stock line. Three cards in a row all saying "add a yogurt
    // later" is the tell of something with one sentence and three slots.
    const gap = Math.max(1, Math.round(pNeed - p));
    return `${COACH_COPY.reasonMost} ${gap}g ${COACH_COPY.reasonMostTail}`;
  }
  return COACH_COPY.reasonFits;
}

/**
 * The one true thing worth saying about this card, or nothing.
 *
 * This used to fall through to "Close to what you usually eat", which for a
 * mama in her first week is a sentence about a history that doesn't exist. A
 * coach that pads gets read as one that guesses, and then the chips that are
 * true stop counting for anything. No chip is a fine outcome.
 */
export function coachKnowsYou(meal, ctx = {}) {
  if (ctx.pencilledName && namesMatch(ctx.pencilledName, meal.name)) {
    return COACH_COPY.knowsPencilled;
  }
  if (usualCount(meal.name, ctx.slotHistoryNames) >= 3) {
    const slot = COACH_SLOT_LABEL[ctx.slot] || ctx.slot || "this meal";
    return `${COACH_COPY.knowsUsualSlot} ${slot}`;
  }
  if (usualCount(meal.name, ctx.anyHistoryNames) >= 3) return COACH_COPY.knowsUsual;
  const like = likeMatch(meal, ctx.likes);
  if (like) return `${COACH_COPY.knowsLike} ${like}`;
  if (meal.source === "pantry") return COACH_COPY.knowsPantry;
  // Say why a dinner is sitting in her breakfast list rather than let her
  // wonder whether the coach knows what time it is.
  if (meal.affinity === "elsewhere") {
    const home = mealSlotFilterKey(meal);
    if (home) return `${COACH_COPY.knowsOffSlot} ${home.toLowerCase()}`;
  }
  return null;
}

function tagSource(meal, source) {
  return { ...meal, source };
}

function uniqueByName(list) {
  const seen = new Set();
  return list.filter((m) => {
    const key = (m.name || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function diversify(ranked) {
  const picked = [];
  const proteins = new Set();
  for (const meal of ranked) {
    const prot = primaryProtein(meal);
    if (proteins.has(prot) && prot !== "other") continue;
    proteins.add(prot);
    picked.push(meal);
    if (picked.length === 3) return picked;
  }
  if (picked.length < 3) {
    for (const meal of ranked) {
      if (picked.includes(meal)) continue;
      picked.push(meal);
      if (picked.length === 3) break;
    }
  }
  return picked;
}

/**
 * Where it belongs first, then how good it is. "Lighter" means the lightest
 * breakfast, not the lightest thing in the bank, so the tier holds there too.
 */
function compareMeals(a, b, prefer) {
  const tier = AFFINITY_RANK[b.affinity] - AFFINITY_RANK[a.affinity];
  if (tier !== 0) return tier;
  if (prefer === "lighter") return (a.cal || 0) - (b.cal || 0);
  if (prefer === "protein") return (b.p || 0) - (a.p || 0);
  if (b.score !== a.score) return b.score - a.score;
  return (a.servings || 1) - (b.servings || 1);
}

function skipKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s·\s[\d.]+×$/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSkippedName(name, skipNames = []) {
  if (!name || !skipNames.length) return false;
  const key = skipKey(name);
  return skipNames.some((raw) => {
    if (namesMatch(raw, name)) return true;
    const other = skipKey(raw);
    if (!key || !other) return false;
    return other === key || key.startsWith(`${other} `) || other.startsWith(`${key} `);
  });
}

/**
 * Dress one meal as a coach card: fit-checked, portioned, and carrying the
 * reason it's here. Used for bank cards and for anything the coach builds.
 */
export function buildCoachCard(meal, budget, ctx = {}) {
  const servings = pickScale(meal, budget);
  if (!servings) return null;
  const next = scaleMeal(meal, servings);
  next.affinity = slotAffinity(next, ctx.slot, ctx);
  // The meal this card was sized for, stamped on so logging it can never land
  // somewhere else. She asked about dinner, went to Messages and came back,
  // and the panel had gone back to breakfast — the dinner she logged from the
  // card still in front of her was filed under breakfast. Read after affinity,
  // which must judge where the meal is from, not where it is being offered.
  next.slot = ctx.slot || next.slot || null;
  next.score = scoreScaledMeal(next, budget, ctx);
  next.knowsYou = ctx.knowsYou || coachKnowsYou(next, ctx);
  next.reason = coachReason(next, budget, { over: ctx.over });
  next.title = portionTitle(next.name, servings);
  next.tag = sourceTag(next.source);
  next.proteinNote = proteinOverNote(next, budget);
  return next;
}

export function rankBankCards({
  bankMeals = [],
  myMeals = [],
  pantryItems = [],
  budget,
  likes = [],
  dislikes = [],
  diet = "",
  loggedTodayNames = [],
  loggedRecentNames = [],
  slotHistoryNames = [],
  anyHistoryNames = [],
  skipNames = [],
  matchQuery = "",
  prefer = null,
  offset = 0,
  pencilled = null,
  over = false,
  slot = "lunch",
  limit = 3,
} = {}) {
  if (!budget) return { cards: [], meals: [], scaledCount: 0 };

  const pool = [
    ...bankMeals.map((m) => tagSource(m, "bank")),
    ...myMeals.map((m) => tagSource(m, "my")),
    ...pantryItems.map((m) => tagSource({ ...m, servings: 1 }, "pantry")),
  ].filter((m) => hasMacros(m)
    && mealAllowedForDiet(m, diet)
    && !mealHitsDislike(m, dislikes)
    && !isSkippedName(m.name, skipNames));

  const hint = String(matchQuery || "").trim();
  const hinted = hint ? pool.filter((m) => mealMatchesQuery(m, hint)) : pool;
  const usePool = hinted.length ? hinted : pool;

  const ctx = {
    likes,
    loggedTodayNames,
    loggedRecentNames,
    slotHistoryNames,
    anyHistoryNames,
    slot,
    over,
    pencilledName: pencilled?.name,
  };

  const scaled = [];
  for (const meal of usePool) {
    const card = buildCoachCard(meal, budget, ctx);
    if (card) scaled.push(card);
  }

  const rankedPool = prefer === "protein"
    ? (() => {
      const withP = scaled.filter((m) => meaningfulProtein(m, budget));
      return withP.length ? withP : scaled;
    })()
    : scaled;

  rankedPool.sort((a, b) => compareMeals(a, b, prefer));
  const unique = uniqueByName(rankedPool);
  const windowed = unique.slice(Math.max(0, offset));
  let meals = prefer === "lighter" ? windowed.slice(0, limit) : diversify(windowed).slice(0, limit);

  if (pencilled && meals.every((m) => !namesMatch(m.name, pencilled.name))) {
    const card = buildCoachCard(
      { ...pencilled, source: pencilled.source || "bank" },
      budget,
      { ...ctx, knowsYou: COACH_COPY.knowsPencilled },
    );
    if (card) {
      card.score = 99;
      meals = [card, ...meals.filter((m) => !namesMatch(m.name, card.name))].slice(0, limit);
    }
  }

  return {
    cards: meals.map((m) => ({ kind: "meal", ...m })),
    meals,
    scaledCount: rankedPool.filter((m) => (m.servings || 1) !== 1).length,
  };
}
