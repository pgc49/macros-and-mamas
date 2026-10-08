/**
 * Turns her meal bank, My meals and pantry into three cards that actually fit
 * the slot budget, at a portion she'd really eat.
 *
 * The only rejection axes are calories and fat. Protein and carbs may go
 * over when fat stays in its band — Callie's rule, not a guess. Protein is a
 * floor she is trying to reach, so a card is never dropped for carrying too
 * much of it. See `budgetAsRemaining`.
 */

import { COACH_COPY, COACH_SLOT_LABEL } from "../content/coachVoice.js";
import { distinctCoachMeals } from "../../functions/_shared/coachAskMeals.js";
import { withRecipeDetail } from "../content/recipeDetails.js";
import { mealMacros } from "./eatingOutImpact.js";
import { snapServings } from "./servings.jsx";
import {
  PROTEIN_OVER_MUCH,
  PROTEIN_OVER_OK,
  SCALE_CANDIDATES,
  coachMealFits,
  pickScale,
  portionTitle,
  sourceTag,
} from "./coachPlateScale.js";
import {
  likeMatch,
  mealAllowedForDiet,
  mealHitsDislike,
  namesMatch,
  primaryProtein,
} from "./coachPrefs.js";
import { mealMatchesQuery, mealSlotFilterKey } from "./mealSearch.js";
import { buildLiveMyMealsLookup, isLiveMyMeal } from "./coachMyMeals.js";

export {
  SCALE_CANDIDATES,
  PROTEIN_OVER_OK,
  PROTEIN_OVER_MUCH,
  coachMealFits,
  pickScale,
  portionTitle,
  sourceTag,
};

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
  const { p, f } = mealMacros(meal);
  const pNeed = budget?.pNeed || 0;
  // Protein is a floor, not the whole score. Fat staying in its band is the
  // one Callie would actually watch — a plate that hits protein by spending
  // every gram of fat is not the better plate.
  const protein = pNeed <= 0 ? 0.5 : 1.8 * Math.min(1, p / pNeed);
  const fatRoom = budget?.f ?? 0;
  const fatLeft = fatRoom > 0 ? Math.max(0, fatRoom - f) / fatRoom : 1;
  const fatFit = 1.2 * fatLeft;
  const myBonus = meal.source === "my" ? 0.3 : 0;
  const likeBonus = likeMatch(meal, ctx.likes) ? 0.4 : 0;
  const scaleBonus = (meal.servings || 1) === 1 ? 0.2 : 0;
  const slotUsual = usualCount(meal.name, ctx.slotHistoryNames) >= 3 ? 0.3 : 0;
  const todayPen = (ctx.loggedTodayNames || []).some((n) => namesMatch(n, meal.name)) ? -0.5 : 0;
  const recentPen = (ctx.loggedRecentNames || []).some((n) => namesMatch(n, meal.name)) ? -0.2 : 0;
  return protein + fatFit + myBonus + likeBonus + scaleBonus + slotUsual + todayPen + recentPen;
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
  const over = p - headroom;
  if (over > PROTEIN_OVER_MUCH) return COACH_COPY.proteinOverMuch;
  if (over > PROTEIN_OVER_OK) return COACH_COPY.proteinOver;
  return null;
}

const STOCK_REASONS = [
  COACH_COPY.reasonGets,
  COACH_COPY.reasonFits,
  COACH_COPY.reasonOver,
].map((line) => line.toLowerCase());

/**
 * One clause about this plate, or silence.
 *
 * Leftover math ("more protein than you need", "keep fat in range", "leaves
 * Ng fat") can sit under any card. A why has to name food on this plate, a
 * pref she already stated, or a meal she has actually had. Otherwise blank.
 */
