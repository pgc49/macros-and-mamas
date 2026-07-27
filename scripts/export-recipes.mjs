import { writeFileSync } from "fs";
import { RECIPES } from "../src/content/data.js";
import { RECIPE_DETAILS } from "../src/content/recipeDetails.js";

const out = RECIPES.map((r) => ({
  ...r,
  detail: RECIPE_DETAILS[r.name] || null,
}));
writeFileSync("/tmp/recipes.json", JSON.stringify(out, null, 2));
console.log(`${out.length} recipes exported`);
