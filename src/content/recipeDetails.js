/**
 * Expandable recipe detail for the default Meals bank.
 * Keys match RECIPES[].name — keeps data.js macros as source of truth.
 *
 * Shape per recipe:
 *   batch:   full cook quantities when serves > 1 (family batch), else null
 *   serving: plate amounts that match the logged macros
 *   steps:   4–7 detailed cooking steps
 */
export const RECIPE_DETAILS = {
  "Protein oatmeal": {
    batch: null,
    serving: [
      { amount: "40g (½ cup)", item: "dry rolled oats, cooked in water" },
      { amount: "30g (1 scoop)", item: "vanilla protein powder" },
      { amount: "100g (⅔ cup)", item: "fresh or frozen berries" },
      { amount: "pinch", item: "cinnamon" },
    ],
    steps: [
      "Measure 40g dry oats into a small saucepan and cover with about 1 cup water (add a splash more if you like looser oatmeal).",
      "Bring to a gentle simmer over medium heat, then cook 4–6 minutes, stirring often, until the oats are thick and creamy.",
      "Take the pan off the heat and let it sit 30–60 seconds so it isn’t boiling-hot — this keeps the protein from clumping.",
      "Sprinkle in the scoop of vanilla protein and stir vigorously until fully dissolved and smooth. If it seizes, splash in a little warm water and keep stirring.",
      "Spoon into a bowl, top with 100g berries and a pinch of cinnamon, and eat warm.",
    ],
  },

  "Berry protein smoothie": {
    batch: null,
    serving: [
      { amount: "30g (1 scoop)", item: "protein powder" },
      { amount: "140g (1 cup)", item: "frozen berries" },
      { amount: "½", item: "medium banana" },
      { amount: "1 cup", item: "fresh spinach" },
      { amount: "1 cup", item: "unsweetened almond milk" },
    ],
    steps: [
      "Add the almond milk to the blender first so the blades catch easily.",
      "Layer in the spinach, half banana (fresh or frozen), frozen berries, and protein powder on top.",
      "Blend on high 45–60 seconds until completely smooth — no spinach flecks. Stop and scrape the sides once if needed.",
      "If it’s too thick to pour, add 2–3 tbsp more almond milk and blend again briefly.",
      "Pour into a glass and drink cold right away (or chill 5 minutes if you prefer it colder).",
    ],
  },

  "Sausage, egg + whites": {
    batch: null,
    serving: [
      { amount: "2", item: "chicken or turkey breakfast sausage links (Applegate or similar, no added sugar when you can)" },
      { amount: "1", item: "large egg" },
      { amount: "120g (½ cup)", item: "liquid egg whites" },
      { amount: "1 slice (2 oz)", item: "sourdough bread" },
    ],
    steps: [
      "Warm a nonstick skillet over medium heat. Add the two sausage links and cook 6–8 minutes, turning so all sides brown and they’re cooked through (no pink).",
      "Push sausage to one side (or remove to a plate). In a small bowl whisk the whole egg with 120g egg whites until evenly combined.",
      "Pour the egg mixture into the empty side of the pan. Let it set for 20–30 seconds, then scramble gently with a spatula until just cooked through — soft, not dry — about 2–3 minutes.",
      "Meanwhile toast the sourdough slice until golden.",
      "Plate sausage, scramble, and toast together; season eggs with a pinch of salt and pepper if you like.",
    ],
  },

  "Greek yogurt bowl": {
    batch: null,
    serving: [
      { amount: "227g (1 cup)", item: "nonfat Greek or European-style yogurt (House Foods organic is fine)" },
      { amount: "1 tbsp", item: "honey" },
      { amount: "28g (¼ cup)", item: "granola" },
      { amount: "75g (½ cup)", item: "berries" },
    ],
    steps: [
      "Spoon 227g cold yogurt into a bowl and smooth the top.",
      "Drizzle 1 tbsp honey evenly over the yogurt (warm the honey 5–10 seconds if it’s too thick to pour).",
      "Scatter 28g granola across the top so it stays crunchy.",
      "Finish with 75g berries. Eat immediately so the granola doesn’t soften.",
    ],
  },

  "Egg white veggie scramble": {
    batch: null,
    serving: [
      { amount: "1", item: "large egg" },
      { amount: "180g (¾ cup)", item: "liquid egg whites" },
      { amount: "½ cup", item: "diced bell peppers" },
      { amount: "1 cup", item: "fresh spinach" },
      { amount: "2", item: "chicken or turkey breakfast sausage links (Applegate or similar, no added sugar when you can)" },
      { amount: "1", item: "small orange" },
    ],
    steps: [
      "Cook the two sausage links in a nonstick skillet over medium heat, turning, until browned and cooked through, 6–8 minutes. Set aside on a plate.",
      "In the same pan, sauté the diced peppers with a light mist of oil spray for 2–3 minutes until they start to soften.",
      "Add the spinach and cook 30–60 seconds until just wilted.",
      "Whisk the whole egg with 180g egg whites. Pour over the veggies, let set briefly, then scramble gently until the eggs are set but still soft, 2–3 minutes.",
      "Plate the scramble with the sausage. Peel and serve the orange on the side.",
    ],
  },

  "Cottage cheese + peach": {
    batch: null,
    serving: [
      { amount: "226g (1 cup)", item: "2% cottage cheese" },
      { amount: "1", item: "medium peach, sliced" },
      { amount: "1 tsp", item: "honey" },
      { amount: "10g (1 tbsp)", item: "hemp seeds" },
    ],
    steps: [
      "Spoon 226g cottage cheese into a bowl.",
      "Wash and slice the peach into thin wedges (leave the skin on if you like).",
      "Arrange peach slices over the cottage cheese, drizzle with 1 tsp honey, and sprinkle 10g hemp seeds on top.",
      "Eat cold. If the peach is firm, let it sit at room temp 10 minutes first so it’s sweeter and juicier.",
    ],
  },

  "Protein pancakes": {
    batch: null,
    serving: [
      { amount: "40g (½ cup)", item: "dry rolled oats, blended into flour" },
      { amount: "1", item: "large egg" },
      { amount: "30g (1 scoop)", item: "vanilla protein powder" },
      { amount: "60g (¼ cup)", item: "unsweetened applesauce" },
      { amount: "½ tsp", item: "baking powder" },
      { amount: "1 tbsp", item: "maple syrup (topping)" },
    ],
    steps: [
      "Blend the dry oats in a blender or food processor until they look like fine flour, about 20–30 seconds.",
      "Add the egg, protein powder, applesauce, and baking powder. Blend until you have a thick, pourable batter with no dry pockets. Rest 2 minutes so the oats hydrate.",
      "Heat a nonstick skillet or griddle over medium-low. Lightly mist with oil spray.",
      "Scoop small pancakes (about ¼ cup batter each). Cook 2–3 minutes until bubbles form and edges look set, then flip carefully and cook 1–2 minutes more. Lower the heat if they brown too fast — protein batter burns easily.",
      "Stack on a plate and drizzle with 1 tbsp maple syrup while warm.",
    ],
  },

  "Chicken salad on sourdough": {
    batch: null,
    serving: [
      { amount: "140g (5 oz)", item: "shredded cooked chicken breast" },
      { amount: "45g (3 tbsp)", item: "nonfat Greek or European-style yogurt (House Foods organic is fine)" },
      { amount: "1 tsp", item: "Dijon mustard" },
      { amount: "¼ cup", item: "diced celery" },
      { amount: "1 slice (2 oz)", item: "sourdough bread, toasted" },
    ],
    steps: [
      "If using leftover chicken, shred or finely chop 140g. If starting from raw, poach or bake a breast until 165°F, cool slightly, then shred.",
      "In a bowl, stir together the yogurt, Dijon, and a pinch of salt and pepper until smooth.",
      "Fold in the shredded chicken and diced celery until evenly coated. Taste and adjust Dijon or salt.",
      "Toast the sourdough until deep golden and crisp.",
      "Pile the chicken salad open-face on the toast and eat right away so the bread stays crunchy.",
    ],
  },

  "Tuna salad lettuce wraps": {
    batch: null,
    serving: [
      { amount: "1 can (5 oz)", item: "wild tuna in water, drained well" },
      { amount: "45g (3 tbsp)", item: "nonfat Greek or European-style yogurt (House Foods organic is fine)" },
      { amount: "to taste", item: "fresh dill + lemon juice" },
      { amount: "6", item: "butter lettuce cups" },
      { amount: "1", item: "medium apple" },
    ],
    steps: [
      "Drain the tuna thoroughly and flake it into a bowl with a fork.",
      "Stir in the yogurt, chopped fresh dill, and a generous squeeze of lemon until creamy. Season with black pepper.",
      "Separate and rinse 6 butter lettuce leaves; pat dry so they don’t get soggy.",
      "Spoon tuna salad evenly into the lettuce cups.",
      "Serve with the apple on the side — slice it if you like for easy bites.",
    ],
  },

  "Grilled chicken big salad": {
    batch: null,
    serving: [
      { amount: "170g (6 oz)", item: "grilled chicken breast" },
      { amount: "3 cups", item: "chopped romaine" },
      { amount: "½ cup", item: "cucumber, sliced" },
      { amount: "½ cup", item: "cherry tomatoes, halved" },
      { amount: "10g (2 tbsp)", item: "shaved parmesan" },
      { amount: "2 tbsp", item: "light vinaigrette" },
    ],
    steps: [
      "Season the chicken breast with salt, pepper, and a light mist of oil. Grill or pan-sear over medium-high heat 5–7 minutes per side until the thickest part hits 165°F. Rest 5 minutes, then slice.",
      "While the chicken rests, chop romaine into bite-size pieces and add to a large bowl with cucumber and halved cherry tomatoes.",
      "Toss the greens with 2 tbsp light vinaigrette so everything is lightly coated.",
      "Fan the sliced chicken over the salad, shave or sprinkle the parmesan on top, and serve immediately.",
    ],
  },

  "Turkey sausage rice bowl": {
    batch: null,
    serving: [
      { amount: "2", item: "turkey sausage links, sliced" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "zucchini, sliced" },
      { amount: "½ cup", item: "bell pepper, sliced" },
      { amount: "spray", item: "olive oil spray" },
    ],
    steps: [
      "If rice isn’t ready, cook it per package directions and measure 1 cup cooked for your plate.",
      "Slice the turkey sausage into coins. Heat a skillet over medium, mist with olive oil spray, and brown the sausage 4–5 minutes, stirring.",
      "Add zucchini and bell pepper. Sauté 4–6 minutes until the veg is tender-crisp and the sausage is heated through.",
      "Spoon the sausage-veg mix over the rice in a bowl. Season with a pinch of salt, pepper, or chili flakes if you like.",
    ],
  },

  "Salmon salad bowl": {
    batch: null,
    serving: [
      { amount: "140g (5 oz)", item: "leftover cooked wild salmon" },
      { amount: "3 cups", item: "mixed greens" },
      { amount: "½ cup", item: "cucumber, sliced" },
      { amount: "¼", item: "avocado, sliced" },
      { amount: "1", item: "lemon, big squeeze" },
    ],
    steps: [
      "If salmon is fridge-cold, flake it into large pieces and let it sit 5–10 minutes so it isn’t icy — or warm gently in a skillet 1–2 minutes.",
      "Build a bed of mixed greens in a bowl and top with cucumber and avocado slices.",
      "Flake the 140g salmon over the salad.",
      "Squeeze a generous amount of lemon over everything (no oil needed — the avocado brings the richness). Add cracked pepper and eat right away.",
    ],
  },

  "Pulled chicken + slaw bowl": {
    batch: null,
    serving: [
      { amount: "140g (5 oz)", item: "pulled cooked chicken breast" },
      { amount: "119g (¾ cup)", item: "cooked rice" },
      { amount: "1½ cups", item: "shredded cabbage" },
      { amount: "30g (2 tbsp)", item: "nonfat Greek or European-style yogurt (House Foods organic is fine)" },
      { amount: "to taste", item: "fresh lime juice + pinch of salt" },
    ],
    steps: [
      "Warm the pulled chicken gently in a skillet with a splash of water or broth so it stays moist, 2–3 minutes. Warm or cook rice and measure ¾ cup.",
      "In a bowl, toss shredded cabbage with the yogurt, a big squeeze of lime, and a pinch of salt until lightly coated — that’s your slaw.",
      "Plate the rice, pile chicken next to or on top, and add the slaw alongside.",
      "Finish with another lime squeeze if you want it brighter.",
    ],
  },

  "Chicken quinoa jar salad": {
    batch: null,
    serving: [
      { amount: "113g (4 oz)", item: "cooked chicken breast, diced" },
      { amount: "92g (½ cup)", item: "cooked quinoa, cooled" },
      { amount: "41g (¼ cup)", item: "chickpeas, rinsed and drained" },
      { amount: "½ cup", item: "cherry tomatoes, halved" },
      { amount: "28g (2 tbsp)", item: "crumbled feta" },
      { amount: "1 tbsp", item: "light vinaigrette" },
    ],
    steps: [
      "Cook quinoa ahead and cool completely. Dice cooked chicken. Rinse chickpeas. Halve tomatoes. (Tip: multiply everything by 3 and build three jars at once for grab-and-go lunches.)",
      "In a wide-mouth jar, layer from the bottom up: quinoa, chickpeas, chicken, tomatoes, then feta on top so greens/cheese stay dry.",
      "Keep the vinaigrette in a small container or pour it into the jar just before eating.",
      "When ready to eat, add the 1 tbsp vinaigrette, seal, shake hard to dress, and pour into a bowl — or eat from the jar.",
      "Jars keep 3–4 days sealed in the fridge; add dressing only when you’re ready to eat.",
    ],
  },

  "Callie's chicken teriyaki": {
    batch: [
      { amount: "1½ lbs", item: "boneless skinless chicken thighs" },
      { amount: "3 tbsp", item: "honey" },
      { amount: "¼ cup", item: "coconut aminos" },
      { amount: "2–3 cloves", item: "garlic, minced" },
      { amount: "1 tbsp", item: "fresh ginger, grated (or 1 tsp ground)" },
      { amount: "about 4 cups", item: "cooked rice (1 cup per plate)" },
      { amount: "about 4 cups", item: "broccoli florets (1 cup steamed per plate)" },
    ],
    serving: [
      { amount: "6 oz", item: "raw boneless skinless chicken thighs + ¼ of the glaze" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "steamed broccoli" },
    ],
    steps: [
      "Whisk the honey, coconut aminos, minced garlic, and ginger in a bowl until the honey dissolves — that’s the full glaze for the batch.",
      "Pat the thighs dry and season lightly with salt and pepper. Heat a large skillet over medium-high with a light film of oil.",
      "Sear thighs 4–5 minutes per side until browned. Pour in the glaze, lower heat to medium, and simmer 8–12 minutes, turning and basting, until chicken hits 165°F and the glaze is sticky and glossy. Rest 5 minutes, then slice or portion.",
      "Meanwhile steam broccoli until bright green and tender-crisp, 4–6 minutes. Cook rice if you haven’t already.",
      "For her logged plate: portion about 6 oz raw-weight thighs (roughly ¼ of the batch) with ¼ of the glaze, 1 cup rice, and 1 cup broccoli. Leftovers cover the other three servings.",
    ],
  },

  "Salmon + potatoes": {
    batch: [
      { amount: "2", item: "wild salmon fillets, ~6 oz (170g) each" },
      { amount: "12 oz (340g)", item: "baby potatoes, halved" },
      { amount: "12", item: "asparagus spears, trimmed" },
      { amount: "2 tsp", item: "olive oil (split across both plates)" },
      { amount: "1", item: "lemon, cut into wedges" },
      { amount: "to taste", item: "salt, pepper, garlic powder or herbs" },
    ],
    serving: [
      { amount: "1", item: "wild salmon fillet, ~6 oz (170g)" },
      { amount: "170g (6 oz)", item: "roasted baby potatoes" },
      { amount: "6", item: "asparagus spears" },
      { amount: "1 tsp", item: "olive oil" },
      { amount: "to taste", item: "lemon" },
    ],
    steps: [
      "Heat oven to 425°F. Toss halved baby potatoes with 1 tsp of the oil, salt, and pepper on a sheet pan. Roast 15 minutes to get a head start.",
      "Toss asparagus with the remaining 1 tsp oil and a pinch of salt. Season both salmon fillets with salt, pepper, and a squeeze of lemon.",
      "Push potatoes aside, add asparagus and salmon (skin-side down if skin-on) to the pan. Roast 10–14 minutes more until salmon flakes easily and hits ~145°F in the center, and potatoes are fork-tender and golden.",
      "Plate one fillet per person with half the potatoes (~6 oz), 6 asparagus spears, and a lemon wedge. The logged serving is one full plate.",
    ],
  },

  "Halibut + rice": {
    batch: [
      { amount: "2", item: "halibut fillets, ~6 oz (170g) each" },
      { amount: "2 tsp", item: "garlic butter (1 tsp per fillet)" },
      { amount: "about 2 cups", item: "cooked rice (1 cup per plate)" },
      { amount: "2 cups", item: "zucchini, sliced (1 cup per plate)" },
      { amount: "spray", item: "olive oil spray" },
      { amount: "to taste", item: "salt, pepper, lemon" },
    ],
    serving: [
      { amount: "1", item: "halibut fillet, ~6 oz (170g)" },
      { amount: "1 tsp", item: "garlic butter" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "zucchini, oil-spray sautéed" },
    ],
    steps: [
      "Cook rice per package directions and keep warm. Pat halibut dry and season both sides with salt and pepper.",
      "Heat a nonstick skillet over medium-high. Mist lightly with oil spray. Sear fillets 3–4 minutes without moving until a golden crust forms.",
      "Flip carefully, add 1 tsp garlic butter on each fillet, and cook 2–4 minutes more until the fish is opaque and flakes easily (about 130–135°F). Spoon melted butter over the top.",
      "In a second pan (or the same after fish rests), mist with oil spray and sauté zucchini 4–5 minutes until tender-crisp; season lightly.",
      "Plate one fillet with 1 cup rice and 1 cup zucchini. Squeeze lemon over the fish if you like.",
    ],
  },

  "Pulled chicken tacos": {
    batch: [
      { amount: "1½ lbs", item: "boneless skinless chicken breast" },
      { amount: "1 cup", item: "salsa (plus extra for serving)" },
      { amount: "12", item: "corn tortillas (3 per plate)" },
      { amount: "about 3 cups", item: "shredded cabbage for slaw" },
      { amount: "to taste", item: "lime juice for the slaw" },
    ],
    serving: [
      { amount: "140g (5 oz)", item: "pulled chicken breast" },
      { amount: "3", item: "corn tortillas" },
      { amount: "¾ cup", item: "cabbage slaw with lime" },
      { amount: "¼ cup", item: "salsa" },
    ],
    steps: [
      "Place chicken breasts in a slow cooker (or Instant Pot) with 1 cup salsa. Slow-cook on low 4–6 hours (or high ~2–3 hours) until chicken shreds easily; Instant Pot: high pressure ~12 minutes + natural release 10 minutes.",
      "Shred chicken with two forks right in the salsa juices and keep warm. Toss shredded cabbage with lime juice and a pinch of salt for a quick slaw.",
      "Warm corn tortillas in a dry skillet 20–30 seconds per side, or wrap in a damp towel and microwave 30–45 seconds until pliable.",
      "For her logged plate: 5 oz (140g) pulled chicken across 3 tortillas, top with ¾ cup slaw and ¼ cup salsa. Batch makes about 4 plates.",
    ],
  },

  "Turkey meatballs + rice": {
    batch: [
      { amount: "1 lb", item: "99% lean ground turkey" },
      { amount: "1", item: "large egg" },
      { amount: "28g (¼ cup)", item: "breadcrumbs" },
      { amount: "to taste", item: "salt, pepper, garlic powder, Italian herbs" },
      { amount: "yield", item: "12 meatballs (3 per serving)" },
      { amount: "about 2 cups", item: "marinara (½ cup per plate)" },
      { amount: "about 4 cups", item: "cooked rice (1 cup per plate)" },
      { amount: "about 4 cups", item: "green beans (1 cup per plate)" },
    ],
    serving: [
      { amount: "3", item: "turkey meatballs" },
      { amount: "½ cup", item: "marinara" },
      { amount: "158g (1 cup)", item: "cooked rice" },
      { amount: "1 cup", item: "green beans" },
    ],
    steps: [
      "Heat oven to 400°F. In a bowl, mix turkey, egg, breadcrumbs, salt, pepper, garlic powder, and Italian herbs until just combined — don’t overwork.",
      "Roll into 12 even meatballs (about 1½ oz each) and place on a parchment-lined sheet. Bake 18–22 minutes until browned and 165°F in the center.",
      "Warm marinara in a saucepan. Add meatballs and simmer gently 5 minutes so they soak up sauce. Steam or boil green beans until tender-crisp, 4–6 minutes. Cook rice if needed.",
      "For her logged plate: 3 meatballs with ½ cup marinara over 1 cup rice, plus 1 cup green beans. Freeze leftover meatballs in sauce for quick dinners.",
    ],
  },

  "Sheet pan chicken": {
    batch: [
      { amount: "1½ lbs", item: "boneless skinless chicken breast (or tenders)" },
      { amount: "about 4 cups (532g)", item: "cubed sweet potato (1 cup / 133g per plate)" },
      { amount: "about 4 cups", item: "brussels sprouts, halved" },
      { amount: "8 tsp (about 2½ tbsp)", item: "olive oil + dried herbs (2 tsp oil per plate)" },
      { amount: "to taste", item: "salt, pepper, paprika or rosemary" },
    ],
    serving: [
      { amount: "170g (6 oz)", item: "raw chicken breast (cooked weight will be less)" },
      { amount: "133g (1 cup)", item: "cubed sweet potato, roasted" },
      { amount: "1 cup", item: "brussels sprouts, roasted" },
      { amount: "2 tsp", item: "olive oil + herbs" },
    ],
    steps: [
      "Heat oven to 425°F. Cube sweet potatoes into even ¾-inch pieces; trim and halve brussels sprouts. Cut chicken into even portions (~6 oz raw each) or leave whole and portion after cooking.",
      "On one or two sheet pans, toss chicken and vegetables with the oil, salt, pepper, and herbs so everything is lightly coated and in a single layer (crowding steams instead of roasts).",
      "Roast 22–28 minutes, flipping veg halfway, until sweet potatoes are tender, brussels are browned, and chicken hits 165°F.",
      "Rest chicken 5 minutes, then plate: 6 oz raw-weight chicken (about ¼ of the batch), 1 cup sweet potato, and 1 cup brussels. That’s the logged serving.",
    ],
  },

  "Ground turkey stir fry": {
    batch: [
      { amount: "1 lb", item: "93% lean ground turkey" },
      { amount: "4 cups", item: "frozen stir-fry vegetables" },
      { amount: "3 tbsp", item: "coconut aminos" },
      { amount: "1 tbsp", item: "honey" },
      { amount: "2–3 cloves", item: "garlic, minced" },
      { amount: "about 4 cups", item: "cooked rice (1 cup per plate)" },
    ],
    serving: [
      { amount: "¼ skillet", item: "turkey + stir-fry vegetables with sauce" },
      { amount: "158g (1 cup)", item: "cooked rice" },
    ],
    steps: [
      "Whisk coconut aminos, honey, and minced garlic for the sauce. Start rice so it’s ready when the stir-fry is done.",
      "Heat a large skillet or wok over medium-high. Add the ground turkey and break it up; cook 5–7 minutes until no pink remains and it starts to brown.",
      "Add the frozen vegetables straight to the pan. Stir-fry 5–8 minutes until hot and tender-crisp — don’t let them go mushy.",
      "Pour in the sauce, toss 1–2 minutes until everything is glossy and coated. Taste and add a splash more aminos if needed.",
      "For her logged plate: scoop ¼ of the skillet over 1 cup cooked rice. Leftovers reheat well for next-day lunches.",
    ],
  },

  "Greek yogurt + berries": {
    batch: null,
    serving: [
      { amount: "170g", item: "nonfat Greek or European-style yogurt (House Foods organic is fine)" },
      { amount: "75g", item: "berries" },
    ],
    steps: [
      "Spoon 170g cold yogurt into a small bowl — nonfat Greek or European-style (House Foods organic is fine).",
      "Rinse berries if fresh; if using frozen, measure 75g straight from the freezer for a colder snack.",
      "Scatter the berries over the yogurt. Leave them on top for texture, or fold once if you want them mixed in.",
      "Eat immediately so the berries stay bright and the yogurt stays cold.",
    ],
  },

  "Cottage cheese + cucumber": {
    batch: null,
    serving: [
      { amount: "150g", item: "2% cottage cheese" },
      { amount: "1 cup", item: "cucumber slices" },
      { amount: "to taste", item: "cracked black pepper" },
    ],
    steps: [
      "Spoon 150g cottage cheese into a bowl.",
      "Wash the cucumber and slice into thin rounds (peel if the skin is thick or waxed). Measure about 1 cup.",
      "Arrange cucumber on or beside the cottage cheese.",
      "Finish with plenty of cracked black pepper. Eat cold — no cooking needed.",
    ],
  },

  "Protein shake": {
    batch: null,
    serving: [
      { amount: "30g (1 scoop)", item: "protein powder" },
      { amount: "1 cup", item: "unsweetened almond milk" },
      { amount: "as needed", item: "ice" },
    ],
    steps: [
      "Add almond milk to a shaker bottle or blender first, then the scoop of protein.",
      "Add a handful of ice if you want it colder and thicker.",
      "Shake hard for 20–30 seconds, or blend 15–20 seconds, until completely smooth with no powder lumps.",
      "Drink right away; shake again if it sits and separates.",
    ],
  },

  "Apple + peanut butter": {
    batch: null,
    serving: [
      { amount: "1", item: "medium apple, sliced" },
      { amount: "16g (1 tbsp)", item: "natural peanut butter" },
    ],
    steps: [
      "Wash and core a medium apple; slice into even wedges so each piece has a flat surface for spreading.",
      "Stir the natural peanut butter jar if oil has separated, then measure 16g (1 level tbsp).",
      "Either portion the peanut butter into a small dish for dipping, or spread a thin layer across the wedges.",
      "Eat right away so the apple doesn’t brown. If packing for later, add a squeeze of lemon on the cut surfaces.",
    ],
  },
};

