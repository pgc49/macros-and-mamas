/* ==================================================================
   Deterministic plates so a food question never comes back empty.

   The model is the first try. When it is silent, unreadable, or a teach
   or handoff would otherwise leave her without something she can make
   or order, these plates fill in — from what she said she has, Callie's
   recipes, her own meals, or a simple generic plate.
   ================================================================== */

import { CALLIE_RECIPES } from "./callieRecipes.js";
import { macrosPlausible } from "./coachGuardrails.js";
import { sanitizePlanMeal } from "./planMealShape.js";

const SLOT_CAT = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Teach topics that are still a meal question. */
export const MEAL_TEACH_TOPICS = new Set([
  "italian", "chinese", "sushi", "pizzaMeal", "inNOut", "psMethod",
  "neverSkip", "realFood", "underDay", "fasting", "menuLink", "menuClosed", "menuMiss",
]);

const FROM_WHAT_SHE_HAS = [
  {
    test: (text) => /\beggs?\b/.test(text) && /\b(veg|vegetable|spinach|pepper|onion|fridge)\b/.test(text),
    meal: {
      name: "Veggie scramble",
      desc: "Two or three eggs with the vegetables you have.",
      cal: 320, p: 22, c: 8, f: 20,
      ingredients: [{ item: "eggs", amount: "2–3" }, { item: "mixed vegetables", amount: "1 cup" }],
      steps: ["Scramble the eggs with the vegetables in a little oil."],
    },
  },
  {
    test: (text) => /\beggs?\b/.test(text),
    meal: {
      name: "Eggs and toast",
      desc: "Two eggs and a slice of toast.",
      cal: 310, p: 18, c: 22, f: 14,
      ingredients: [{ item: "eggs", amount: "2" }, { item: "sourdough toast", amount: "1 slice" }],
      steps: ["Cook the eggs however you like and toast the bread."],
    },
  },
  {
    test: (text) => /\b(leftover|left over)\b/.test(text) && /\bchicken\b/.test(text),
    meal: {
      name: "Leftover chicken and rice",
      desc: "The chicken you have, over rice.",
      cal: 430, p: 45, c: 30, f: 12,
      ingredients: [{ item: "cooked chicken", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }],
      steps: ["Warm the chicken and rice and eat them together."],
    },
  },
  {
    test: (text) => /\bchicken\b/.test(text),
    meal: {
      name: "Grilled chicken and rice",
      desc: "Chicken and rice — simple and filling.",
      cal: 430, p: 45, c: 30, f: 12,
      ingredients: [{ item: "chicken breast", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }],
      steps: ["Cook the chicken and serve it over rice."],
    },
  },
  {
    test: (text) => /\b(yogurt|yoghurt)\b/.test(text),
    meal: {
      name: "Greek yogurt with berries",
      desc: "Yogurt and fruit when you want something easy.",
      cal: 180, p: 24, c: 16, f: 2,
      ingredients: [{ item: "nonfat Greek yogurt", amount: "170g" }, { item: "berries", amount: "75g" }],
      steps: [],
    },
  },
];

