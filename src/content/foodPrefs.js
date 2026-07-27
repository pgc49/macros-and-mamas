/** Mama-facing diet chips (Food prefs + intake). Vegan is not offered. */
export const DIET_OPTIONS = [
  {
    id: "none",
    label: "No restrictions",
    hint: "I eat most things, including meat",
  },
  {
    id: "pescatarian",
    label: "Pescatarian",
    hint: "Fish & seafood ok — no land meat",
  },
  {
    id: "vegetarian",
    label: "Vegetarian",
    hint: "No meat or fish — eggs & dairy ok",
  },
];

/** Standard allergen / never-eat chips. Stored on profiles.allergens. */
export const ALLERGEN_OPTIONS = [
  { id: "dairy", label: "Dairy" },
  { id: "eggs", label: "Eggs" },
  { id: "peanuts", label: "Peanuts" },
  { id: "tree_nuts", label: "Tree nuts" },
  { id: "shellfish", label: "Shellfish" },
  { id: "fish", label: "Fish" },
  { id: "gluten", label: "Gluten" },
  { id: "soy", label: "Soy" },
  { id: "sesame", label: "Sesame" },
];

const ALLERGEN_IDS = new Set(ALLERGEN_OPTIONS.map((a) => a.id));

export function normalizeDiet(diet) {
  const d = String(diet || "none").toLowerCase().trim();
  if (d === "pescatarian" || d === "vegetarian" || d === "vegan") return d;
  return "none";
}

export function normalizeAllergens(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const id = String(raw || "").toLowerCase().trim();
    if (ALLERGEN_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function dietLabel(diet) {
  const d = normalizeDiet(diet);
  return DIET_OPTIONS.find((o) => o.id === d)?.label
    || (d === "vegan" ? "Vegan" : "No restrictions");
}
