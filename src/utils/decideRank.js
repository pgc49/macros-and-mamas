import { DECIDE_COPY, DECIDE_SLOT_LABEL } from "../content/decideVoice.js";
import { mealFitsRemaining, mealMacros } from "./eatingOutImpact.js";
import { snapServings } from "./servings.jsx";
import {
  likeMatch,
  mealAllowedForDiet,
  mealHitsDislike,
  namesMatch,
  primaryProtein,
} from "./decidePrefs.js";
import { budgetAsRemaining } from "./decideBudget.js";

export const SCALE_CANDIDATES = [1, 1.5, 2, 0.75, 0.5];
export const KITCHEN_FLAG = false;
export const EATING_OUT_FLAG = false;

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

/** 1× if it fits; 1.5/2 only if they close ≥15g more protein; halves only if 1× fails. */
export function pickScale(meal, budget) {
  if (!budget) {
    if (import.meta.env?.DEV) console.assert(budget, "pickScale needs a budget");
    return null;
  }
  const remaining = budgetAsRemaining(budget);
  const fits = (s) => mealFitsRemaining(scaleMeal(meal, s), remaining);
  const p1 = mealMacros(meal).p;
  if (fits(1)) {
    let best = 1;
    for (const s of [1.5, 2]) {
      if (fits(s) && p1 * s >= p1 + 15) best = s;
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
  if (source === "my") return "My meals";
  if (source === "pantry") return "Pantry";
  return "Callie's bank";
}

function usualCount(name, historyNames) {
  return (historyNames || []).filter((n) => namesMatch(n, name)).length;
}

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

export function decideReason(meal, budget, { over = false } = {}) {
  if (over) return DECIDE_COPY.reasonOver;
  const { p, f } = mealMacros(meal);
  const pNeed = budget?.pNeed || 0;
  const prefix = (meal.servings || 1) !== 1 ? `${meal.servings} servings. ` : "";
  const closes = pNeed <= 0 || p >= pNeed;
  if (closes && (budget?.f ?? 99) < 6) {
    return `${prefix}${DECIDE_COPY.reasonFills} ${Math.round(Math.max(0, (budget?.f || 0) - f))}${DECIDE_COPY.reasonFillsTail}`;
  }
  if (closes) return `${prefix}${DECIDE_COPY.reasonGets}`;
  if (pNeed > 0 && p / pNeed >= 0.7) return `${prefix}${DECIDE_COPY.reasonMost}`;
  return `${prefix}${DECIDE_COPY.reasonGets}`;
}

export function decideKnowsYou(meal, ctx = {}) {
  if (ctx.pencilledName && namesMatch(ctx.pencilledName, meal.name)) {
    return DECIDE_COPY.knowsPencilled;
  }
  if (usualCount(meal.name, ctx.slotHistoryNames) >= 3) {
    const slot = DECIDE_SLOT_LABEL[ctx.slot] || ctx.slot || "this meal";
    return `${DECIDE_COPY.knowsUsualSlot} ${slot}`;
  }
  if (usualCount(meal.name, ctx.anyHistoryNames) >= 3) {
    return DECIDE_COPY.knowsUsual;
  }
  const like = likeMatch(meal, ctx.likes);
  if (like) return `${DECIDE_COPY.knowsLike} ${like}`;
  if (meal.source === "pantry") return DECIDE_COPY.knowsPantry;
  return DECIDE_COPY.knowsClose;
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

function compareMeals(a, b, prefer) {
  if (prefer === "lighter") return (a.cal || 0) - (b.cal || 0);
  if (prefer === "protein") return (b.p || 0) - (a.p || 0);
  if (b.score !== a.score) return b.score - a.score;
  return (a.servings || 1) - (b.servings || 1);
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
  prefer = null,
  offset = 0,
  pencilled = null,
  over = false,
  slot = "lunch",
} = {}) {
  if (!budget) {
    if (import.meta.env?.DEV) console.assert(budget, "rankBankCards needs a budget");
    return { cards: [], meals: [], scaledCount: 0 };
  }

  const pool = [
    ...bankMeals.map((m) => tagSource(m, "bank")),
    ...myMeals.map((m) => tagSource(m, "my")),
    ...pantryItems.map((m) => tagSource({ ...m, servings: 1 }, "pantry")),
  ].filter((m) => hasMacros(m)
    && mealAllowedForDiet(m, diet)
    && !mealHitsDislike(m, dislikes)
    && !skipNames.some((n) => namesMatch(n, m.name)));

  const ctx = {
    likes,
    loggedTodayNames,
    loggedRecentNames,
    slotHistoryNames,
    anyHistoryNames,
    slot,
    pencilledName: pencilled?.name,
  };

  const scaled = [];
  for (const meal of pool) {
    const servings = pickScale(meal, budget);
    if (!servings) continue;
    const next = scaleMeal(meal, servings);
    next.score = scoreScaledMeal(next, budget, ctx);
    next.knowsYou = decideKnowsYou(next, ctx);
    next.reason = decideReason(next, budget, { over });
    next.title = portionTitle(next.name, servings);
    next.tag = sourceTag(next.source);
    scaled.push(next);
  }

  scaled.sort((a, b) => compareMeals(a, b, prefer));
  const unique = uniqueByName(scaled);
  const windowed = unique.slice(offset);
  let meals = diversify(windowed);

  if (pencilled && meals.every((m) => !namesMatch(m.name, pencilled.name))) {
    const servings = pickScale(pencilled, budget) || pencilled.servings || 1;
    const card = {
      ...scaleMeal({ ...pencilled, source: pencilled.source || "bank" }, servings),
      source: pencilled.source || "bank",
      knowsYou: DECIDE_COPY.knowsPencilled,
      reason: decideReason(scaleMeal(pencilled, servings), budget, { over }),
      title: portionTitle(pencilled.name, servings),
      tag: sourceTag(pencilled.source || "bank"),
      score: 99,
    };
    if (mealFitsRemaining(card, budgetAsRemaining(budget))) {
      meals = [card, ...meals.filter((m) => !namesMatch(m.name, card.name))].slice(0, 3);
    }
  }

  const cards = meals.map((m) => ({ kind: "meal", ...m }));
  if (cards.length === 2) {
    cards.push({ kind: "soft", action: "kitchen", text: DECIDE_COPY.fridgeThird });
  } else if (cards.length <= 1) {
    cards.push({ kind: "soft", action: "browse", text: DECIDE_COPY.browseEverything });
  }

  return {
    cards: cards.slice(0, 3),
    meals,
    scaledCount: scaled.filter((m) => (m.servings || 1) !== 1).length,
  };
}
