/**
 * Smoke checks for grocery list builder (run: npx vite-node scripts/smoke-grocery.mjs)
 */
import { DEFAULT_WEEK } from "../src/content/defaultWeek.js";
import {
  buildGroceryList,
  formatGroceryListText,
  aisleFor,
  normalizeItemKey,
} from "../src/utils/groceryList.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const list = buildGroceryList(DEFAULT_WEEK);
assert(list.sections.length >= 3, "expected multiple aisle sections");
assert(list.lineCount > 10, `expected many items, got ${list.lineCount}`);
assert(list.mealCount === DEFAULT_WEEK.reduce((n, d) => n + (d.meals?.length || 0), 0), "meal count mismatch");

const text = formatGroceryListText(list);
assert(text.includes("PRODUCE") || text.includes("PROTEIN"), "formatted text missing aisle headers");
assert(text.includes("•"), "formatted text missing bullets");

assert(normalizeItemKey("Chicken breast (grilled)") === normalizeItemKey("chicken breast"), "normalize failed");
assert(aisleFor("fresh spinach") === "Produce", "spinach aisle");
assert(aisleFor("sourdough bread") === "Bread & grains", "bread aisle");
assert(aisleFor("nonfat Greek yogurt") === "Dairy & eggs" || aisleFor("nonfat Greek yogurt") === "Protein", "yogurt aisle");

console.log("OK grocery smoke", {
  meals: list.mealCount,
  items: list.lineCount,
  aisles: list.sections.map((s) => `${s.aisle}:${s.items.length}`),
  notes: list.notes.length,
});
console.log("--- sample copy ---");
console.log(text.slice(0, 600));
