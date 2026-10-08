/* ==================================================================
   Deterministic plates so a food question never comes back empty.

   The model is the first try. When it is silent, unreadable, or a teach
   or handoff would otherwise leave her without something she can make
   or order, these plates fill in — from what she said she has, Callie's
   recipes, her own meals, or a simple generic plate.
   ================================================================== */

import { COACH_GUILT_LINE, COACH_LOCAL_PICKS_LINE, onceLead } from "../../src/content/coachVoice.js";
import { mealBaseName } from "./coachAskMeals.js";
import { CALLIE_RECIPES } from "./callieRecipes.js";
import { isGuiltAsk, macrosPlausible } from "./coachGuardrails.js";
import { constraintTextFrom, extractAskConstraints, filterCoachMeals, ingredientList, mealBreaksConstraints, mealBreaksSavedPrefs } from "./coachMealFilter.js";
import { isMenuRestaurant, restaurantFromAsk } from "../../src/utils/coachIntent.js";
import { sanitizePlanMeal } from "./planMealShape.js";

export { COACH_LOCAL_PICKS_LINE };

export const SAVED_MEAL_NAME_MAX = 48;
const HANDS_FULL = /\b(one[- ]handed|one hand|holding (the )?baby|hands (are )?full|too tired|so tired|baby in (my )?arms)\b/i;

export function capMealName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, SAVED_MEAL_NAME_MAX);
}