function lookupDetail(recipe) {
  if (!recipe) return null;
  return (
    RECIPE_DETAILS[recipe.name] ||
    (recipe.basedOn ? RECIPE_DETAILS[recipe.basedOn] : null) ||
    null
  );
}

/** Attach batch/serving/steps onto a RECIPES row (or pass-through if already present).
 *  Legacy `ingredients` maps to serving. Prefer fields already on the recipe object.
 */
export function withRecipeDetail(recipe) {
  if (!recipe) return recipe;
  const detail = lookupDetail(recipe) || {};

  const batch =
    recipe.batch !== undefined
      ? recipe.batch
      : detail.batch !== undefined
        ? detail.batch
        : null;

  const serving = recipe.serving?.length
    ? recipe.serving
    : recipe.ingredients?.length
      ? recipe.ingredients
      : detail.serving?.length
        ? detail.serving
        : detail.ingredients?.length
          ? detail.ingredients
          : [];

  const steps = recipe.steps?.length ? recipe.steps : detail.steps || [];

  return {
    ...recipe,
    batch: batch?.length ? batch : null,
    serving,
    // Keep ingredients as a serving alias for older callers.
    ingredients: serving,
    steps,
  };
}

/** Normalize AI / published meal into the same card shape as default recipes.
 *  Do not surface AI `why` blurbs ("Patrick loves…") to clients — those stay admin-only.
 *  When basedOn matches a bank recipe, pull batch (and any missing serving/steps) from RECIPE_DETAILS.
 */
export function mealToCard(meal) {
  const slot = (meal.slot || meal.cat || "").toString();
  const cat = slot ? slot.charAt(0).toUpperCase() + slot.slice(1).toLowerCase() : "Meal";
  const bank = meal.basedOn ? RECIPE_DETAILS[meal.basedOn] : null;

  const serving = meal.serving?.length
    ? meal.serving
    : meal.ingredients?.length
      ? meal.ingredients
      : [];

  const steps = meal.steps?.length >= 4
    ? meal.steps
    : (bank?.steps?.length ? bank.steps : meal.steps || []);

  return withRecipeDetail({
    cat,
    slot: slot.toLowerCase() || null,
    name: meal.name,
    // Prefer a real food description if present; never the preference "why" line.
    desc: meal.desc || "",
    why: "",
    basedOn: meal.basedOn || null,
    cal: meal.cal,
    p: meal.p,
    c: meal.c,
    f: meal.f,
    serves: meal.servings || meal.serves || 1,
    batch: meal.batch !== undefined ? meal.batch : bank?.batch ?? undefined,
    serving,
    ingredients: serving,
    steps,
  });
}
