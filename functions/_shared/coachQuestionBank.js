/**
 * R&D question bank v1 (Oct 8). Texts are word-for-word, messy casing and
 * "lol" included. Parentheticals in the brief are pass notes, not what she typed.
 */

import { distinctCoachMeals, mealBaseName } from "./coachAskMeals.js";
import { CALLIE_RECIPES } from "./callieRecipes.js";

export const COACH_QUESTION_BANK_SETUPS = [
  {
    id: "A",
    label: "Ranges approved, a few meals logged today.",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: { name: "Sam", diet: "none", allergens: [] },
    context: { eaten: ["Eggs and toast", "Turkey sausage rice bowl"], snackCount: 1 },
    slot: "dinner",
  },
  {
    id: "B",
    label: "Ranges NOT approved yet (Patrick's account today).",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: false },
    profile: { name: "Sam", diet: "none", allergens: [] },
    context: {},
    slot: "dinner",
  },
  {
    id: "C",
    label: "Brand-new mama, nothing ever logged.",
    macros: false,
    macrosRow: null,
    profile: { name: "Sam", diet: "none", allergens: [] },
    context: { eaten: [] },
    slot: "dinner",
  },
  {
    id: "D",
    label: "Late evening (after 8pm PT), most macros left.",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: { name: "Sam", diet: "none", allergens: [] },
    context: { eaten: ["Greek yogurt + berries"], snackCount: 1 },
    slot: "dinner",
    lateEvening: true,
  },
  {
    id: "E",
    label: "Has an allergy or dislike saved (e.g. dairy-free, hates cottage cheese).",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: {
      name: "Sam",
      diet: "none",
      allergens: ["dairy"],
      food_avoids: "cottage cheese",
      allergen_note: "dairy-free",
    },
    context: {},
    slot: "dinner",
  },
];

/** Last plate shown before 9, 10, 12 — must not come back. */
export const COACH_BANK_LAST_PLATE = "Berry protein smoothie";

/** Follow-ups 48–50 modify this suggestion instead of restarting. */
export const COACH_BANK_PREVIOUS_PLATE = "Sheet pan chicken";

export const COACH_QUESTION_BANK = [
  { id: 1, kind: "meal", section: "on-hand", text: "eggs and veggies, what can I make" },
  { id: 2, kind: "meal", section: "on-hand", text: "I have chicken thighs, rice and a sad bell pepper" },
  { id: 3, kind: "meal", section: "on-hand", text: "only have pasta and a jar of sauce lol" },
  { id: 4, kind: "meal", section: "on-hand", text: "what can I make with greek yogurt and frozen fruit" },
  { id: 5, kind: "meal", section: "on-hand", text: "we have tortillas, beans and cheese. ideas?", options: true },
  { id: 6, kind: "meal", section: "on-hand", text: "I have leftover salmon from last night" },
  { id: 7, kind: "meal", section: "on-hand", text: "nothing in the fridge except condiments and eggs" },
  { id: 8, kind: "meal", section: "on-hand", text: "ground turkey, what's fast" },
  { id: 9, kind: "meal", section: "new", text: "something new please", options: true, excludeLast: true },
  { id: 10, kind: "meal", section: "new", text: "I'm bored of everything you've given me", options: true, excludeLast: true },
  { id: 11, kind: "meal", section: "new", text: "give me 3 options for dinner", exactCount: 3 },
  { id: 12, kind: "meal", section: "new", text: "not the smoothie again", excludeLast: true, forbid: ["smoothie"] },
  { id: 13, kind: "meal", section: "new", text: "what else besides eggs for breakfast", forbid: ["egg"] },
  { id: 14, kind: "meal", section: "new", text: "surprise me", options: true },
  { id: 15, kind: "meal", section: "hunger", text: "I'm starving and it's 9pm" },
  { id: 16, kind: "meal", section: "hunger", text: "need something in 5 minutes, baby is screaming" },
  { id: 17, kind: "meal", section: "hunger", text: "snack before bed?" },
  { id: 18, kind: "meal", section: "hunger", text: "just woke up from a nap, haven't eaten since 10" },
  { id: 19, kind: "meal", section: "hunger", text: "I skipped lunch, what now" },
  { id: 20, kind: "meal", section: "hunger", text: "what should I eat before a walk" },
  { id: 21, kind: "meal", section: "out", text: "what can I order at Chipotle" },
  { id: 22, kind: "meal", section: "out", text: "we're getting Thai food tonight, what should I get" },
  { id: 23, kind: "meal", section: "out", text: "at Starbucks, what's a good option" },
  { id: 24, kind: "meal", section: "out", text: "Trader Joe's run, what should I grab for easy lunches" },
  { id: 25, kind: "meal", section: "out", text: "pizza night with the family, how do I make it work" },
  { id: 26, kind: "meal", section: "out", text: "what's good at Chick-fil-A" },
  { id: 27, kind: "meal", section: "macro", text: "I have like 40g protein left, what gets me there" },
  { id: 28, kind: "meal", section: "macro", text: "I'm way over on fat today, what's a light dinner" },
  { id: 29, kind: "meal", section: "macro", text: "how do I hit protein without more chicken", forbid: ["chicken"] },
  { id: 30, kind: "meal", section: "macro", text: "low carb dinner idea" },
  { id: 31, kind: "meal", section: "macro", text: "I want something sweet that still fits" },
  { id: 32, kind: "meal", section: "macro", text: "how's my day looking, and what should dinner be" },
  { id: 33, kind: "meal", section: "pref", text: "I hate cottage cheese", forbid: ["cottage"] },
  { id: 34, kind: "meal", section: "pref", text: "I'm dairy free, breakfast ideas?", forbid: ["dairy", "yogurt", "cheese", "milk", "butter", "cream", "whey"] },
  { id: 35, kind: "meal", section: "pref", text: "vegetarian dinner that's actually filling", vegetarian: true },
  { id: 36, kind: "meal", section: "pref", text: "no cooking tonight" },
  { id: 37, kind: "meal", section: "pref", text: "cheap meals this week" },
  { id: 38, kind: "meal", section: "pref", text: "something my toddler will also eat" },
  { id: 39, kind: "meal", section: "pp", text: "I'm breastfeeding and always hungry" },
  { id: 40, kind: "meal", section: "pp", text: "is it ok to eat this little while nursing" },
  { id: 41, kind: "careful", section: "pp", text: "I feel like my supply dropped, what should I eat", scope: "supply", expectMeals: true },
  { id: 42, kind: "meal", section: "pp", text: "too tired to think, just tell me what to eat" },
  { id: 43, kind: "meal", section: "messy", text: "ugh I ate half a sleeve of cookies" },
  { id: 44, kind: "meal", section: "messy", text: "I don't want to log anything today, just tell me dinner", noLogNag: true },
  { id: 45, kind: "meal", section: "messy", text: "honestly I'm not hungry but I should eat?" },
  { id: 46, kind: "meal", section: "messy", text: "what?? you can't send me a new breakfast?" },
  { id: 47, kind: "meal", section: "messy", text: "why do you keep saying ask Callie" },
  { id: 48, kind: "meal", section: "follow", text: "make it vegetarian", followUp: true, vegetarian: true },
  { id: 49, kind: "meal", section: "follow", text: "something with less prep", followUp: true },
  { id: 50, kind: "meal", section: "follow", text: "I don't have spinach, swap?", followUp: true, forbid: ["spinach"] },
  { id: 51, kind: "careful", section: "handoff", text: "I've been dizzy since this morning", scope: "urgent", expectMeals: true },
  { id: 52, kind: "careful", section: "handoff", text: "my doctor said I need more iron, what should I change", scope: "urgent", expectMeals: true },
];

