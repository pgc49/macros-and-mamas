import { RECIPES } from "./data";

/**
 * Default Mon–Sun sample week from Callie's shared recipe bank.
 * Shown on Meals → By Day before a personalized plan is published.
 * Macros are per logged serving (same as the recipe cards).
 */
const pick = (name) => {
  const r = RECIPES.find((x) => x.name === name);
  if (!r) throw new Error(`defaultWeek missing recipe: ${name}`);
  return r;
};

export const DEFAULT_WEEK = [
  {
    day: "Mon",
    theme: "protein oats start",
    meals: [
      pick("Protein oatmeal"),
      pick("Grilled chicken big salad"),
      pick("Callie's chicken teriyaki"),
      pick("Greek yogurt + berries"),
    ],
  },
  {
    day: "Tue",
    theme: "smoothie + sheet pan",
    meals: [
      pick("Berry protein smoothie"),
      pick("Chicken salad on sourdough"),
      pick("Sheet pan chicken"),
      pick("Apple + peanut butter"),
    ],
  },
  {
    day: "Wed",
    theme: "sausage scramble day",
    meals: [
      pick("Sausage, egg + whites"),
      pick("Turkey sausage rice bowl"),
      pick("Pulled chicken tacos"),
      pick("Cottage cheese + cucumber"),
    ],
  },
  {
    day: "Thu",
    theme: "yogurt + salmon leftover lunch",
    meals: [
      pick("Greek yogurt bowl"),
      pick("Salmon salad bowl"),
      pick("Turkey meatballs + rice"),
      pick("Protein shake"),
    ],
  },
  {
    day: "Fri",
    theme: "veggie scramble + stir fry",
    meals: [
      pick("Egg white veggie scramble"),
      pick("Pulled chicken + slaw bowl"),
      pick("Ground turkey stir fry"),
      pick("Greek yogurt + berries"),
    ],
  },
  {
    day: "Sat",
    theme: "pancakes + family salmon",
    meals: [
      pick("Protein pancakes"),
      pick("Tuna salad lettuce wraps"),
      pick("Salmon + potatoes"),
      pick("Apple + peanut butter"),
    ],
  },
  {
    day: "Sun",
    theme: "cottage peach + jar salad",
    meals: [
      pick("Cottage cheese + peach"),
      pick("Chicken quinoa jar salad"),
      pick("Halibut + rice"),
      pick("Cottage cheese + cucumber"),
    ],
  },
];