function normalizedReason(reason) {
  return String(reason || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isStockReason(text) {
  const s = text.toLowerCase();
  if (!s) return false;
  if (STOCK_REASONS.includes(s)) return true;
  if (s.includes("hits protein and keeps fat")) return true;
  if (s.includes("fits what's left") || s.includes("fits what’s left")) return true;
  if (s.includes("fat stays in range") || s.includes("keep fat in range")) return true;
  if (s.includes("fat stays in check") || s.includes("simple and lighter")) return true;
  if (s.includes("more protein than you need") || s.includes("a bit over on protein")) return true;
  return false;
}

function isLeftoverMath(text) {
  const s = normalizedReason(text).toLowerCase();
  if (!s || isStockReason(s)) return !s ? false : true;
  if (s.includes("protein still open") || s.includes("short, easy to pick up")) return true;
  if (/\bleaves\b/.test(s) && /\bfat\b/.test(s)) return true;
  if (/\d+\s*g\b/.test(s) && /\b(protein|fat|carb)/.test(s)) return true;
  return false;
}

const SKIP_FOOD = /\b(salt|pepper|water|oil|spray|herb|seasoning|cinnamon|garlic powder|vanilla|baking|paprika|rosemary)\b/i;

function cleanFood(item) {
  let s = String(item || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^(dry|fresh or frozen|cooked|raw|cubed|boneless skinless)\s+/i, "");
  s = s.split(",")[0].trim();
  if (!s || s.length < 3 || SKIP_FOOD.test(s)) return "";
  if (/^(yield|to taste|pinch)$/i.test(s)) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function foodClause(items) {
  const list = [];
  for (const item of items) {
    const clean = cleanFood(item);
    if (!clean || list.some((food) => food.toLowerCase() === clean.toLowerCase())) continue;
    list.push(clean);
    if (list.length === 3) break;
  }
  if (!list.length) return "";
  const rest = (food) => food.charAt(0).toLowerCase() + food.slice(1);
  if (list.length === 1) return `${list[0]}.`;
  if (list.length === 2) return `${list[0]} and ${rest(list[1])}.`;
  return `${list[0]}, ${rest(list[1])}, and ${rest(list[2])}.`;
}

function recipeLookupName(card) {
  return String(card?.name || card?.title || "")
    .replace(/\s·\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function foodLinesFromDetail(detailed) {
  const lines = detailed?.serving || detailed?.ingredients || [];
  return foodClause(lines.map((line) => (typeof line === "string" ? line : line?.item)));
}

function plateFoodClause(card) {
  const own = foodLinesFromDetail(withRecipeDetail({
    name: card?.name,
    basedOn: card?.basedOn,
    serving: card?.serving,
    ingredients: card?.ingredients,
  }));
  if (own) return own;
  // A stored card can carry ingredient lines that name nothing (salt, a
  // label, an empty item). Those must not hide the bank plate.
  const lookup = recipeLookupName(card);
  if (!lookup) return "";
  return foodLinesFromDetail(withRecipeDetail({
    name: lookup,
    basedOn: card?.basedOn,
  }));
}

function clauseFromKnows(knowsYou) {
  const knows = normalizedReason(knowsYou);
  const at = knows.match(/^one of your usuals at\s+(.+?)\.?$/i);
  if (at) return `You've had this at ${at[1]}.`;
  const like = knows.match(/^you like\s+(.+?)\.?$/i);
  if (like) return `You like ${like[1]}.`;
  if (/^quick one from your staples/i.test(knows)) return "From what you have.";
  if (/^you've had this at\s+\S/i.test(knows)) return knows.endsWith(".") ? knows : `${knows}.`;
  if (/^you like\s+\S/i.test(knows)) return knows.endsWith(".") ? knows : `${knows}.`;
  if (/^from what you have\b/i.test(knows)) return "From what you have.";
  return "";
}

/** Skip-meal and hormone lectures are coach chat, never the line under a plate. */
function isCoachingEssay(text) {
  const s = normalizedReason(text).toLowerCase();
  if (!s) return false;
  return s.includes("i noticed you skipped")
    || s.includes("hormonal health")
    || s.includes("sex hormones")
    || s.includes("blunted metabolism")
    || s.includes("protein shake if a full breakfast")
    || s.includes("we really want to eat consistently");
}

function dishNameClause(card) {
  const raw = String(card?.name || card?.title || "")
    .replace(/\s·\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw.length < 3 || isCoachingEssay(raw)) return "";
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}.`;
}

export function plateTiedReason(reason) {
  const text = normalizedReason(reason);
  if (!text || isLeftoverMath(text) || isCoachingEssay(text)) return "";
  return text;
}

/**
 * The one clause under a card. A stated like, food on the plate, or the dish
 * name. Never leftover math, and never the skip-meal essay.
 */
export function shownCoachReason(card) {
  const pref = clauseFromKnows(card?.knowsYou) || clauseFromKnows(card?.reason);
  if (pref) return pref;
  return plateFoodClause(card) || dishNameClause(card);
}

/**
 * Stamp the line under the plate onto every card that can name food or the
 * dish. Cards with nothing to say are dropped. Always a new object, so a
 * stored `reason: ""` cannot be the one that paints.
 */
export function cardsWithShownReason(cards = []) {
  const named = [];
  for (const card of cards || []) {
    const reason = shownCoachReason(card);
    if (!reason) continue;
    named.push({ ...card, reason });
  }
  return named;
}

/**
 * First paint is 2–3 distinct plates. A half portion of a plate already
 * shown does not count as a second meal.
 */
export function firstPaintPlates(cards = []) {
  return distinctCoachMeals(cardsWithShownReason(cards), 3);
}

/**
 * The reason is not the place to restate the portion. The title already
 * carries "1.5 servings" when we scale up; saying it again underneath is
 * the same fact twice. A stock macro line is worse: say nothing.
 */
export function coachReason() {
  return "";
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
function isSnackish(meal) {
  const key = mealSlotFilterKey(meal);
  return key === "Snack" || key === "Treats" || meal.source === "pantry";
}

function compareMeals(a, b, prefer) {
  const tier = AFFINITY_RANK[b.affinity] - AFFINITY_RANK[a.affinity];
  if (tier !== 0) return tier;
  // A yogurt is a fine snack and a poor breakfast. When nothing belongs,
  // another meal of the day still beats a snack.
  const snackDiff = Number(isSnackish(a)) - Number(isSnackish(b));
  if (snackDiff !== 0) return snackDiff;
  if (prefer === "lighter") return (a.cal || 0) - (b.cal || 0);
  if (prefer === "protein") return (b.p || 0) - (a.p || 0);
  if (b.score !== a.score) return b.score - a.score;
  return (a.servings || 1) - (b.servings || 1);
}

function halfCardFrom(full, budget, ctx) {
  const half = {
    ...full,
    servings: 0.5,
    cal: (Number(full.cal) || 0) / 2,
    p: (Number(full.p) || 0) / 2,
    c: (Number(full.c) || 0) / 2,
    f: (Number(full.f) || 0) / 2,
  };
  half.title = portionTitle(full.name, 0.5);
  half.reason = shownCoachReason(half);
  half.proteinNote = proteinOverNote(half, budget);
  half.score = scoreScaledMeal(half, budget, ctx);
  return half;
}

/** Lunch and dinner: the full plate stays first, a half of it sits beside it. */
function withHalfBeside(meals, budget, ctx, limit) {
  const capped = meals.slice(0, limit);
  if (ctx.slot !== "lunch" && ctx.slot !== "dinner") return capped;
  const full = capped[0];
  if (!full || snapServings(full.servings || 1) !== 1) return capped;
  const half = halfCardFrom(full, budget, ctx);
  if (!coachMealFits(half, budget)) return capped;
  return [full, half, ...capped.slice(1)].slice(0, limit);
}

function skipKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s·\s[\d.]+×$/i, "")
    .replace(/\s·\s(?:half portion|[\d.]+ servings)$/i, "")
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
  next.reason = shownCoachReason({
    ...next,
    reason: coachReason(next, budget, { over: ctx.over }),
  });
  next.title = portionTitle(next.name, servings);
  next.tag = sourceTag(next.source, ctx.slot);
  next.proteinNote = proteinOverNote(next, budget);
  return next;
}

export function rankBankCards({
  bankMeals = [],
  myMeals = [],
  liveMyMeals = myMeals,
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
  const liveMyLookup = buildLiveMyMealsLookup(liveMyMeals);
  const liveMyPool = (myMeals || []).filter((meal) => isLiveMyMeal(meal, liveMyLookup));

  const pool = [
    ...bankMeals.map((m) => tagSource(m, "bank")),
    ...liveMyPool.map((m) => tagSource(m, "my")),
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

  meals = withHalfBeside(meals, budget, ctx, limit);

  return {
    cards: meals.map((m) => ({ kind: "meal", ...m })),
    meals,
    scaledCount: rankedPool.filter((m) => (m.servings || 1) !== 1).length,
  };
}