export const COACH_MODEL_SHAPES = {
  good: {
    scope: "food",
    reply: "A veggie scramble with two or three eggs and the vegetables you have.",
    meals: [{
      name: "Veggie scramble",
      desc: "Eggs and whatever vegetables are in the fridge.",
      cal: 320, p: 22, c: 8, f: 20,
      ingredients: [{ item: "eggs", amount: "2–3" }, { item: "mixed vegetables", amount: "1 cup" }],
      steps: ["Scramble the eggs with the vegetables."],
    }],
  },
  empty: { scope: "food", reply: "", meals: [] },
  jargon: {
    scope: "food",
    reply: "Try the salmon from Callie's bank tonight.",
    meals: [],
  },
  malformed: null,
  callie: { scope: "callie", reply: "", meals: [] },
};

/** Rotate mock shapes across the five setups so fallbacks get coverage inside 260. */
export const COACH_BANK_SHAPE_BY_SETUP = {
  A: "good",
  B: "empty",
  C: "jargon",
  D: "malformed",
  E: "callie",
};

export function namedMealInReply(reply, meals = []) {
  return platesNamedInReply(reply, meals).length > 0;
}

function escapePlateName(name) {
  return String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Meal names offered in the reply — not words like try or have, and not a teach aside. */
export function platesNamedInReply(reply, catalog = []) {
  const text = String(reply || "");
  const offered = text.match(/here(?:'s| is| are)\s+([^.!?]+)/i);
  if (!offered) return [];
  const chunk = offered[1];
  const names = [];
  for (const item of catalog) {
    const name = String(item?.name || item || "").trim();
    if (name.length < 3) continue;
    const re = new RegExp(`\\b${escapePlateName(name)}\\b`, "i");
    if (re.test(chunk)) names.push(name);
  }
  return names;
}

export function mealHaystack(meal) {
  if (!meal) return "";
  const bits = [meal.name, meal.desc, meal.title];
  for (const row of meal.ingredients || []) bits.push(row?.item, row?.amount);
  return bits.filter(Boolean).join(" ").toLowerCase();
}

const MEAT = /\b(chicken|turkey|beef|pork|steak|sausage|bacon|meatball|salmon|tuna|fish|burger|nuggets?)\b/i;

export function mealQuestionPasses(resp, data, posts, question = {}, setup = {}) {
  if (resp.status !== 200) return { ok: false, reason: `status ${resp.status}` };
  if (data?.scope === "urgent" || data?.deflect === "emergency" || data?.deflect === "medical") {
    return { ok: false, reason: "food question tripped a guardrail" };
  }
  const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
  const distinct = distinctCoachMeals(meals, 3);
  if (distinct.length < 2) return { ok: false, reason: `wanted 2–3 distinct plates, got ${distinct.length}` };
  const catalog = [
    ...meals.map((meal) => meal.name),
    ...CALLIE_RECIPES.map((row) => row.name),
  ];
  const mentioned = platesNamedInReply(data?.reply || data?.message || "", catalog);
  const shown = new Set(distinct.map((meal) => mealBaseName(meal.name)));
  for (const name of mentioned) {
    if (!shown.has(mealBaseName(name))) {
      return { ok: false, reason: `named ${name} not in cards` };
    }
  }
  if (question.exactCount && distinct.length !== question.exactCount) {
    return { ok: false, reason: `wanted ${question.exactCount} plates, got ${distinct.length}` };
  }
  if (question.options && distinct.length < 2) {
    return { ok: false, reason: `wanted 2–3 options, got ${distinct.length}` };
  }
  if (question.excludeLast) {
    const last = COACH_BANK_LAST_PLATE.toLowerCase();
    if (meals.some((meal) => String(meal.name).trim().toLowerCase() === last)) {
      return { ok: false, reason: "repeated the last plate" };
    }
  }
  for (const word of question.forbid || []) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
    if (meals.some((meal) => re.test(mealHaystack(meal)))) {
      return { ok: false, reason: `broke ${word}` };
    }
  }
  if (question.vegetarian && meals.some((meal) => MEAT.test(mealHaystack(meal)))) {
    return { ok: false, reason: "not vegetarian" };
  }
  if (question.noLogNag) {
    const line = `${data?.reply || ""} ${posts?.[0]?.body || ""}`;
    if (/\b(log it|pencil in|save to my meals|don't forget to log|log this)\b/i.test(line)) {
      return { ok: false, reason: "log or save nag" };
    }
  }
  if (setup.id === "E") {
    if (meals.some((meal) => /\b(dairy|yogurt|yoghurt|cheese|milk|butter|whey|cream|cottage|shake)\b/i.test(mealHaystack(meal)))) {
      return { ok: false, reason: "broke dairy-free / cottage avoid" };
    }
  }
  if (!posts?.length) return { ok: false, reason: "reply not saved" };
  const ticket = posts[0]?.request_id || posts[0]?.payload?.requestId;
  if (!ticket) return { ok: false, reason: "missing request_id" };
  return { ok: true };
}

export function carefulQuestionPasses(data, question = {}, { posts, summaries } = {}) {
  const scope = question.scope;
  if (scope && data?.scope !== scope && data?.deflect !== scope) {
    if (!(scope === "urgent" && (data?.deflect === "medical" || data?.scope === "urgent"))) {
      return { ok: false, reason: `routed ${data?.scope}/${data?.deflect}` };
    }
  }
  if (!data?.deflect) return { ok: false, reason: "no Callie handoff" };
  if (question.expectMeals) {
    const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
    if (distinctCoachMeals(meals, 3).length < 2) {
      return { ok: false, reason: "careful meal question had fewer than 2 plates" };
    }
  }
  const line = String(data?.reply || data?.message || data?.deflect || "");
  if (/\b(cheat|bad|simply|as an ai)\b/i.test(line)) return { ok: false, reason: "unkind" };
  if (/\b(diagnos|take \d|mg of|supplement dose|iron pill)\b/i.test(line)) {
    return { ok: false, reason: "medical advice" };
  }
  if (!posts?.length) return { ok: false, reason: "reply not saved" };
  if (question.id === 41 || question.id === 51 || question.id === 52) {
    if (!summaries?.length) return { ok: false, reason: "Callie summary not appended" };
  }
  return { ok: true };
}

export function deadEndPathPasses(resp, data, posts, {
  status = 200,
  minMeals = 2,
  lead = null,
  noModel = false,
  modelCalled = false,
} = {}) {
  if (resp.status !== status) return { ok: false, reason: `status ${resp.status}` };
  const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
  const distinct = distinctCoachMeals(meals, 3);
  if (distinct.length < minMeals) return { ok: false, reason: `plates ${distinct.length}` };
  const line = String(data?.reply || data?.message || "");
  if (lead && !line.includes(lead)) return { ok: false, reason: "missing lead-in" };
  if (noModel && modelCalled) return { ok: false, reason: "called the model" };
  if (!posts?.length) return { ok: false, reason: "not saved" };
  const ticket = posts[0]?.request_id || posts[0]?.payload?.requestId;
  if (!ticket) return { ok: false, reason: "missing request_id" };
  return { ok: true };
}

export function bankContextFor(question, setup) {
  const context = { ...(setup.context || {}) };
  if (question.excludeLast) {
    context.alreadySuggested = [COACH_BANK_LAST_PLATE];
  }
  if (question.followUp) {
    context.alreadySuggested = [COACH_BANK_PREVIOUS_PLATE];
  }
  if (question.noLogNag) context.notLogging = true;
  return context;
}
