/**
 * Diet + allergen prompt helpers for meal-suggest / meal-idea / meal-plan.
 * Mama UI offers: none | pescatarian | vegetarian (vegan may still exist on old rows).
 */

const ALLERGEN_LABELS = {
  dairy: "dairy (milk, cheese, yogurt, whey, butter, cream)",
  eggs: "eggs",
  peanuts: "peanuts",
  tree_nuts: "tree nuts (almond, cashew, walnut, etc.)",
  shellfish: "shellfish",
  fish: "fish",
  gluten: "gluten (wheat, barley, rye)",
  soy: "soy (tofu, tempeh, edamame, soy sauce)",
  sesame: "sesame",
};

export function normalizeDiet(diet) {
  const d = String(diet || "none").toLowerCase().trim();
  if (d === "pescatarian" || d === "vegetarian" || d === "vegan") return d;
  return "none";
}

export function normalizeAllergens(list) {
  if (!Array.isArray(list)) return [];
  const allowed = new Set(Object.keys(ALLERGEN_LABELS));
  const out = [];
  for (const raw of list) {
    const id = String(raw || "").toLowerCase().trim();
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Human label for prompts when diet is unset/none. */
export function dietPromptLabel(diet) {
  const d = normalizeDiet(diet);
  if (d === "none") return "No restrictions (omnivore — eats animal protein)";
  if (d === "pescatarian") return "Pescatarian (fish & seafood ok; NO land meat: beef, pork, chicken, turkey, lamb, etc.)";
  if (d === "vegetarian") {
    return "Vegetarian (NO meat, poultry, fish, or shellfish — eggs & dairy ARE allowed unless listed as allergens)";
  }
  if (d === "vegan") {
    return "Vegan (NO animal products — meat, fish, eggs, dairy, honey). Hit protein with legumes, tofu/tempeh if soy ok, plant protein powder.";
  }
  return d;
}

/**
 * Hard diet + allergen block for AI prompts. Soft loves stay elsewhere.
 */
export function buildDietSafetyBlock(profile = {}) {
  const diet = normalizeDiet(profile.diet);
  const allergens = normalizeAllergens(profile.allergens);
  const allergenNote = String(profile.allergenNote || "").trim().slice(0, 400);
  const avoids = String(profile.foodAvoids || "").trim().slice(0, 500);

  const lines = [
    "## HARD diet & safety — non-negotiable",
    `Diet pattern: ${dietPromptLabel(diet)}`,
  ];

  if (diet === "vegetarian" || diet === "vegan") {
    lines.push(
      "Do NOT put any animal flesh (chicken, turkey, beef, pork, fish, shellfish, deli meat, bacon, etc.) in any meal.",
      "Listing a plant food she loves (e.g. tofu) does NOT allow sneaking meat in — the diet pattern wins.",
      diet === "vegetarian"
        ? "Protein sources: eggs, Greek yogurt, cottage cheese, cheese, tofu/tempeh (if soy ok), beans, lentils, protein powder — as fits her loves + allergens."
        : "Protein sources: legumes, tofu/tempeh (if soy ok), plant protein powder, seitan only if gluten ok — as fits her loves + allergens.",
    );
  } else if (diet === "pescatarian") {
    lines.push(
      "Do NOT put land meat (chicken, turkey, beef, pork, lamb, etc.) in any meal. Fish and shellfish are allowed unless allergens say otherwise.",
      "Protein sources: fish, shellfish, eggs, dairy, legumes, tofu — as fits her loves + allergens.",
    );
  } else {
    lines.push("No diet gate on animal protein — still honor allergens and avoids below.");
  }

  if (allergens.length || allergenNote) {
    const tagged = allergens.map((id) => ALLERGEN_LABELS[id] || id);
    lines.push(
      "ALLERGENS / NEVER EAT (hard ban — omit entirely; if unsure an ingredient contains them, leave it out):",
      tagged.length ? `- ${tagged.join("\n- ")}` : null,
      allergenNote ? `- Other detail from mama: ${allergenNote}` : null,
    );
  } else {
    lines.push("Allergens: none listed.");
  }

  if (avoids) {
    lines.push(
      `Soft avoids (strongly prefer not — swap unless needed for macros): ${avoids}`,
    );
  }

  lines.push(
    "Taste loves steer variety; diet + allergens GATE the week. Never violate a gate to use a bank recipe — adapt or pick another option.",
  );

  return lines.filter((l) => l != null).join("\n");
}

/** Protein gap-fill hint that respects diet. */
export function proteinGapHint(diet) {
  const d = normalizeDiet(diet);
  if (d === "vegetarian") {
    return "Low protein → more eggs/egg whites, Greek yogurt, cottage cheese, tofu/tempeh (if soy ok), lentils/beans, protein powder oz — never chicken/fish.";
  }
  if (d === "vegan") {
    return "Low protein → more tofu/tempeh (if soy ok), lentils/beans, plant protein powder — never animal products.";
  }
  if (d === "pescatarian") {
    return "Low protein → more fish oz, egg whites, Greek yogurt, cottage cheese, protein powder — not chicken/turkey/beef.";
  }
  return "Low protein → more chicken/turkey/fish oz, egg whites, Greek yogurt, cottage cheese, protein powder.";
}
