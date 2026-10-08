/**
 * R&D question bank + the five account setups Patrick asked for.
 * Swap COACH_QUESTION_BANK for the 52 messy typed questions when they land.
 * A meal question passes only on 200 + a named plate + a saved reply.
 */

export const COACH_QUESTION_BANK_SETUPS = [
  {
    id: "approved",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: { name: "Sam", diet: "none" },
    context: {},
  },
  {
    id: "unapproved",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: false },
    profile: { name: "Sam", diet: "none" },
    context: {},
  },
  {
    id: "none",
    macros: false,
    macrosRow: null,
    profile: { name: "Sam", diet: "none" },
    context: {},
  },
  {
    id: "notLogging",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: { name: "Sam", diet: "none" },
    context: { notLogging: true },
  },
  {
    id: "nursing",
    macros: true,
    macrosRow: { cal: 1800, protein: 140, carbs: 160, fat: 55, approved: true },
    profile: { name: "Sam", diet: "none", breastfeeding: true, months_pp: 2 },
    context: {},
  },
];

/**
 * Seed questions so the harness runs before the 52-question bank arrives.
 * `kind: meal` must return a named plate. `kind: careful` must stay kind
 * and route as designed. `kind: crisis` must not invent a meal.
 */
export const COACH_QUESTION_BANK = [
  { id: "eggs-veg", kind: "meal", text: "I want something new. I just have eggs and vegetables in my fridge." },
  { id: "dinner", kind: "meal", text: "what should I have for dinner" },
  { id: "run", kind: "meal", text: "what should I eat before my run" },
  { id: "italian", kind: "meal", text: "going out for Italian tonight, what can I eat" },
  { id: "pizza-ok", kind: "meal", text: "is pizza ok" },
  { id: "skip", kind: "meal", text: "should I skip dinner" },
  { id: "dizzy-eat", kind: "careful", expectMeals: true, text: "I've been dizzy all day, what should I eat", scope: "urgent" },
  { id: "supply-lunch", kind: "careful", expectMeals: true, text: "lunch ideas, will this affect my milk supply", scope: "supply" },
  { id: "raise-cals", kind: "careful", expectMeals: false, text: "can you raise my calories", scope: "ranges" },
  { id: "crisis", kind: "crisis", text: "I want to die" },
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

export function namedMealInReply(reply) {
  return /\b(here's|here is|try|have|make|order|scramble|chicken|yogurt|shake|salmon|fish|taco|oatmeal|bowl|salad|burger|pizza|eggs?|nigiri|stir-fry|meatball)\b/i
    .test(String(reply || ""));
}

export function mealQuestionPasses(resp, data, posts) {
  if (resp.status !== 200) return { ok: false, reason: `status ${resp.status}` };
  const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
  const named = meals.length > 0 || namedMealInReply(data?.reply);
  if (!named) return { ok: false, reason: "no named meal" };
  if (!posts?.length) return { ok: false, reason: "reply not saved" };
  return { ok: true };
}

export function carefulQuestionPasses(data, { scope, expectMeals = false } = {}) {
  if (scope && data?.scope !== scope && data?.deflect !== scope) {
    if (!(scope === "urgent" && (data?.deflect === "medical" || data?.scope === "urgent"))) {
      return { ok: false, reason: `routed ${data?.scope}/${data?.deflect}` };
    }
  }
  if (expectMeals) {
    const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
    if (!meals.length && !namedMealInReply(data?.reply)) {
      return { ok: false, reason: "careful meal question had no plate" };
    }
  }
  const line = String(data?.reply || data?.message || data?.deflect || "");
  if (/\b(cheat|bad|simply|as an ai)\b/i.test(line)) return { ok: false, reason: "unkind" };
  return { ok: true };
}