const TEACH_PLATES = {
  italian: [
    plate("Fish with potatoes and broccoli", "Protein and a side — Callie's Italian plate.", 430, 40, 28, 14, [
      { item: "white fish", amount: "6 oz" }, { item: "potatoes", amount: "1 cup" }, { item: "broccoli", amount: "1 cup" },
    ]),
    plate("Meatballs and a veggie", "The other Italian plate she uses.", 420, 36, 20, 16, [
      { item: "meatballs", amount: "3" }, { item: "green vegetables", amount: "1 cup" },
    ]),
  ],
  chinese: [
    plate("Protein stir-fry with rice", "Animal protein, veggies, and rice, light on the sauce.", 460, 28, 59, 10, [
      { item: "ground turkey or chicken", amount: "4 oz" }, { item: "stir-fry vegetables", amount: "2 cups" }, { item: "cooked rice", amount: "1 cup" },
    ]),
    recipePlate("Callie's chicken teriyaki"),
  ],
  sushi: [
    plate("Nigiri and soup", "Nigiri and some soup — Callie's sushi plate.", 380, 32, 40, 8, [
      { item: "nigiri", amount: "6 pieces" }, { item: "miso soup", amount: "1 bowl" },
    ]),
    plate("Salmon nigiri", "A simple sushi order.", 350, 30, 36, 8, [
      { item: "salmon nigiri", amount: "6 pieces" },
    ]),
  ],
  inNOut: [
    plate("Protein Style burger", "No spread, ketchup or mustard if you want it to fit.", 400, 25, 15, 22, [
      { item: "Protein Style burger", amount: "1" },
    ]),
    plate("Protein Style burger, half fries", "Half the little basket, or a quarter.", 520, 26, 38, 26, [
      { item: "Protein Style burger", amount: "1" }, { item: "fries", amount: "half the little basket" },
    ]),
  ],
  pizzaMeal: [
    plate("Pizza as the meal", "Two slices. Pizza is the meal.", 500, 20, 56, 20, [
      { item: "pizza", amount: "2 slices" },
    ]),
    plate("One slice and a side salad", "If you want a smaller plate.", 380, 16, 38, 16, [
      { item: "pizza", amount: "1 slice" }, { item: "side salad", amount: "1" },
    ]),
  ],
  psMethod: [
    plate("Roasted chicken and a side", "Protein and a side. Dressing on the side.", 440, 45, 35, 14, [
      { item: "roasted chicken", amount: "6 oz" }, { item: "rice or potatoes", amount: "1 cup" },
    ]),
    plate("Steak and a salad", "Protein and a side.", 480, 40, 12, 28, [
      { item: "steak", amount: "6 oz" }, { item: "salad", amount: "2 cups" },
    ]),
  ],
  neverSkip: [
    recipePlate("Protein shake"),
    plate("Grilled chicken and rice", "Something simple and lower calorie.", 430, 45, 30, 12, [
      { item: "chicken breast", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" },
    ]),
    recipePlate("Greek yogurt + berries"),
  ],
  realFood: [
    plate("Pizza as the meal", "A slice of pizza is real food.", 500, 20, 56, 20, [
      { item: "pizza", amount: "2 slices" },
    ]),
    recipePlate("Sheet pan chicken"),
  ],
  underDay: [
    recipePlate("Greek yogurt + berries"),
    recipePlate("Protein shake"),
    recipePlate("Cottage cheese + cucumber"),
  ],
  fasting: [
    recipePlate("Sausage, egg + whites"),
    recipePlate("Grilled chicken big salad"),
    recipePlate("Protein shake"),
  ],
  menuLink: psOrderPlates(),
  menuClosed: psOrderPlates(),
  menuMiss: psOrderPlates(),
};

function psOrderPlates() {
  return [
    plate("Protein and a side", "Roasted chicken, then rice, salad or potatoes. Dressing on the side.", 440, 45, 35, 14, [
      { item: "protein", amount: "6 oz" }, { item: "rice or potatoes", amount: "1 cup" },
    ]),
    plate("Fish and a vegetable", "A simple order when you cannot see the menu.", 400, 38, 12, 16, [
      { item: "fish", amount: "6 oz" }, { item: "vegetables", amount: "1 cup" },
    ]),
  ];
}

const SAFE_SIMPLE = [
  plate("Grilled chicken and rice", "A simple plate while Callie looks at the rest.", 430, 45, 30, 12, [
    { item: "chicken breast", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" },
  ]),
  recipePlate("Greek yogurt + berries"),
  recipePlate("Protein shake"),
];

function plate(name, desc, cal, p, c, f, ingredients = [], steps = []) {
  return { name, desc, cal, p, c, f, ingredients, steps };
}

function recipePlate(name) {
  const recipe = CALLIE_RECIPES.find((row) => row.name === name);
  if (!recipe) return null;
  return {
    name: recipe.name,
    desc: recipe.desc,
    cal: recipe.cal,
    p: recipe.p,
    c: recipe.c,
    f: recipe.f,
    basedOn: recipe.name,
    ingredients: [],
    steps: [],
  };
}

function dietAllows(name, diet) {
  const d = String(diet || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const meat = /\b(chicken|turkey|sausage|meatball|steak|burger|pulled)\b/;
  const animal = /\b(chicken|turkey|sausage|meatball|steak|burger|salmon|tuna|fish|egg|yogurt|cheese|nigiri)\b/;
  if (d.includes("vegan") && animal.test(n)) return false;
  if (d.includes("vegetarian") && !d.includes("pesc") && meat.test(n)) return false;
  if (d.includes("pesc") && meat.test(n)) return false;
  return true;
}

function asMeal(raw, slot) {
  if (!raw?.name) return null;
  const meal = sanitizePlanMeal({
    slot,
    servings: 1,
    basedOn: raw.basedOn || null,
    ingredients: raw.ingredients || [],
    steps: raw.steps || [],
    ...raw,
  });
  return macrosPlausible(meal) ? meal : null;
}

function addMeal(out, seen, raw, slot, diet) {
  if (!raw || !dietAllows(raw.name, diet)) return;
  const key = String(raw.name).trim().toLowerCase();
  if (!key || seen.has(key)) return;
  const meal = asMeal(raw, slot);
  if (!meal) return;
  seen.add(key);
  out.push(meal);
}

function recipesForSlot(slot) {
  const cat = SLOT_CAT[slot] || "Dinner";
  return CALLIE_RECIPES.filter((row) => row.cat === cat);
}

/**
 * 2–3 plates she can actually make or order. Prefer what she named, then
 * a locked teach plate, then her meals, then Callie's recipes.
 */
export function buildCoachFallbackMeals({
  text = "",
  slot = "dinner",
  mode = "ask",
  topic = null,
  profile = null,
  customMeals = [],
  count = 3,
  safe = false,
} = {}) {
  const asked = String(text || "").toLowerCase();
  const diet = profile?.diet || "";
  const out = [];
  const seen = new Set();

  if (safe) {
    for (const meal of SAFE_SIMPLE) addMeal(out, seen, meal, slot, diet);
    return out.slice(0, count);
  }

  for (const rule of FROM_WHAT_SHE_HAS) {
    if (rule.test(asked)) addMeal(out, seen, rule.meal, slot, diet);
    if (out.length >= count) return out.slice(0, count);
  }

  const teach = TEACH_PLATES[topic] || [];
  for (const meal of teach) addMeal(out, seen, meal, slot, diet);
  if (out.length >= count) return out.slice(0, count);

  for (const meal of customMeals || []) {
    addMeal(out, seen, {
      name: meal.name,
      desc: meal.desc || "One of your meals.",
      cal: meal.cal, p: meal.p ?? meal.protein, c: meal.c ?? meal.carbs, f: meal.f ?? meal.fat,
      basedOn: meal.name,
    }, slot, diet);
    if (out.length >= count) return out.slice(0, count);
  }

  const preferred = mode === "kitchen" || /\b(fridge|kitchen|have|leftover)\b/.test(asked)
    ? recipesForSlot(slot)
    : recipesForSlot(slot);
  for (const recipe of preferred) {
    addMeal(out, seen, recipePlate(recipe.name), slot, diet);
    if (out.length >= count) return out.slice(0, count);
  }

  for (const meal of SAFE_SIMPLE) addMeal(out, seen, meal, slot, diet);
  return out.slice(0, count);
}

export function fallbackMealReply(meals) {
  const names = (meals || []).map((meal) => meal.name).filter(Boolean);
  if (!names.length) return "Here's something simple you can make right now.";
  if (names.length === 1) return `Here's ${names[0]}.`;
  if (names.length === 2) return `Here's ${names[0]}, or ${names[1]}.`;
  return `Here's ${names[0]}, ${names[1]}, or ${names[2]}.`;
}

/** A food question that came back empty gets these plates and a named reply. */
export function ensureFoodMeals(meals, {
  text,
  slot,
  mode,
  topic,
  profile,
  customMeals,
  reply = "",
  safe = false,
  force = false,
} = {}) {
  const list = Array.isArray(meals) ? meals.filter((meal) => meal?.name) : [];
  if (!force && list.length) return { meals: list, reply, filled: false };
  const next = buildCoachFallbackMeals({ text, slot, mode, topic, profile, customMeals, safe });
  return {
    meals: next,
    reply: String(reply || "").trim() || fallbackMealReply(next),
    filled: next.length > 0,
  };
}