function ingredientDesc(meal) {
  const items = ingredientList(meal)
    .map((row) => {
      if (typeof row === "string") return row.trim();
      return [row?.amount, row?.item || row?.name].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);
  if (items.length) return items.join(", ");
  const desc = String(meal?.desc || "").trim();
  const name = String(meal?.name || "").trim();
  if (!desc || desc.toLowerCase() === name.toLowerCase() || !/\s/.test(desc)) {
    return "A simple plate you can make now.";
  }
  return desc;
}

const SLOT_CAT = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Teach topics that are still a meal question. */
export const MEAL_TEACH_TOPICS = new Set([
  "italian", "chinese", "sushi", "sushiNursing", "pizzaMeal", "inNOut", "psMethod",
  "neverSkip", "realFood", "underDay", "fasting", "coffee", "waterEat",
  "menuLink", "menuClosed", "menuMiss",
]);

const FROM_WHAT_SHE_HAS = [
  {
    test: (text) => /\b(ground beef|beef)\b/.test(text) && /\brice\b/.test(text),
    meal: {
      name: "Ground beef and rice",
      desc: "The ground beef and rice you have. Brown the beef and serve it over rice.",
      cal: 460, p: 34, c: 42, f: 16,
      ingredients: [{ item: "ground beef", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }],
      steps: ["Brown the beef and serve it over the rice."],
    },
  },
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
    test: (text) => /\bchicken thighs?\b/.test(text) && /\brice\b/.test(text),
    meal: {
      name: "Chicken thighs and rice",
      desc: "The thighs, rice, and that bell pepper.",
      cal: 480, p: 38, c: 40, f: 16,
      ingredients: [{ item: "chicken thighs", amount: "6 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "bell pepper", amount: "1" }],
      steps: ["Cook the thighs, warm the rice, and sauté the pepper."],
    },
  },
  {
    test: (text) => /\bpasta\b/.test(text) && /\bsauce\b/.test(text),
    meal: {
      name: "Pasta with jarred sauce",
      desc: "The pasta and sauce you have. A can of tuna or leftover protein on top if it's around.",
      cal: 420, p: 16, c: 68, f: 8,
      ingredients: [{ item: "pasta", amount: "2 oz dry" }, { item: "jarred sauce", amount: "1 cup" }],
      steps: ["Boil the pasta and warm the sauce."],
    },
  },
  {
    test: (text) => /\b(yogurt|yoghurt)\b/.test(text) && /\b(fruit|berr)/.test(text),
    meal: {
      name: "Greek yogurt with frozen fruit",
      desc: "Yogurt and the frozen fruit, straight from the freezer.",
      cal: 200, p: 24, c: 22, f: 2,
      ingredients: [{ item: "nonfat Greek yogurt", amount: "170g" }, { item: "frozen fruit", amount: "1 cup" }],
      steps: [],
    },
  },
  {
    test: (text) => /\btortillas?\b/.test(text) && /\bbeans?\b/.test(text) && /\bcheese\b/.test(text),
    meal: {
      name: "Bean and cheese quesadilla",
      desc: "Tortillas, beans, and cheese in a skillet.",
      cal: 380, p: 18, c: 42, f: 14,
      ingredients: [{ item: "tortillas", amount: "2" }, { item: "beans", amount: "1/2 cup" }, { item: "cheese", amount: "1 oz" }],
      steps: ["Warm the tortillas with beans and cheese until the cheese melts."],
    },
  },
  {
    test: (text) => /\btortillas?\b/.test(text) && /\bbeans?\b/.test(text),
    meal: {
      name: "Bean and salsa tacos",
      desc: "Tortillas, beans, and salsa. Skip the cheese if it's off the table.",
      cal: 360, p: 16, c: 52, f: 8,
      ingredients: [{ item: "tortillas", amount: "2" }, { item: "beans", amount: "3/4 cup" }, { item: "salsa", amount: "2 tbsp" }],
      steps: ["Warm the tortillas with beans and salsa."],
    },
  },
  {
    test: (text) => /\b(leftover|left over)\b/.test(text) && /\bsalmon\b/.test(text),
    meal: {
      name: "Leftover salmon and rice",
      desc: "Last night's salmon over rice or greens.",
      cal: 420, p: 38, c: 28, f: 16,
      ingredients: [{ item: "cooked salmon", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }],
      steps: ["Warm the salmon and rice."],
    },
  },
  {
    test: (text) => /\bcondiments\b/.test(text) && /\beggs?\b/.test(text),
    meal: {
      name: "Eggs and toast",
      desc: "Eggs from the fridge, toast from the pantry.",
      cal: 310, p: 18, c: 22, f: 14,
      ingredients: [{ item: "eggs", amount: "2" }, { item: "sourdough toast", amount: "1 slice" }],
      steps: ["Cook the eggs and toast the bread."],
    },
  },
  {
    test: (text) => /\bground turkey\b/.test(text),
    meal: {
      name: "Fast turkey skillet",
      desc: "Brown the turkey with whatever veg is around.",
      cal: 360, p: 32, c: 12, f: 18,
      ingredients: [{ item: "ground turkey", amount: "5 oz" }, { item: "frozen vegetables", amount: "1 cup" }],
      steps: ["Brown the turkey and stir in the vegetables."],
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
    test: (text) => /\brotisserie\b/.test(text) && /\bspinach\b/.test(text) && /\brice\b/.test(text),
    meal: {
      name: "Rotisserie chicken, spinach, and rice",
      desc: "The leftover chicken over rice with the spinach wilted in.",
      cal: 460, p: 42, c: 36, f: 14,
      ingredients: [{ item: "rotisserie chicken", amount: "5 oz" }, { item: "spinach", amount: "2 cups" }, { item: "cooked rice", amount: "1 cup" }],
      steps: ["Warm the chicken and rice, wilt the spinach in the same pan."],
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

function orderPlate(name, desc, cal, p, c, f, ingredients = []) {
  return { ...plate(name, desc, cal, p, c, f, ingredients), source: "menu", orderOnly: true, fixedPortion: true };
}

function grabPlate(name, desc, cal, p, c, f, ingredients = []) {
  return { ...plate(name, desc, cal, p, c, f, ingredients), source: "pantry", fixedPortion: true };
}

const PLACE_PLATES = [
  {
    test: (text) => /\bchipotle\b/.test(text),
    meals: [
      orderPlate("Chipotle chicken bowl", "Say: chicken, black beans, fajita veggies, half rice, salsa, skip sour cream.", 520, 48, 36, 14, [
        { item: "chicken", amount: "double" }, { item: "black beans", amount: "regular" }, { item: "fajita veggies", amount: "regular" }, { item: "rice", amount: "half" }, { item: "salsa", amount: "regular" },
      ]),
      orderPlate("Chipotle steak bowl", "Say: steak, fajita veggies, half rice, salsa, skip sour cream.", 480, 40, 30, 16, [
        { item: "steak", amount: "1 serving" }, { item: "fajita veggies", amount: "regular" }, { item: "rice", amount: "half" }, { item: "salsa", amount: "regular" },
      ]),
      orderPlate("Chipotle sofritas bowl", "Say: sofritas, beans, fajita veggies, salsa. No sour cream.", 430, 22, 48, 12, [
        { item: "sofritas", amount: "1 serving" }, { item: "beans", amount: "regular" }, { item: "fajita veggies", amount: "regular" }, { item: "salsa", amount: "regular" },
      ]),
    ],
  },
  {
    test: (text) => /\bpho\b/.test(text),
    meals: [
      orderPlate("Pho with extra protein", "Pho with extra steak, broth first, a small scoop of noodles.", 480, 36, 38, 14, [
        { item: "pho broth", amount: "1 bowl" }, { item: "fish sauce", amount: "in the broth" }, { item: "steak", amount: "extra" }, { item: "rice noodles", amount: "a small scoop" },
      ]),
      orderPlate("Pho, extra meat, easy on noodles", "Ask for extra protein and go easy on the noodles. Broth is fine for supply.", 450, 34, 32, 14, [
        { item: "pho", amount: "1 bowl" }, { item: "fish sauce", amount: "in the broth" }, { item: "extra meat", amount: "1 order" }, { item: "noodles", amount: "half" },
      ]),
      orderPlate("Pho with an egg", "Pho with an egg in the broth. Skip a second helping of noodles if you want.", 420, 28, 36, 12, [
        { item: "pho broth", amount: "1 bowl" }, { item: "fish sauce", amount: "in the broth" }, { item: "egg", amount: "1" }, { item: "rice noodles", amount: "a small scoop" },
      ]),
    ],
  },
  {
    test: (text) => /\bthai\b/.test(text),
    meals: [
      orderPlate("Chicken pad krapow", "Basil chicken with fish sauce, rice on the side. Ask for half the rice or sauce on the side.", 480, 36, 42, 16, [
        { item: "pad krapow chicken", amount: "1 order" }, { item: "fish sauce", amount: "in the stir-fry" }, { item: "rice", amount: "on the side" },
      ]),
      orderPlate("Chicken larb", "Larb with fish sauce, extra veg, dressing on the side.", 380, 28, 16, 16, [
        { item: "chicken larb", amount: "1 order" }, { item: "fish sauce", amount: "in the dressing" }, { item: "vegetables", amount: "extra" },
      ]),
      orderPlate("Chicken satay plate", "Chicken satay, peanut sauce on the side. No garlic shrimp.", 420, 32, 18, 16, [
        { item: "chicken satay", amount: "1 order" }, { item: "peanut sauce", amount: "on the side" }, { item: "cucumber", amount: "a side" },
      ]),
    ],
  },
  {
    test: (text) => /\bstarbucks\b/.test(text),
    meals: [
      orderPlate("Egg bites", "Say: egg bites. Pair with a protein box if you want more.", 300, 20, 16, 16, [
        { item: "egg bites", amount: "1 order" }, { item: "cheese", amount: "in the bites" }, { item: "cottage cheese", amount: "in the bites" }, { item: "eggs", amount: "2" },
      ]),
      orderPlate("Protein box", "The eggs and cheese protein box.", 370, 23, 31, 19, [
        { item: "protein box", amount: "1" }, { item: "eggs", amount: "2" }, { item: "cheese", amount: "1 oz" },
      ]),
      orderPlate("Turkey bacon sandwich", "The turkey bacon, egg white, and cheddar.", 230, 17, 28, 5, [
        { item: "turkey bacon sandwich", amount: "1" }, { item: "cheddar", amount: "1 slice" }, { item: "egg", amount: "1" }, { item: "muffin", amount: "1" },
      ]),
      orderPlate("Oatmeal with fruit", "Say: oatmeal. Add banana if they have it.", 220, 6, 40, 4, [
        { item: "oatmeal", amount: "1" }, { item: "banana", amount: "1" },
      ]),
      orderPlate("Chicken wrap", "Say: chicken wrap. No sauce if you want it lighter.", 360, 24, 32, 12, [
        { item: "chicken wrap", amount: "1" }, { item: "chicken", amount: "1" }, { item: "tortilla", amount: "1" },
      ]),
      orderPlate("Protein box, hold the cheese", "Say: protein box, hold the cheese.", 280, 18, 28, 8, [
        { item: "eggs", amount: "2" }, { item: "nuts", amount: "1 oz" }, { item: "apple", amount: "1" },
      ]),
    ],
  },
  {
    test: (text) => /\btrader joe/.test(text),
    meals: [
      grabPlate("Grilled chicken strips", "A bag of grilled chicken and a salad kit.", 320, 36, 8, 12, [
        { item: "grilled chicken strips", amount: "4 oz" }, { item: "salad kit", amount: "1 serving" },
      ]),
      grabPlate("Turkey burger", "Frozen turkey burger on a bun or lettuce.", 380, 28, 24, 16, [
        { item: "turkey burger", amount: "1" },
      ]),
      grabPlate("Salmon and a salad kit", "Frozen salmon and a bagged salad.", 420, 34, 12, 22, [
        { item: "frozen salmon", amount: "5 oz" }, { item: "salad kit", amount: "1 serving" },
      ]),
    ],
  },
  {
    test: (text) => /\bin[- ]?n[- ]?out\b/.test(text),
    meals: [
      orderPlate("Protein Style burger", "Say: Protein Style, no spread, mustard or ketchup if you want it.", 400, 25, 15, 22, [
        { item: "Protein Style burger", amount: "1" },
      ]),
      orderPlate("Protein Style, mustard only", "Say: Protein Style, mustard only, no spread.", 380, 25, 12, 20, [
        { item: "Protein Style burger", amount: "1" }, { item: "mustard", amount: "on the burger" },
      ]),
      orderPlate("Protein Style and a few fries", "Say: Protein Style, and a few fries if you want them.", 520, 26, 38, 26, [
        { item: "Protein Style burger", amount: "1" }, { item: "fries", amount: "a few" },
      ]),
    ],
  },
  {
    test: (text) => /\bchick[- ]?fil[- ]?a\b/.test(text),
    meals: [
      orderPlate("Grilled nuggets", "Say: 8-count grilled nuggets and a fruit cup. No sauce if you want it lighter.", 250, 28, 14, 4, [
        { item: "grilled nuggets", amount: "8-count" }, { item: "fruit cup", amount: "1" },
      ]),
      orderPlate("Grilled chicken sandwich", "Say: grilled sandwich, no sauce if you want it lighter.", 380, 37, 41, 6, [
        { item: "grilled chicken sandwich", amount: "1" },
      ]),
      orderPlate("Cool wrap", "Say: grilled cool wrap. Ask for dressing on the side.", 350, 28, 28, 12, [
        { item: "cool wrap", amount: "1" }, { item: "cheese", amount: "in the wrap" }, { item: "chicken", amount: "1" }, { item: "tortilla", amount: "1" },
      ]),
      orderPlate("Market salad, no cheese", "Say: market salad, no cheese, add grilled nuggets.", 380, 28, 28, 12, [
        { item: "grilled chicken", amount: "1" }, { item: "greens", amount: "1 bowl" }, { item: "fruit", amount: "1 scoop" },
      ]),
    ],
  },
  {
    test: (text) => /\bpanera\b/.test(text),
    meals: [
      orderPlate("Turkey sandwich", "Say: turkey on whole grain, extra turkey, easy on the spread.", 480, 36, 44, 14, [
        { item: "turkey sandwich", amount: "1" },
      ]),
      orderPlate("Greek salad with chicken", "Say: Greek salad, add chicken, dressing on the side.", 420, 32, 18, 22, [
        { item: "Greek salad", amount: "1" }, { item: "feta", amount: "1 scoop" }, { item: "chicken", amount: "1 scoop" },
      ]),
      orderPlate("Warm grain bowl", "Say: warm grain bowl with extra chicken, half the dressing.", 500, 34, 48, 16, [
        { item: "grain bowl", amount: "1" }, { item: "chicken", amount: "extra" },
      ]),
    ],
  },
  {
    test: (text) => /\bsweetgreen\b/.test(text),
    meals: [
      orderPlate("Chicken harvest bowl", "Say: chicken, extra chicken, dressing on the side.", 480, 38, 36, 16, [
        { item: "chicken", amount: "double" }, { item: "warm grains", amount: "half" },
      ]),
      orderPlate("Kale Caesar with chicken", "Say: kale Caesar, extra chicken, dressing on the side.", 420, 36, 18, 20, [
        { item: "kale Caesar", amount: "1" }, { item: "parmesan", amount: "1 scoop" }, { item: "egg", amount: "in the dressing" }, { item: "chicken", amount: "extra" },
      ]),
    ],
  },
  {
    test: (text) => /\bsubway\b/.test(text),
    meals: [
      orderPlate("Turkey sub", "Say: 6-inch turkey, extra turkey, veggies, mustard, skip mayo.", 380, 28, 40, 8, [
        { item: "turkey sub", amount: "6-inch" }, { item: "wheat bread", amount: "6-inch" },
      ]),
      orderPlate("Chicken sub", "Say: 6-inch grilled chicken, extra protein, veggies, no mayo.", 400, 32, 40, 8, [
        { item: "chicken sub", amount: "6-inch" }, { item: "wheat bread", amount: "6-inch" },
      ]),
      orderPlate("Veggie sub, no cheese", "Say: 6-inch veggies, extra beans if they have them, no cheese, mustard.", 320, 16, 48, 6, [
        { item: "veggie sub", amount: "6-inch" }, { item: "wheat bread", amount: "6-inch" }, { item: "vegetables", amount: "loaded" },
      ]),
    ],
  },
  {
    test: (text) => /\btaco bell\b/.test(text),
    meals: [
      orderPlate("Cantina chicken bowl", "Say: cantina chicken bowl, extra chicken, easy on the chips.", 480, 32, 42, 16, [
        { item: "cantina chicken", amount: "1 bowl" },
      ]),
      orderPlate("Crunchwrap, no sour cream", "Say: crunchwrap, no sour cream, add extra protein if they will.", 540, 20, 50, 22, [
        { item: "crunchwrap", amount: "1" }, { item: "cheese", amount: "in the wrap" },
      ]),
      orderPlate("Cantina chicken tacos", "Say: two cantina chicken tacos, extra chicken, salsa.", 420, 28, 36, 12, [
        { item: "cantina chicken tacos", amount: "2" }, { item: "chicken", amount: "extra" },
      ]),
    ],
  },
  {
    test: (text) => /\bmcdonald'?s\b/.test(text),
    meals: [
      orderPlate("Egg McMuffin", "Say: Egg McMuffin. Add a side of fruit if you want it.", 310, 17, 30, 13, [
        { item: "Egg McMuffin", amount: "1" }, { item: "cheese", amount: "1 slice" }, { item: "egg", amount: "1" }, { item: "english muffin", amount: "1" },
      ]),
      orderPlate("McChicken, no mayo", "Say: McChicken, no mayo.", 360, 14, 40, 16, [
        { item: "McChicken", amount: "1" }, { item: "wheat bun", amount: "1" },
      ]),
      orderPlate("Egg white bite and fruit", "Say: egg white bites if they have them, and a side of apple slices.", 220, 16, 24, 6, [
        { item: "egg white bites", amount: "1" }, { item: "apple slices", amount: "1" },
      ]),
    ],
  },
  {
    test: (text) => /\bcava\b/.test(text),
    meals: [
      orderPlate("Cava chicken bowl", "Say: greens, chicken, extra chicken, hummus, harissa, half rice.", 480, 38, 36, 16, [
        { item: "chicken", amount: "double" }, { item: "hummus", amount: "regular" }, { item: "tahini", amount: "in the hummus" }, { item: "sesame", amount: "in the hummus" }, { item: "rice", amount: "half" },
      ]),
      orderPlate("Cava steak bowl", "Say: steak, greens, cucumber, garlic dressing on the side.", 460, 36, 28, 18, [
        { item: "steak", amount: "1 scoop" }, { item: "greens", amount: "base" },
      ]),
    ],
  },
  {
    test: (text) => /\bjersey mike/i.test(text),
    meals: [
      orderPlate("Turkey and provolone", "Say: #7 turkey, extra meat, easy on the oil, no extra cheese.", 480, 36, 40, 16, [
        { item: "turkey sub", amount: "regular" }, { item: "provolone", amount: "1 slice" }, { item: "wheat bread", amount: "1" },
      ]),
      orderPlate("Club supreme, easy oil", "Say: club, extra turkey, oil on the side.", 520, 34, 42, 20, [
        { item: "club sub", amount: "regular" },
      ]),
    ],
  },
  {
    test: (text) => /\bpanda express\b/.test(text),
    meals: [
      orderPlate("Grilled teriyaki plate", "Say: grilled teriyaki, super greens, half the rice.", 480, 36, 40, 12, [
        { item: "grilled teriyaki", amount: "1 scoop" }, { item: "soy sauce", amount: "in the glaze" }, { item: "wheat", amount: "in the glaze" }, { item: "super greens", amount: "1" }, { item: "rice", amount: "half" },
      ]),
      orderPlate("String bean chicken", "Say: string bean chicken, super greens, skip the extra sauce.", 420, 28, 28, 14, [
        { item: "string bean chicken", amount: "1 scoop" }, { item: "super greens", amount: "1" },
      ]),
    ],
  },
  {
    test: (text) => /\bmexican\b/.test(text),
    meals: [
      orderPlate("Chicken taco plate", "Say: two chicken tacos, extra chicken, salsa, skip sour cream.", 460, 36, 36, 14, [
        { item: "chicken tacos", amount: "2" }, { item: "salsa", amount: "on the side" },
      ]),
      orderPlate("Steak fajitas", "Say: steak fajitas, extra veg, tortillas on the side.", 500, 38, 32, 18, [
        { item: "steak fajitas", amount: "1 order" }, { item: "tortillas", amount: "on the side" },
      ]),
      orderPlate("Chicken burrito bowl", "Say: bowl, extra chicken, beans, salsa, no sour cream.", 480, 40, 40, 12, [
        { item: "chicken", amount: "double" }, { item: "beans", amount: "regular" }, { item: "rice", amount: "half" },
      ]),
    ],
  },
];

const SWEET_PLATES = [
  plate("Greek yogurt with berries", "Yogurt and fruit when you want something sweet.", 180, 24, 16, 2, [
    { item: "nonfat Greek yogurt", amount: "170g" }, { item: "berries", amount: "75g" },
  ]),
  plate("Cottage cheese and fruit", "Cottage cheese with fruit.", 200, 22, 16, 4, [
    { item: "cottage cheese", amount: "1 cup" }, { item: "fruit", amount: "1 cup" },
  ]),
  plate("Banana and peanut butter", "A banana with a spoon of peanut butter.", 220, 8, 28, 10, [
    { item: "banana", amount: "1" }, { item: "peanut butter", amount: "1 tbsp" },
  ]),
  plate("Apple and almond butter", "An apple with a spoon of almond butter.", 230, 6, 26, 12, [
    { item: "apple", amount: "1" }, { item: "almond butter", amount: "1 tbsp" },
  ]),
  plate("Frozen berries and oats", "Frozen berries over a handful of oats.", 210, 6, 40, 3, [
    { item: "frozen berries", amount: "1 cup" }, { item: "oats", amount: "1/3 cup" },
  ]),
  plate("Dates and almonds", "A few dates and a handful of almonds.", 220, 5, 28, 10, [
    { item: "dates", amount: "3" }, { item: "almonds", amount: "1 oz" },
  ]),
];

const WALK_SNACKS = [
  plate("Yogurt cup", "A yogurt you can eat before you go.", 150, 16, 12, 2, [
    { item: "Greek yogurt", amount: "170g" },
  ]),
  plate("Banana and string cheese", "A banana and a cheese stick.", 190, 8, 24, 6, [
    { item: "banana", amount: "1" }, { item: "string cheese", amount: "1" },
  ]),
  plate("Apple and almonds", "An apple and a small handful of almonds.", 220, 6, 24, 12, [
    { item: "apple", amount: "1" }, { item: "almonds", amount: "1 oz" },
  ]),
  plate("Banana and almonds", "A banana and a small handful of almonds.", 230, 5, 28, 12, [
    { item: "banana", amount: "1" }, { item: "almonds", amount: "1 oz" },
  ]),
  plate("Deli turkey roll-ups", "Turkey slices you can eat before you go.", 180, 24, 2, 6, [
    { item: "deli turkey", amount: "3 oz" },
  ]),
];

const EGG_VEG_MORE = [
  plate("Veggie frittata", "Eggs and the vegetables, in a skillet.", 340, 24, 8, 22, [
    { item: "eggs", amount: "3" }, { item: "mixed vegetables", amount: "1 cup" },
  ]),
  plate("Veggie omelette", "Eggs folded over the vegetables you have.", 320, 22, 6, 22, [
    { item: "eggs", amount: "2" }, { item: "mixed vegetables", amount: "1 cup" },
  ]),
  plate("Egg and veg fried rice", "Eggs, leftover rice, and the vegetables.", 420, 22, 42, 14, [
    { item: "eggs", amount: "2" }, { item: "cooked rice", amount: "1 cup" }, { item: "mixed vegetables", amount: "1 cup" },
  ]),
];

const LOW_CARB_PLATES = [
  plate("Turkey and cucumbers", "Turkey slices and cucumber. Low carb.", 220, 28, 6, 8, [
    { item: "turkey", amount: "4 oz" }, { item: "cucumber", amount: "1 cup" },
  ]),
  plate("Eggs and spinach", "Eggs and a pile of spinach.", 260, 20, 4, 18, [
    { item: "eggs", amount: "2" }, { item: "spinach", amount: "2 cups" },
  ]),
  plate("Grilled chicken and veg", "Chicken and a vegetable. Keep the carbs low.", 320, 40, 8, 10, [
    { item: "chicken breast", amount: "5 oz" }, { item: "green vegetables", amount: "2 cups" },
  ]),
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
      plate("Nigiri and soup", "Fish nigiri and miso soup — Callie's sushi plate.", 380, 32, 40, 8, [
        { item: "fish nigiri", amount: "6 pieces" }, { item: "miso soup", amount: "1 bowl" },
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
  coffee: [
    recipePlate("Sausage, egg + whites"),
    recipePlate("Greek yogurt + berries"),
    plate("Eggs and toast", "A simple breakfast with the coffee.", 310, 18, 22, 14, [
      { item: "eggs", amount: "2" }, { item: "toast", amount: "1 slice" },
    ]),
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
  plate("Apple and peanut butter", "A simple snack with water.", 190, 5, 28, 8, [
    { item: "apple", amount: "1" }, { item: "peanut butter", amount: "1 tbsp" },
  ]),
  plate("Turkey and rice", "A simple plate if dairy is off the table.", 430, 32, 48, 10, [
    { item: "ground turkey", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" },
  ]),
];

const IRON_PLATES = [
  plate("Beef and potatoes", "An iron-rich plate. Her doctor owns the rest.", 460, 36, 32, 18, [
    { item: "lean beef", amount: "5 oz" }, { item: "potatoes", amount: "1 cup" },
  ]),
  plate("Lentil and rice bowl", "Lentils and rice — food, not a supplement.", 400, 22, 62, 6, [
    { item: "lentils", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" },
  ]),
];

const QUICK_PLATES = [
  plate("Toast and peanut butter", "Near-zero prep. Water too.", 250, 10, 26, 12, [
    { item: "toast", amount: "1 slice" }, { item: "peanut butter", amount: "1 tbsp" },
  ]),
  plate("Rice cakes and banana", "Plain rice cakes and a banana.", 220, 4, 48, 2, [
    { item: "rice cakes", amount: "2" }, { item: "banana", amount: "1" },
  ]),
  plate("Apple and almonds", "An apple and a small handful of almonds.", 220, 6, 24, 12, [
    { item: "apple", amount: "1" }, { item: "almonds", amount: "1 oz" },
  ]),
];

const NO_COOK_PROTEIN = [
  plate("Greek yogurt and protein powder", "Yogurt stirred with a scoop of protein. No cooking.", 260, 40, 16, 2, [
    { item: "nonfat Greek yogurt", amount: "170g" }, { item: "protein powder", amount: "1 scoop" },
  ]),
  plate("Tuna pouch wrap", "A tuna pouch in a tortilla. Eat it in the car.", 280, 28, 18, 8, [
    { item: "tuna pouch", amount: "1" }, { item: "tortilla", amount: "1" },
  ]),
  plate("Deli turkey roll-ups", "Turkey slices rolled up. No spoon, no plate.", 220, 28, 2, 8, [
    { item: "deli turkey", amount: "4 oz" },
  ]),
  plate("Cottage cheese and fruit", "Cottage cheese and a piece of fruit. Already ready.", 240, 24, 20, 6, [
    { item: "cottage cheese", amount: "1 cup" }, { item: "fruit", amount: "1" },
  ]),
  plate("Protein shake and jerky", "A shake and a stick of jerky. Handheld.", 250, 36, 8, 6, [
    { item: "protein shake", amount: "1" }, { item: "beef jerky", amount: "1 oz" },
  ]),
];

const TACO_PLATES = [
  plate("Chicken tacos", "Two chicken tacos with salsa.", 420, 32, 36, 14, [
    { item: "chicken", amount: "4 oz" }, { item: "corn tortillas", amount: "2" }, { item: "salsa", amount: "2 tbsp" },
  ]),
  plate("Steak tacos", "Two steak tacos, onion and cilantro.", 440, 30, 32, 16, [
    { item: "steak", amount: "4 oz" }, { item: "corn tortillas", amount: "2" }, { item: "onion and cilantro", amount: "a handful" },
  ]),
  plate("Bean and salsa tacos", "Bean tacos when meat is off.", 360, 16, 52, 8, [
    { item: "beans", amount: "3/4 cup" }, { item: "corn tortillas", amount: "2" }, { item: "salsa", amount: "2 tbsp" },
  ]),
];

const CAR_HANDHELD = [
  plate("Deli turkey roll-ups", "Turkey slices and a cheese stick. No spoon, eat in the car.", 220, 28, 2, 8, [
    { item: "deli turkey", amount: "4 oz" }, { item: "cheese stick", amount: "1" },
  ]),
  plate("Tuna pouch wrap", "Tuna pouch in a tortilla. One hand.", 280, 28, 18, 8, [
    { item: "tuna pouch", amount: "1" }, { item: "tortilla", amount: "1" }, { item: "salsa", amount: "1 tbsp" },
  ]),
  plate("Protein bar and cheese stick", "A bar and a cheese stick. No spoon.", 250, 22, 22, 8, [
    { item: "protein bar", amount: "1" }, { item: "cheese stick", amount: "1" },
  ]),
  plate("Egg-free muffin-tin bite", "A leftover muffin-tin bite you can eat in the car.", 180, 12, 16, 6, [
    { item: "oat muffin-tin bite", amount: "1" }, { item: "banana", amount: "1" },
  ]),
];

const VEGAN_SAFE = [
  plate("Bean and rice bowl", "Beans, rice, and salsa.", 380, 16, 68, 4, [
    { item: "beans", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" }, { item: "salsa", amount: "1/4 cup" },
  ]),
  plate("Tofu rice bowl", "Crispy tofu, rice, and steamed broccoli.", 420, 22, 48, 12, [
    { item: "tofu", amount: "6 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "broccoli", amount: "1 cup" },
  ]),
  plate("Tempeh and rice", "Tempeh, rice, and a pile of vegetables.", 430, 24, 40, 14, [
    { item: "tempeh", amount: "4 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("Lentil and rice bowl", "Lentils and rice with salsa.", 400, 22, 62, 6, [
    { item: "lentils", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" }, { item: "salsa", amount: "1/4 cup" },
  ]),
  plate("Hummus and rice bowl", "Hummus, rice, and cucumber.", 420, 16, 58, 12, [
    { item: "hummus", amount: "1/2 cup" }, { item: "tahini", amount: "in the hummus" }, { item: "sesame", amount: "in the hummus" }, { item: "cooked rice", amount: "1 cup" }, { item: "cucumber", amount: "1 cup" },
  ]),
  plate("Chickpea and rice bowl", "Chickpeas, rice, and salsa. No soy, no gluten.", 400, 18, 62, 6, [
    { item: "chickpeas", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" }, { item: "salsa", amount: "1/4 cup" },
  ]),
  plate("Black beans and potatoes", "Black beans and roasted potatoes.", 380, 16, 58, 6, [
    { item: "black beans", amount: "1 cup" }, { item: "potatoes", amount: "1 cup" },
  ]),
  plate("Peanut stew and rice", "Peanut stew over rice.", 460, 18, 52, 16, [
    { item: "peanut stew", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" },
  ]),
];

const PESC_PLATES = [
  plate("Shrimp and rice", "Shrimp, rice, and steamed vegetables.", 400, 32, 42, 6, [
    { item: "shrimp", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("White fish and potatoes", "White fish, potatoes, and a vegetable.", 400, 38, 28, 10, [
    { item: "white fish", amount: "6 oz" }, { item: "potatoes", amount: "1 cup" }, { item: "green vegetables", amount: "1 cup" },
  ]),
  plate("Salmon and rice", "Salmon over rice.", 440, 38, 30, 14, [
    { item: "salmon", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" },
  ]),
];

const PROTEIN_FORWARD = [
  plate("Turkey and rice", "Ground turkey, rice, and a vegetable.", 430, 32, 48, 10, [
    { item: "ground turkey", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("Beef and potatoes", "Lean beef and roasted potatoes.", 460, 36, 32, 18, [
    { item: "lean beef", amount: "5 oz" }, { item: "potatoes", amount: "1 cup" }, { item: "green vegetables", amount: "1 cup" },
  ]),
  plate("Pork and rice", "Pork tenderloin, rice, and veg.", 440, 34, 40, 12, [
    { item: "pork tenderloin", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("Shrimp and rice", "Shrimp, rice, and steamed vegetables.", 400, 32, 42, 6, [
    { item: "shrimp", amount: "5 oz" }, { item: "cooked rice", amount: "1 cup" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("White fish and potatoes", "White fish, potatoes, and a vegetable.", 400, 38, 28, 10, [
    { item: "white fish", amount: "6 oz" }, { item: "potatoes", amount: "1 cup" }, { item: "green vegetables", amount: "1 cup" },
  ]),
  plate("Dairy-free yogurt bowl", "Dairy-free yogurt, berries, and a scoop of protein.", 280, 24, 28, 4, [
    { item: "dairy-free yogurt", amount: "170g" }, { item: "berries", amount: "75g" }, { item: "protein powder", amount: "1 scoop" },
  ]),
];

const MEAL_PROTEIN_FLOOR = 15;

const NO_EGG_BREAKFAST = [
  plate("Protein oatmeal", "Oats with protein powder and berries. No eggs.", 310, 30, 40, 4, [
    { item: "oats", amount: "1/2 cup dry" }, { item: "protein powder", amount: "1 scoop" }, { item: "berries", amount: "2/3 cup" },
  ]),
  plate("Turkey sausage and fruit", "Sausage and a piece of fruit. No eggs.", 280, 18, 22, 12, [
    { item: "turkey sausage", amount: "2 links" }, { item: "fruit", amount: "1" },
  ]),
];

const NO_COOK = [
  plate("Rotisserie chicken and fruit", "4 oz rotisserie chicken and a piece of fruit. Already cooked.", 320, 32, 18, 10, [
    { item: "rotisserie chicken", amount: "4 oz" }, { item: "fruit", amount: "1 piece" },
  ]),
  plate("Tuna and crackers", "A can of tuna and a handful of crackers. No cooking.", 280, 24, 18, 8, [
    { item: "tuna", amount: "1 can" }, { item: "crackers", amount: "a handful" },
  ]),
];

const NO_PREP = [
  plate("Rotisserie chicken and fruit", "4 oz rotisserie chicken and a piece of fruit. Nothing to cook.", 320, 32, 18, 10, [
    { item: "rotisserie chicken", amount: "4 oz" }, { item: "fruit", amount: "1 piece" },
  ]),
  plate("Tuna and crackers", "A can of tuna and a handful of crackers. Eat it as-is.", 280, 24, 18, 8, [
    { item: "tuna", amount: "1 can" }, { item: "crackers", amount: "a handful" },
  ]),
  plate("Apple and peanut butter", "An apple and a spoon of peanut butter. One-handed.", 190, 5, 28, 8, [
    { item: "apple", amount: "1" }, { item: "peanut butter", amount: "1 tbsp" },
  ]),
];

const VEG_PLATES = [
  plate("Bean and rice bowl", "Beans, rice, and salsa.", 380, 16, 68, 4, [
    { item: "beans", amount: "1 cup" }, { item: "cooked rice", amount: "1 cup" }, { item: "salsa", amount: "1/4 cup" },
  ]),
  plate("Egg and toast", "Eggs and toast when meat is off.", 310, 18, 22, 14, [
    { item: "eggs", amount: "2" }, { item: "toast", amount: "1 slice" },
  ]),
  plate("Greek yogurt bowl", "Yogurt, berries, and a scoop of protein.", 280, 24, 28, 4, [
    { item: "nonfat Greek yogurt", amount: "170g" }, { item: "berries", amount: "75g" }, { item: "protein powder", amount: "1 scoop" },
  ]),
  plate("Tofu scramble", "Tofu scramble with vegetables.", 340, 22, 16, 16, [
    { item: "tofu", amount: "6 oz" }, { item: "vegetables", amount: "1 cup" },
  ]),
  plate("Chickpea pasta", "Chickpea pasta with marinara.", 420, 20, 56, 8, [
    { item: "chickpea pasta", amount: "2 oz dry" }, { item: "marinara", amount: "1 cup" },
  ]),
];

function plate(name, desc, cal, p, c, f, ingredients = [], steps = []) {
  return { name, desc, cal, p, c, f, ingredients, steps, fixedPortion: true };
}

function recipeIngredients(recipe) {
  if (recipe?.name === "Protein pancakes") {
    return [
      { item: "dry oats", amount: "½ cup" },
      { item: "large egg", amount: "1" },
      { item: "vanilla protein", amount: "1 scoop" },
    ];
  }
  const bits = String(recipe?.desc || "")
    .split(/,|;|\+/)
    .map((part) => part.replace(/\([^)]*\)/g, "").trim())
    .filter((part) => part.length >= 4 && !/^per serving/i.test(part));
  return bits.slice(0, 3).map((item) => ({ item, amount: "" }));
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
    ingredients: recipeIngredients(recipe),
    steps: [],
    fixedPortion: true,
  };
}

const ALLERGEN_FREE = [
  plate("Rice and fruit", "Plain cooked rice and a piece of fruit.", 280, 6, 62, 1, [
    { item: "cooked rice", amount: "1 cup" }, { item: "fruit", amount: "1 piece" },
  ]),
  plate("Rice cakes and banana", "Plain rice cakes and a banana.", 220, 4, 48, 2, [
    { item: "rice cakes", amount: "2" }, { item: "banana", amount: "1" },
  ]),
  plate("Cucumber and rice", "Sliced cucumber over plain rice.", 210, 5, 44, 1, [
    { item: "cooked rice", amount: "1 cup" }, { item: "cucumber", amount: "1 cup" },
  ]),
];

function asMeal(raw, slot) {
  if (!raw?.name) return null;
  const name = capMealName(raw.name);
  const meal = sanitizePlanMeal({
    slot,
    servings: 1,
    basedOn: raw.basedOn || null,
    ingredients: raw.ingredients || [],
    steps: raw.steps || [],
    ...raw,
    name,
    desc: ingredientDesc({ ...raw, name }),
    fromSaved: Boolean(raw.fromSaved),
    orderOnly: Boolean(raw.orderOnly),
    fixedPortion: Boolean(raw.fixedPortion || raw.orderOnly),
    ...(raw.source ? { source: raw.source } : {}),
  });
  return macrosPlausible(meal) ? meal : null;
}

function shownTooOften(name, skipNames = [], asked = "") {
  const key = mealBaseName(name);
  if (!key) return false;
  if (asked && String(asked).toLowerCase().includes(key)) return false;
  return (skipNames || []).some((item) => mealBaseName(item) === key);
}

function addMeal(out, seen, raw, slot, diet, constraints, skipNames, profile, asked = "") {
  if (!raw) return;
  if (slot === "breakfast" && /\brotisserie chicken pieces\b/i.test(raw.name || "")) return;
  const skipProteinFloor = Boolean(
    raw.orderOnly
    || constraints?.sweet
    || constraints?.snackish
    || constraints?.light
    || slot === "snack",
  );
  if (slot && slot !== "snack" && (Number(raw.p) || 0) < MEAL_PROTEIN_FLOOR && !skipProteinFloor) return;
  if (shownTooOften(raw.name, skipNames, asked)) return;
  if (mealBreaksConstraints(raw, constraints, skipNames)) return;
  if (mealBreaksSavedPrefs(raw, profile)) return;
  const key = mealBaseName(raw.name);
  if (!key || seen.has(key)) return;
  const meal = asMeal(raw, slot);
  if (!meal || mealBreaksConstraints(meal, constraints, skipNames)) return;
  if (mealBreaksSavedPrefs(meal, profile)) return;
  seen.add(key);
  out.push(meal);
}

function rotateList(list, skipNames = [], salt = "") {
  if (!list?.length) return list || [];
  const extra = String(salt || "").split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const n = (skipNames || []).length + extra;
  if (!n) return list;
  const start = n % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}

function isInventoryAsk(text) {
  const t = String(text || "").toLowerCase();
  if (!t || restaurantFromAsk(text)) return false;
  if (/\beggs?\b/.test(t) && /\b(veg|vegetable|spinach|pepper|onion|fridge)\b/.test(t)) return true;
  if (/\b(in my fridge|what i have|this is what i have)\b/.test(t)) return true;
  return /\b(leftover|left over|we have|i have)\b/.test(t)
    && /\b(chicken|beef|rice|pasta|salmon|turkey|eggs?|yogurt|tortilla|beans)\b/.test(t);
}

function mealsFitInventory(meals, text) {
  const t = String(text || "").toLowerCase();
  const hay = (meals || []).map((meal) => `${meal?.name || ""} ${meal?.desc || ""}`).join(" ").toLowerCase();
  if (!hay.trim()) return false;
  if (/\beggs?\b/.test(t) && /\b(veg|vegetable|spinach|pepper|onion|fridge)\b/.test(t)) {
    return /\beggs?\b/.test(hay);
  }
  const named = t.match(/\b(chicken|beef|rice|pasta|salmon|turkey|eggs?|yogurt|tortilla|beans)\b/g) || [];
  return named.some((word) => hay.includes(word.replace(/s$/, "")));
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
  skipNames = [],
  iron = false,
  priorAsks = [],
} = {}) {
  const asked = constraintTextFrom(text, priorAsks).toLowerCase();
  const inventory = String(text || "").toLowerCase();
  const diet = String(profile?.diet || "").toLowerCase();
  const constraints = extractAskConstraints(asked, profile, { currentAsk: String(text || "") });
  const mealSlot = slot !== "snack";
  const skip = (skipNames || []).map((item) => String(item || "").trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  const oneHanded = HANDS_FULL.test(inventory) || /\b(one[- ]handed|holding (the )?baby)\b/i.test(inventory);
  const add = (raw) => {
    if (oneHanded && /\b(bowl|soup|oatmeal)\b/i.test(String(raw?.name || ""))) return;
    addMeal(out, seen, raw, slot, diet, constraints, skip, profile, asked);
  };
  const kitchen = mode === "kitchen";
  const namedPantry = /\b(nvm|never mind|we have|i have|got |ground|beef|chicken|rice|eggs?|leftover|yogurt|pasta|turkey|salmon|beans?)\b/.test(inventory);
  const place = restaurantFromAsk(text) || PLACE_PLATES.some((rule) => rule.test(inventory));

  if (/\beggs?\b/.test(inventory) && /\b(veg|vegetable|spinach|pepper|onion|fridge)\b/.test(inventory)) {
    for (const rule of FROM_WHAT_SHE_HAS) {
      if (rule.test(inventory)) add(rule.meal);
    }
    for (const meal of EGG_VEG_MORE) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (place) {
    for (const rule of PLACE_PLATES) {
      if (!rule.test(inventory)) continue;
      for (const meal of rule.meals) add(meal);
    }
    if (out.length >= count) return out.slice(0, count);
  }
  if (constraints.sweet) {
    for (const meal of SWEET_PLATES) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (constraints.snackish || slot === "snack") {
    for (const meal of WALK_SNACKS) add(meal);
    for (const meal of QUICK_PLATES) add(meal);
    for (const meal of SWEET_PLATES) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (constraints.lowCarb) {
    for (const meal of LOW_CARB_PLATES) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (iron) {
    for (const meal of IRON_PLATES) add(meal);
  }
  if (oneHanded) {
    for (const meal of CAR_HANDHELD) add(meal);
    for (const meal of NO_COOK) add(meal);
    for (const meal of NO_COOK_PROTEIN) add(meal);
    if (!mealSlot) for (const meal of QUICK_PLATES) add(meal);
  }
  if (/\b(in the car|eat in the car|driving|on the (go|road)|handheld|no spoon)\b/.test(asked)) {
    for (const meal of CAR_HANDHELD) add(meal);
    for (const meal of NO_COOK_PROTEIN) add(meal);
  }
  if (/\b(don'?t have to cook|no cooking|no[- ]cook|zero prep)\b/.test(inventory)) {
    for (const meal of NO_COOK_PROTEIN) add(meal);
    for (const meal of NO_COOK) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (/\btacos?\b/.test(inventory)) {
    for (const meal of TACO_PLATES) add(meal);
  }
  if (/\b(don'?t have to cook|no cooking|no[- ]cook|zero prep)\b/.test(asked) || (/\b70g\b/.test(asked) && /\bprotein\b/.test(asked))) {
    for (const meal of NO_COOK_PROTEIN) add(meal);
    for (const meal of NO_COOK) add(meal);
  }
  if (/\b(\d+\s+minutes?|5 minutes|screaming|zero prep|no cooking|less prep)\b/.test(asked)) {
    if (!mealSlot) for (const meal of QUICK_PLATES) add(meal);
    for (const meal of NO_COOK_PROTEIN) add(meal);
    for (const meal of NO_COOK) add(meal);
  }
  if (diet === "vegan") {
    for (const meal of rotateList(VEGAN_SAFE, skip)) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (diet === "vegetarian" || constraints.vegetarian) {
    for (const meal of rotateList(VEG_PLATES, skip)) add(meal);
    for (const meal of rotateList(VEGAN_SAFE, skip)) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (diet === "pescatarian") {
    for (const meal of rotateList(PESC_PLATES, skip)) add(meal);
    for (const meal of rotateList(VEG_PLATES, skip)) add(meal);
    if (out.length >= count) return out.slice(0, count);
  }
  if (constraints.noEggs && (slot === "breakfast" || /\bbreakfast\b/.test(asked))) {
    for (const meal of NO_EGG_BREAKFAST) add(meal);
  }
  if (/\bno cooking\b/.test(asked)) {
    for (const meal of NO_COOK) add(meal);
  }

  if (safe) {
    if (diet === "vegan") {
      for (const meal of rotateList(VEGAN_SAFE, skip)) add(meal);
      for (const meal of rotateList(ALLERGEN_FREE, skip)) add(meal);
    } else {
      for (const meal of rotateList(SAFE_SIMPLE, skip)) add(meal);
    }
    if (out.length < count) {
      for (const meal of rotateList(PROTEIN_FORWARD, skip)) add(meal);
      if (!mealSlot) for (const meal of QUICK_PLATES) add(meal);
      for (const meal of rotateList(VEG_PLATES, skip)) add(meal);
      for (const meal of rotateList(ALLERGEN_FREE, skip)) add(meal);
      for (const meal of rotateList(NO_PREP, skip)) add(meal);
    }
    return out.slice(0, count);
  }

  if (!kitchen || namedPantry) {
    let fromHand = false;
    for (const rule of FROM_WHAT_SHE_HAS) {
      if (!rule.test(inventory)) continue;
      add(rule.meal);
      fromHand = true;
    }
    if (fromHand && /\beggs?\b/.test(inventory) && /\b(veg|vegetable)/.test(inventory)) {
      for (const meal of EGG_VEG_MORE) add(meal);
    }
    if (fromHand && out.length >= count) return out.slice(0, count);
  }

  const teach = kitchen ? [] : (TEACH_PLATES[topic] || []);
  for (const meal of teach) add(meal);
  if (out.length >= count) return out.slice(0, count);

  for (const meal of customMeals || []) {
    add({
      name: capMealName(meal.name),
      desc: ingredientDesc(meal) || "One of your meals.",
      cal: meal.cal, p: meal.p ?? meal.protein, c: meal.c ?? meal.carbs, f: meal.f ?? meal.fat,
      basedOn: capMealName(meal.name),
      ingredients: ingredientList(meal),
      fromSaved: true,
    });
    if (out.length >= count) return out.slice(0, count);
  }

  const useRecipes = !place && !constraints.sweet && !constraints.snackish && slot !== "snack";
  if (useRecipes) {
    const preferred = rotateList(recipesForSlot(slot), skip, asked);
    for (const recipe of preferred) {
      add(recipePlate(recipe.name));
      if (out.length >= count) return out.slice(0, count);
    }
  }

  for (const meal of rotateList(PROTEIN_FORWARD, skip)) add(meal);
  for (const meal of rotateList(SAFE_SIMPLE, skip)) add(meal);
  for (const meal of rotateList(VEG_PLATES, skip)) add(meal);
  if (!mealSlot) for (const meal of QUICK_PLATES) add(meal);
  for (const meal of rotateList(NO_PREP, skip)) add(meal);
  if (out.length < count) {
    for (const meal of ALLERGEN_FREE) add(meal);
  }
  if (out.length < 1) {
    const last = asMeal(ALLERGEN_FREE[0], slot);
    if (last) out.push(last);
  }
  const kept = filterCoachMeals(out, { text, profile, skipNames: skip, priorAsks });
  if (kept.length) return kept.slice(0, count);
  const last = asMeal(ALLERGEN_FREE[0], slot);
  return last ? [last] : out.slice(0, count);
}

function offerLine(meals) {
  const names = (meals || []).map((meal) => meal.name).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `Here's ${names[0]}.`;
  if (names.length === 2) return `Here's ${names[0]} and ${names[1]}.`;
  return `Here's ${names[0]}, ${names[1]}, and ${names[2]}.`;
}

const RESTRICT_OK_ASK = /\b(\d{3,4}\s*(cal|cals|calories)|once a day|skip(ping)? meals?|fast(ing)?|eat this little|only eat|1000|1200)\b/;

export function foodQuestionLead(text = "", meals = [], { allowYesNo = true } = {}) {
  const asked = String(text || "").toLowerCase();
  if (!asked) return "";
  if (/\bwhy do you keep (saying )?ask callie\b/.test(asked) || /\bwhy (do you|are you).{0,24}ask callie\b/.test(asked)) {
    return "Food questions I answer here. Health, supply-worry, and feelings questions go to Callie because she knows you. ";
  }
  if (/\bskipped\b/.test(asked) && /\b(what now|what should i|eat now)\b/.test(asked)) {
    return "Eat now — something simple is enough. ";
  }
  if (/\beat(ing)? this little\b/.test(asked) || /\bthis little while (nursing|breastfeeding)\b/.test(asked)) {
    return "No — eat more. Nursing needs fuel, and a small day is a reason to eat, not a reason to wait. ";
  }
  if (/\b(breastfeed|nursing|breast feeding)/.test(asked) && /\b(always hungry|so hungry)\b/.test(asked)) {
    return "Nursing burns a lot. Here are filling options. ";
  }
  if (/\bwraps?\b/.test(asked) && /\bprotein\b/.test(asked)) {
    return "Yes, if there's a real protein in that wrap — chicken, turkey, or beans. If it's mostly veg, add a side. ";
  }
  if (/\bbroth\b/.test(asked) && (/\bsupply\b/.test(asked) || /\bnoodles?\b/.test(asked))) {
    return "Yes — broth is fine for supply. A small scoop of noodles is okay; skip the extra bowl if you want. ";
  }
  if (/\benough protein\b/.test(asked)) {
    const name = meals[0]?.name;
    const p = Number(meals[0]?.p) || 0;
    if (p >= 25 && name) return `Yes — ${name} has ${p}g of protein. `;
    if (p >= 25) return "Yes — that has enough protein. ";
    return "Not quite on its own — pair it with more protein. ";
  }
  if (
    allowYesNo
    && !RESTRICT_OK_ASK.test(asked)
    && /\b(is|are|should) [^.?]{0,48}\b(ok|okay|fine)\b/.test(asked)
    && (FOOD_HINT.test(asked) || meals.length)
  ) {
    return "Yes — that works. ";
  }
  return "";
}

const FOOD_HINT = /\b(wrap|broth|noodle|pho|protein|nursing|chicken|rice|beef|egg|pizza|taco)\b/;

export function warmMealReply(meals, text = "") {
  if ((meals || []).some((meal) => meal?.fromSaved)) {
    const yesNo = foodQuestionLead(text, meals);
    return yesNo ? `${yesNo.trim()} ${COACH_LOCAL_PICKS_LINE}` : COACH_LOCAL_PICKS_LINE;
  }
  const offer = offerLine(meals);
  if (!offer) return COACH_LOCAL_PICKS_LINE;
  const asked = String(text || "").toLowerCase();
  let lead = foodQuestionLead(asked, meals);
  const gap = asked.match(/(\d+)\s*g(?:rams)?\s+(?:of\s+)?protein/);
  if (gap && meals.length >= 2) {
    const need = Number(gap[1]);
    const two = (Number(meals[0]?.p) || 0) + (Number(meals[1]?.p) || 0);
    if (need > 0 && two >= need && meals.length === 2) lead = "Have both and you're basically there. ";
  }
  if (!lead && isGuiltAsk(asked)) lead = `${COACH_GUILT_LINE} `;
  if (!lead && (/\brotisserie\b/.test(asked) || (/\bchicken\b/.test(asked) && /\brice\b/.test(asked)))) {
    lead = "Since you've got chicken and rice already, ";
  } else if (!lead && /\bpho\b/.test(asked)) {
    lead = "For pho, broth first, extra protein, go easy on the noodles. ";
  } else if (!lead && /\bchipotle\b/.test(asked)) {
    lead = "At Chipotle, ";
  } else if (!lead && /\bthai\b/.test(asked)) {
    lead = "For Thai tonight, ";
  } else if (!lead && /\btacos?\b/.test(asked)) {
    lead = "Yes — tacos work. ";
  } else if (!lead && /\b(don'?t have to cook|no cooking|no[- ]cook)\b/.test(asked)) {
    lead = "Nothing to cook: ";
  } else if (!lead && asked.trim()) {
    lead = "Here's something that fits what you asked. ";
  }
  if (!lead) return countShownCards(offer, meals);
  return countShownCards(joinLeadOffer(lead, offer), meals);
}

function joinLeadOffer(lead, offer) {
  const a = String(lead || "").trim();
  let b = String(offer || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.toLowerCase().includes(b.toLowerCase())) return a;
  b = b.replace(/^(here(?:'s| is| are)\s+)/i, "");
  const stem = a.replace(/[.!?]+\s*$/, "");
  if (!b) return stem;
  return `${stem}. ${b.charAt(0).toUpperCase()}${b.slice(1)}`.replace(/\s{2,}/g, " ");
}

function countShownCards(reply, meals) {
  const n = (meals || []).filter((meal) => meal?.name).length;
  let out = String(reply || "");
  if (n !== 2) {
    out = out.replace(/\b(have both|both of (?:these|them)|the two|these two|a couple)\b/gi, n === 3 ? "these" : "this");
  }
  if (n === 3) out = out.replace(/\bhere are a couple\b/gi, "here are");
  return out;
}

export function fallbackMealReply(meals, text = "") {
  return warmMealReply(meals, text);
}

export function padCoachMeals(meals, {
  text,
  slot,
  mode,
  topic,
  profile,
  customMeals,
  skipNames = [],
  count = 3,
  safe = false,
  iron = false,
  priorAsks = [],
} = {}) {
  const kept = filterCoachMeals(meals, { text, profile, skipNames, priorAsks });
  if (kept.length >= count) return kept.slice(0, count);
  const extra = buildCoachFallbackMeals({
    text,
    slot,
    mode,
    topic,
    profile,
    customMeals,
    skipNames: [...skipNames, ...kept.map((meal) => meal.name)],
    count,
    safe,
    iron,
    priorAsks,
  });
  const seen = new Set(kept.map((meal) => mealBaseName(meal.name)).filter(Boolean));
  for (const meal of extra) {
    const key = mealBaseName(meal.name);
    if (!key || seen.has(key)) continue;
    kept.push(meal);
    seen.add(key);
    if (kept.length >= count) break;
  }
  return kept;
}

/** A food question that came back empty or short gets 2–3 plates and a reply. */
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
  skipNames = [],
  count = 3,
  iron = false,
  priorAsks = [],
} = {}) {
  const want = Math.max(3, count || 3);
  const list = filterCoachMeals(
    Array.isArray(meals) ? meals.filter((meal) => meal?.name) : [],
    { text, profile, skipNames, priorAsks },
  );
  if (isInventoryAsk(text) && !mealsFitInventory(list, text)) {
    const fromHand = buildCoachFallbackMeals({
      text, slot, mode, topic, profile, customMeals, skipNames, count: want, safe, iron, priorAsks,
    });
    if (fromHand.length >= 2) {
      const shown = fromHand.slice(0, want);
      const next = isGuiltAsk(text) ? hideCoachMealMacros(shown) : shown;
      return { meals: next, reply: finishMealReply(text, next, reply), filled: true };
    }
  }
  if (!force && list.length >= want) {
    const shownEarly = list.slice(0, want);
    return {
      meals: shownEarly,
      reply: finishMealReply(text, shownEarly, reply),
      filled: false,
    };
  }
  const next = padCoachMeals(list, {
    text, slot, mode, topic, profile, customMeals, safe, skipNames, count: want, iron, priorAsks,
  });
  let kept = filterCoachMeals(next, { text, profile, skipNames, priorAsks });
  if (!kept.length) {
    kept = filterCoachMeals(ALLERGEN_FREE.map((meal) => asMeal(meal, slot)).filter(Boolean), {
      text, profile, skipNames, priorAsks,
    });
    if (!kept.length) {
      const last = asMeal(ALLERGEN_FREE[0], slot);
      if (last) kept = [last];
    }
  }
  const shown = kept.slice(0, want);
  const presented = isGuiltAsk(text) ? hideCoachMealMacros(shown) : shown;
  return {
    meals: presented,
    reply: finishMealReply(text, presented, reply),
    filled: shown.length > list.length,
  };
}

export const COACH_CHAIN_ASKS = [
  "what can I order at Chipotle",
  "we're getting Thai food tonight, what should I get",
  "at Starbucks, what's a good option",
  "Trader Joe's run, what should I grab for easy lunches",
  "what's good at Chick-fil-A",
  "what's good at Panera",
  "what's good at Sweetgreen",
  "what's good at Subway",
  "what's good at Taco Bell",
  "what's good at McDonald's",
  "what's good at Cava",
  "what's good at Jersey Mike's",
  "what's good at Panda Express",
  "In-N-Out tonight, what should I get",
  "we're getting Mexican food tonight",
];

export function keepPlaceMeals(meals, place) {
  if (!isMenuRestaurant(place)) return meals || [];
  return (meals || []).filter((meal) => meal.orderOnly || meal.source === "menu");
}

function finishMealReply(text, meals, reply = "") {
  const incoming = String(reply || "").trim();
  let out = incoming || fallbackMealReply(meals, text);
  const lead = foodQuestionLead(text, meals, { allowYesNo: !incoming });
  if (lead && !out.toLowerCase().startsWith(lead.trim().toLowerCase())) {
    if (!(/^yes\b/i.test(lead) && incoming)) {
      out = joinLeadOffer(lead, out);
    }
  }
  if (isGuiltAsk(text) && meals.length) {
    out = onceLead(out, COACH_GUILT_LINE);
  }
  out = out.replace(/\bfrom your plan\b/gi, "for now");
  if (!incoming && /^here(?:'s| is| are)\s+[^.]+\.\s*$/i.test(out) && !foodQuestionLead(text, meals, { allowYesNo: false })) {
    out = fallbackMealReply(meals, text);
  }
  return countShownCards(alignReplyToMeals(out, meals), meals);
}

export function hideCoachMealMacros(meals) {
  return (meals || []).map((meal) => ({
    ...meal,
    hideMacros: true,
  }));
}

export function stripCoachMealMacros(meals) {
  return (meals || []).map((meal) => ({
    ...meal,
    hideMacros: true,
    noMealActions: true,
    cal: 0,
    p: 0,
    c: 0,
    f: 0,
  }));
}

const OFFER_LEAD = /^(here(?:'s| is| are)|or(?: if you(?:'d| would) rather,?)?)\s+/i;

function offerBits(chunk) {
  return String(chunk || "")
    .replace(/^(here(?:'s| is| are)|or(?: if you(?:'d| would) rather,?)?)\s+/i, "")
    .split(/\s*,\s*|\s+or\s+/i)
    .map((part) => part.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean);
}

function offerNamesUnshown(sentence, shown) {
  return offerBits(sentence).some((bit) => {
    const base = mealBaseName(bit);
    if (!base || base.length < 4) return false;
    if (/^(a |an |the )?(next one|few that|few|something|simple plate)/i.test(base)) return false;
    return ![...shown].some((name) => name === base || name.includes(base) || base.includes(name));
  });
}

function trailingOrOffer(meals, alreadyNamed = new Set()) {
  if ((meals || []).some((meal) => meal?.fromSaved)) return COACH_LOCAL_PICKS_LINE;
  const rest = (meals || []).filter((meal) => meal.name && !alreadyNamed.has(mealBaseName(meal.name)));
  return offerLine(rest);
}

/** Keep warm prose. Rewrite only an offer sentence that names a dropped plate. */
export function alignReplyToMeals(reply, meals) {
  const list = (meals || []).filter((meal) => meal?.name);
  const text = String(reply || "").trim();
  if (!list.length) return text;
  if (!text) return fallbackMealReply(list);
  const shown = new Set(list.map((meal) => mealBaseName(meal.name)));
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let changed = false;
  const next = sentences.map((sentence, i) => {
    const isOffer = OFFER_LEAD.test(sentence) || /^here(?:'s| is| are)\b/i.test(sentence) || /^or\b/i.test(sentence);
    if (!isOffer || !offerNamesUnshown(sentence, shown)) return sentence;
    changed = true;
    if (i === sentences.length - 1 && sentences.length > 1) {
      const named = new Set();
      for (const prev of sentences.slice(0, i)) {
        for (const meal of list) {
          const key = mealBaseName(meal.name);
          if (key && prev.toLowerCase().includes(key)) named.add(key);
        }
      }
      return trailingOrOffer(list, named);
    }
    return fallbackMealReply(list);
  });
  let out = (changed ? next.join(" ") : text).trim();
  const leftover = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = [];
  let droppedOr = false;
  for (const sentence of leftover) {
    if (/^Or\b/i.test(sentence)) {
      droppedOr = true;
      continue;
    }
    kept.push(sentence);
  }
  out = kept.join(" ").trim();
  if (droppedOr) {
    const named = offerLine(list);
    if (named && !out.toLowerCase().includes(String(list[0]?.name || "").toLowerCase())) {
      out = `${out} ${named}`.trim();
    }
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Prose names only plates on screen; cards match the sentence when it lists them. */
export function replyPlateContract(reply, meals) {
  const list = (meals || []).filter((meal) => meal?.name);
  const text = String(reply || "").trim();
  const shown = new Set(list.map((meal) => mealBaseName(meal.name)));
  const missing = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    if (!/^(here(?:'s| is| are)|or)\b/i.test(sentence) && !OFFER_LEAD.test(sentence)) continue;
    if (offerNamesUnshown(sentence, shown)) {
      for (const bit of offerBits(sentence)) {
        const base = mealBaseName(bit);
        if (base && base.length >= 4 && ![...shown].some((name) => name === base || name.includes(base) || base.includes(name))) {
          missing.push(base);
        }
      }
    }
  }
  const generic = /few easy ones|something that fits|eat now|nursing burns|one day doesn't|food questions i answer/i.test(text);
  const listing = /here(?:'s| is| are) .+(,| and )/i.test(text);
  const unnamed = listing && !generic
    ? list.filter((meal) => {
      const key = mealBaseName(meal.name);
      return key && !text.toLowerCase().includes(key);
    }).map((meal) => meal.name)
    : [];
  return { ok: missing.length === 0 && unnamed.length === 0 && !/^or\b/i.test(text), missing, unnamed };
}
