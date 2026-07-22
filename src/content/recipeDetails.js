/**
 * Expandable recipe detail for the default Meals bank.
 * Keys match RECIPES[].name — keeps data.js macros as source of truth.
 */
export const RECIPE_DETAILS = {
  "Protein oatmeal": {
    ingredients: [
      { amount: "40g (½ cup)", item: "dry oats, cooked in water" },
      { amount: "30g (1 scoop)", item: "vanilla protein" },
      { amount: "100g (⅔ cup)", item: "berries" },
      { amount: "pinch", item: "cinnamon" },
    ],
    steps: [
      "Cook oats in water until thick.",
      "Stir in protein off heat until smooth.",
      "Top with berries and cinnamon.",
    ],
  },
  "Berry protein smoothie": {
    ingredients: [
      { amount: "30g (1 scoop)", item: "protein powder" },
      { amount: "140g (1 cup)", item: "frozen berries" },
      { amount: "½", item: "medium banana" },
      { amount: "1 cup", item: "spinach" },
      { amount: "1 cup", item: "unsweetened almond milk" },
    ],
    steps: ["Add everything to a blender.", "Blend until smooth; drink cold."],
  },
  "Sausage, egg + whites": {
    ingredients: [
      { amount: "2", item: "chicken breakfast sausage links" },
      { amount: "1", item: "large egg" },
      { amount: "120g (½ cup)", item: "egg whites" },
      { amount: "1 slice (2 oz)", item: "sourdough" },
    ],
    steps: [
      "Cook sausage in a nonstick pan.",
      "Scramble egg + whites alongside.",
      "Toast sourdough; plate together.",
    ],
  },
  "Greek yogurt bowl": {
    ingredients: [
      { amount: "227g (1 cup)", item: "nonfat Greek yogurt" },
      { amount: "1 tbsp", item: "honey" },
      { amount: "28g (¼ cup)", item: "granola" },
      { amount: "75g (½ cup)", item: "berries" },
    ],
    steps: ["Spoon yogurt into a bowl.", "Drizzle honey; top with granola and berries."],
  },
  "Egg white veggie scramble": {
    ingredients: [
      { amount: "1", item: "large egg" },
      { amount: "180g (¾ cup)", item: "egg whites" },
      { amount: "½ cup", item: "peppers" },
      { amount: "1 cup", item: "spinach" },
      { amount: "2", item: "chicken breakfast sausage links" },
      { amount: "1", item: "small orange" },
    ],
    steps: [
      "Sauté peppers and spinach; scramble egg + whites in.",
      "Cook sausage on the side.",
      "Serve with the orange.",
    ],
  },
  "Cottage cheese + peach": {
    ingredients: [
      { amount: "226g (1 cup)", item: "2% cottage cheese" },
      { amount: "1", item: "medium peach, sliced" },
      { amount: "1 tsp", item: "honey" },
      { amount: "10g (1 tbsp)", item: "hemp seeds" },
    ],
    steps: ["Bowl the cottage cheese.", "Top with peach, honey, and hemp seeds."],
  },
  "Protein pancakes": {
    ingredients: [
      { amount: "40g (½ cup)", item: "dry oats, blended" },
      { amount: "1", item: "large egg" },
      { amount: "30g (1 scoop)", item: "vanilla protein" },
      { amount: "60g (¼ cup)", item: "unsweetened applesauce" },
      { amount: "½ tsp", item: "baking powder" },
      { amount: "1 tbsp", item: "maple syrup (topping)" },
    ],
    steps: [
      "Blend oats, egg, protein, applesauce, and baking powder.",
      "Cook as small pancakes on a nonstick pan.",
      "Top with maple syrup.",
    ],
  },
  "Chicken salad on sourdough": {
    ingredients: [
      { amount: "140g (5 oz)", item: "shredded cooked chicken breast" },
      { amount: "45g (3 tbsp)", item: "nonfat Greek yogurt" },
      { amount: "1 tsp", item: "Dijon" },
      { amount: "¼ cup", item: "diced celery" },
      { amount: "1 slice (2 oz)", item: "toasted sourdough" },
    ],
    steps: [
      "Mix chicken, yogurt, Dijon, and celery.",
      "Toast sourdough; pile salad on top open-face.",
    ],
  },
  "Tuna salad lettuce wraps": {
    ingredients: [
      { amount: "1 can (5 oz)", item: "wild tuna in water, drained" },
      { amount: "45g (3 tbsp)", item: "nonfat Greek yogurt" },
      { amount: "to taste", item: "fresh dill + lemon" },
      { amount: "6", item: "butter lettuce cups" },
      { amount: "1", item: "medium apple" },
    ],
    steps: [
      "Mix tuna, yogurt, dill, and lemon.",
      "Spoon into lettuce cups; serve with the apple.",
    ],
  },
  "Grilled chicken big salad": {
    ingredients: [
      { amount: "170g (6 oz)", item: "grilled chicken breast" },
      { amount: "3 cups", item: "romaine" },
      { amount: "½ cup", item: "cucumber" },
      { amount: "½ cup", item: "cherry tomatoes" },
      { amount: "10g (2 tbsp)", item: "shaved parmesan" },
      { amount: "2 tbsp", item: "light vinaigrette" },
    ],
    steps: [
      "Chop greens and veg into a big bowl.",
      "Slice chicken on top; finish with parmesan and vinaigrette.",
    ],
  },
  "Turkey sausage rice bowl": {
    ingredients: [
      { amount: "2", item: "turkey sausage links, sliced" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "zucchini" },
      { amount: "½ cup", item: "bell pepper" },
      { amount: "spray", item: "olive oil spray" },
    ],
    steps: [
      "Sauté sausage, zucchini, and pepper with oil spray.",
      "Serve over rice.",
    ],
  },
  "Salmon salad bowl": {
    ingredients: [
      { amount: "140g (5 oz)", item: "leftover cooked wild salmon" },
      { amount: "3 cups", item: "mixed greens" },
      { amount: "½ cup", item: "cucumber" },
      { amount: "¼", item: "avocado" },
      { amount: "1", item: "lemon, big squeeze" },
    ],
    steps: [
      "Build a green salad with cucumber and avocado.",
      "Flake salmon on top; finish with lemon (no oil needed).",
    ],
  },
  "Pulled chicken + slaw bowl": {
    ingredients: [
      { amount: "140g (5 oz)", item: "pulled chicken breast" },
      { amount: "119g (¾ cup)", item: "cooked rice" },
      { amount: "1½ cups", item: "shredded cabbage" },
      { amount: "30g (2 tbsp)", item: "nonfat Greek yogurt" },
      { amount: "to taste", item: "lime" },
    ],
    steps: [
      "Toss cabbage with yogurt and lime for slaw.",
      "Plate rice, chicken, and slaw.",
    ],
  },
  "Chicken quinoa jar salad": {
    ingredients: [
      { amount: "113g (4 oz)", item: "cooked chicken breast" },
      { amount: "92g (½ cup)", item: "cooked quinoa" },
      { amount: "41g (¼ cup)", item: "chickpeas" },
      { amount: "½ cup", item: "cherry tomatoes" },
      { amount: "28g (2 tbsp)", item: "crumbled feta" },
      { amount: "1 tbsp", item: "light vinaigrette" },
    ],
    steps: [
      "Layer quinoa, chickpeas, chicken, tomatoes, and feta in a jar.",
      "Add vinaigrette when ready to eat; shake and serve. Prep 3 at once.",
    ],
  },
  "Callie's chicken teriyaki": {
    ingredients: [
      { amount: "6 oz", item: "raw boneless skinless chicken thighs + ¼ of glaze (her plate)" },
      { amount: "batch", item: "glaze: 3 tbsp honey + ¼ cup tamari + garlic + ginger" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "steamed broccoli" },
    ],
    steps: [
      "Whisk honey, tamari, garlic, and ginger for the glaze.",
      "Cook thighs; brush with glaze through the finish.",
      "Plate her serving with rice and broccoli (batch serves 4 — leftovers for family).",
    ],
  },
  "Salmon + potatoes": {
    ingredients: [
      { amount: "170g (6 oz)", item: "wild salmon fillet (her plate)" },
      { amount: "170g (6 oz)", item: "roasted baby potatoes" },
      { amount: "6", item: "asparagus spears" },
      { amount: "1 tsp", item: "olive oil" },
      { amount: "to taste", item: "lemon" },
    ],
    steps: [
      "Roast potatoes and asparagus with oil.",
      "Cook salmon; plate with lemon.",
    ],
  },
  "Halibut + rice": {
    ingredients: [
      { amount: "170g (6 oz)", item: "halibut fillet" },
      { amount: "1 tsp", item: "garlic butter" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "zucchini, oil-spray sautéed" },
    ],
    steps: [
      "Pan-sear halibut; finish with garlic butter.",
      "Serve with rice and zucchini.",
    ],
  },
  "Pulled chicken tacos": {
    ingredients: [
      { amount: "140g (5 oz)", item: "pulled chicken breast" },
      { amount: "3", item: "corn tortillas" },
      { amount: "¾ cup", item: "cabbage slaw with lime" },
      { amount: "¼ cup", item: "salsa" },
    ],
    steps: [
      "Warm tortillas.",
      "Fill with chicken, slaw, and salsa.",
    ],
  },
  "Turkey meatballs + rice": {
    ingredients: [
      { amount: "3", item: "turkey meatballs (from 99% lean batch)" },
      { amount: "½ cup", item: "marinara" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "green beans" },
    ],
    steps: [
      "Warm meatballs in marinara.",
      "Serve over rice with green beans.",
    ],
  },
  "Sheet pan chicken": {
    ingredients: [
      { amount: "170g (6 oz)", item: "raw chicken breast" },
      { amount: "133g (1 cup)", item: "cubed sweet potato" },
      { amount: "1 cup", item: "brussels sprouts" },
      { amount: "2 tsp", item: "olive oil + herbs" },
    ],
    steps: [
      "Toss chicken and veg with oil and herbs on a sheet pan.",
      "Roast at 425°F for about 25 minutes.",
    ],
  },
  "Ground turkey stir fry": {
    ingredients: [
      { amount: "¼ skillet", item: "93% lean ground turkey + stir-fry veg" },
      { amount: "batch sauce", item: "3 tbsp coconut aminos + 1 tbsp honey + garlic" },
      { amount: "158g (1 cup)", item: "cooked rice" },
    ],
    steps: [
      "Brown turkey; add frozen veg and sauce.",
      "Serve her quarter of the skillet over rice.",
    ],
  },
  "Greek yogurt + berries": {
    ingredients: [
      { amount: "170g", item: "nonfat Greek yogurt" },
      { amount: "75g", item: "berries" },
    ],
    steps: ["Bowl yogurt; top with berries. Eat cold."],
  },
  "Cottage cheese + cucumber": {
    ingredients: [
      { amount: "150g", item: "2% cottage cheese" },
      { amount: "1 cup", item: "cucumber slices" },
      { amount: "to taste", item: "cracked pepper" },
    ],
    steps: ["Bowl cottage cheese; add cucumber and pepper."],
  },
  "Protein shake": {
    ingredients: [
      { amount: "30g (1 scoop)", item: "protein powder" },
      { amount: "1 cup", item: "unsweetened almond milk" },
      { amount: "as needed", item: "ice" },
    ],
    steps: ["Shake or blend until smooth."],
  },
  "Apple + peanut butter": {
    ingredients: [
      { amount: "1", item: "medium apple, sliced" },
      { amount: "16g (1 tbsp)", item: "natural peanut butter" },
    ],
    steps: ["Slice apple; dip or spread with peanut butter."],
  },
};

/** Attach ingredients/steps onto a RECIPES row (or pass-through if already present). */
export function withRecipeDetail(recipe) {
  if (!recipe) return recipe;
  if (recipe.ingredients?.length && recipe.steps?.length) return recipe;
  const detail = RECIPE_DETAILS[recipe.name] || {};
  return {
    ...recipe,
    ingredients: recipe.ingredients?.length ? recipe.ingredients : detail.ingredients || [],
    steps: recipe.steps?.length ? recipe.steps : detail.steps || [],
  };
}

/** Normalize AI / published meal into the same card shape as default recipes. */
export function mealToCard(meal) {
  const slot = (meal.slot || meal.cat || "").toString();
  const cat = slot ? slot.charAt(0).toUpperCase() + slot.slice(1).toLowerCase() : "Meal";
  return withRecipeDetail({
    cat,
    slot: slot.toLowerCase() || null,
    name: meal.name,
    desc: meal.why || meal.desc || "",
    why: meal.why || "",
    basedOn: meal.basedOn || null,
    cal: meal.cal,
    p: meal.p,
    c: meal.c,
    f: meal.f,
    serves: meal.servings || meal.serves || 1,
    ingredients: meal.ingredients || [],
    steps: meal.steps || [],
  });
}
