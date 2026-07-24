/**
 * Smoke checks for grocery list builder (run: npx vite-node scripts/smoke-grocery.mjs)
 */
import { DEFAULT_WEEK } from "../src/content/defaultWeek.js";
import {
  buildGroceryList,
  formatGroceryListText,
  aisleFor,
  normalizeItemKey,
  expandGroceryLine,
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
assert(
  normalizeItemKey("fresh or frozen berries") === normalizeItemKey("berries"),
  "berries should merge",
);
assert(
  normalizeItemKey("cucumber slices") === normalizeItemKey("cucumber, sliced"),
  "cucumber should merge",
);
assert(aisleFor("fresh spinach") === "Produce", "spinach aisle");
assert(aisleFor("sourdough bread") === "Bread & grains", "bread aisle");
assert(aisleFor("nonfat Greek yogurt") === "Dairy & eggs" || aisleFor("nonfat Greek yogurt") === "Protein", "yogurt aisle");

// Compound split: garlic butter → garlic + butter
const split = expandGroceryLine("garlic butter", "1 tsp");
assert(split.length === 2, "garlic butter splits to 2");
assert(split.some((p) => /garlic/i.test(p.item)), "has garlic");
assert(split.some((p) => /butter/i.test(p.item)), "has butter");

// Meal source lines present in copy
assert(text.includes("←"), "copy should cite source meals");
const berryRow = list.sections.flatMap((s) => s.items).find((i) => /berr/i.test(i.item));
assert(berryRow?.meals?.length >= 1, "items should list source meals");

console.log("OK grocery smoke", {
  meals: list.mealCount,
  items: list.lineCount,
  aisles: list.sections.map((s) => `${s.aisle}:${s.items.length}`),
  notes: list.notes.length,
});
console.log("--- sample copy ---");
console.log(text.slice(0, 600));
