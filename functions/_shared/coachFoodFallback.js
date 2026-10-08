/* ==================================================================
   Deterministic plates so a food question never comes back empty.

   The model is the first try. When it is silent, unreadable, or a teach
   or handoff would otherwise leave her without something she can make
   or order, these plates fill in — from what she said she has, Callie's
   recipes, her own meals, or a simple generic plate.
   ================================================================== */

import { COACH_GUILT_LINE, COACH_LOCAL_PICKS_LINE } from "../../src/content/coachVoice.js";
import { mealBaseName } from "./coachAskMeals.js";
import { CALLIE_RECIPES } from "./callieRecipes.js";
import { isGuiltAsk, macrosPlausible } from "./coachGuardrails.js";
import { constraintTextFrom, extractAskConstraints, filterCoachMeals, ingredientList, mealBreaksConstraints, mealBreaksSavedPrefs } from "./coachMealFilter.js";
import { restaurantFromAsk } from "../../src/utils/coachIntent.js";
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
  if (desc && desc.toLowerCase() !== name.toLowerCase()) return desc;
  return desc || "A simple plate you can make now.";
}

const SLOT_CAT = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Teach topics that are still a meal question. */
export const MEAL_TEACH_TOPICS = new Set([
  "italian", "chinese", "sushi", "pizzaMeal", "inNOut", "psMethod",
  "neverSkip", "realFood", "underDay", "fasting", "coffee",
  "menuLink", "menuClosed", "menuMiss",
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
    test: (text) => /\btortillas?\b/.test(text) && /\bbeans?\b/.test(text),
    meal: {
      name: "Bean and cheese quesadilla",
      desc: "Tortillas, beans, and cheese in a skillet.",
      cal: 380, p: 18, c: 42, f: 14,
      ingredients: [{ item: "tortillas", amount: "2" }, { item: "beans", amount: "1/2 cup" }, { item: "cheese", amount: "1 oz" }],
      steps: ["Warm the tortillas with beans and cheese until the cheese melts."],
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
  return { ...plate(name, desc, cal, p, c, f, ingredients), source: "menu", orderOnly: true };
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
      plate("Egg white bites", "Egg white and red pepper bites.", 170, 12, 11, 8, [
        { item: "egg white bites", amount: "1 order" },
      ]),
      plate("Turkey bacon sandwich", "The turkey bacon, egg white, and cheddar.", 230, 17, 28, 5, [
        { item: "turkey bacon sandwich", amount: "1" },
      ]),
    ],
  },
  {
    test: (text) => /\btrader joe/.test(text),
    meals: [
      plate("Grilled chicken strips", "A bag of grilled chicken and a salad kit.", 320, 36, 8, 12, [
        { item: "grilled chicken strips", amount: "4 oz" }, { item: "salad kit", amount: "1 serving" },
      ]),
      plate("Turkey burger", "Frozen turkey burger on a bun or lettuce.", 380, 28, 24, 16, [
        { item: "turkey burger", amount: "1" },
      ]),
    ],
  },
  {
    test: (text) => /\bchick[- ]?fil[- ]?a\b/.test(text),
    meals: [
      plate("Grilled nuggets", "An 8-count with a fruit cup.", 130, 25, 2, 3, [
        { item: "grilled nuggets", amount: "8-count" }, { item: "fruit cup", amount: "1" },
      ]),
      plate("Grilled chicken sandwich", "Grilled sandwich, no sauce if you want it lighter.", 380, 37, 41, 6, [
        { item: "grilled chicken sandwich", amount: "1" },
      ]),
    ],
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
  plate("Peanut butter toast and fruit", "Toast, peanut butter, and a piece of fruit.", 320, 12, 40, 12, [
    { item: "toast", amount: "1 slice" }, { item: "peanut butter", amount: "1 tbsp" }, { item: "fruit", amount: "1" },
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
  });
  return macrosPlausible(meal) ? meal : null;
}

function addMeal(out, seen, raw, slot, diet, constraints, skipNames, profile) {
  if (!raw) return;
  if (slot === "breakfast" && /\brotisserie chicken pieces\b/i.test(raw.name || "")) return;
  if (slot && slot !== "snack" && (Number(raw.p) || 0) < MEAL_PROTEIN_FLOOR && !raw.orderOnly) return;
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

function rotateList(list, skipNames = []) {
  const n = (skipNames || []).length;
  if (!n || !list?.length) return list || [];
  const start = n % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
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
  const oneHanded = HANDS_FULL.test(asked) || /\b(one[- ]handed|holding (the )?baby)\b/i.test(asked);
  const add = (raw) => {
    if (oneHanded && /\b(bowl|soup|oatmeal)\b/i.test(String(raw?.name || ""))) return;
    addMeal(out, seen, raw, slot, diet, constraints, skip, profile);
  };
  const kitchen = mode === "kitchen";
  const place = restaurantFromAsk(text);

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
  if (/\btacos?\b/.test(asked)) {
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
  if (constraints.vegetarian) {
    for (const meal of VEG_PLATES) add(meal);
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

  for (const rule of FROM_WHAT_SHE_HAS) {
    if (rule.test(inventory)) add(rule.meal);
    if (out.length >= count) return out.slice(0, count);
  }

  if (place) {
    for (const rule of PLACE_PLATES) {
      if (!rule.test(inventory)) continue;
      for (const meal of rule.meals) add(meal);
    }
    if (out.length >= count) return out.slice(0, count);
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

  const preferred = recipesForSlot(slot);
  for (const recipe of preferred) {
    add(recipePlate(recipe.name));
    if (out.length >= count) return out.slice(0, count);
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
  const kept = filterCoachMeals(out, { text, profile, skipNames: skip });
  if (kept.length) return kept.slice(0, count);
  const last = asMeal(ALLERGEN_FREE[0], slot);
  return last ? [last] : out.slice(0, count);
}

function offerLine(meals) {
  const names = (meals || []).map((meal) => meal.name).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `Here's ${names[0]}.`;
  if (names.length === 2) return `Here's ${names[0]}, or ${names[1]}.`;
  return `Here's ${names[0]}, ${names[1]}, or ${names[2]}.`;
}

export function warmMealReply(meals, text = "") {
  if ((meals || []).some((meal) => meal?.fromSaved)) return COACH_LOCAL_PICKS_LINE;
  const offer = offerLine(meals);
  if (!offer) return COACH_LOCAL_PICKS_LINE;
  const asked = String(text || "").toLowerCase();
  let lead = "";
  const gap = asked.match(/(\d+)\s*g(?:rams)?\s+(?:of\s+)?protein/);
  if (gap && meals.length >= 2) {
    const need = Number(gap[1]);
    const two = (Number(meals[0]?.p) || 0) + (Number(meals[1]?.p) || 0);
    if (need > 0 && two >= need) lead = "Have both and you're basically there. ";
  }
  if (!lead && isGuiltAsk(asked)) lead = `${COACH_GUILT_LINE} `;
  if (/\brotisserie\b/.test(asked) || (/\bchicken\b/.test(asked) && /\brice\b/.test(asked))) {
    lead = "Since you've got chicken and rice already, ";
  } else if (/\bchipotle\b/.test(asked)) {
    lead = "At Chipotle, ";
  } else if (/\bthai\b/.test(asked)) {
    lead = "For Thai tonight, ";
  } else if (/\btacos?\b/.test(asked)) {
    lead = "Yes — tacos work. ";
  } else if (/\b(don'?t have to cook|no cooking|no[- ]cook)\b/.test(asked)) {
    lead = "Nothing to cook: ";
  } else if (asked.trim()) {
    lead = "Here's something that fits what you asked. ";
  }
  if (!lead) return offer;
  return `${lead}${offer.charAt(0).toLowerCase()}${offer.slice(1)}`;
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
  const want = Math.max(2, count || 3);
  const list = filterCoachMeals(
    Array.isArray(meals) ? meals.filter((meal) => meal?.name) : [],
    { text, profile, skipNames, priorAsks },
  );
  if (!force && list.length >= want) {
    const shownEarly = list.slice(0, want);
    return {
      meals: shownEarly,
      reply: alignReplyToMeals(String(reply || "").trim() || fallbackMealReply(shownEarly), shownEarly),
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
  return {
    meals: shown,
    reply: alignReplyToMeals(String(reply || "").trim() || fallbackMealReply(shown), shown),
    filled: shown.length > list.length,
  };
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
  const names = (meals || [])
    .map((meal) => meal.name)
    .filter((name) => name && !alreadyNamed.has(mealBaseName(name)));
  if (!names.length) return "";
  if (names.length === 1) return `If you'd rather, there's also ${names[0]}.`;
  if (names.length === 2) return `If you'd rather, there's also ${names[0]} or ${names[1]}.`;
  return `If you'd rather, there's also ${names[0]}, ${names[1]}, or ${names[2]}.`;
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
  out = out.replace(/^Or\s+/i, "If you'd rather, there's also ");
  out = out.replace(/\s+Or\s+/g, " If you'd rather, there's also ");
  return out.replace(/\s{2,}/g, " ").trim();
}
