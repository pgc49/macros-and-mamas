/**
 * Smoke checks for grocery list builder (run: node scripts/smoke-grocery.mjs)
 */
import { DEFAULT_WEEK } from "../src/content/defaultWeek.js";
import {
  buildGroceryList,
  formatGroceryListText,
  aisleFor,
  normalizeItemKey,
  expandGroceryLine,
  parseAmountParts,
  pickMeasure,
  toBuyLabel,
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
assert(text.includes("buy ") || text.includes("Buy"), "copy should mention buy qty");
assert(text.includes("for:"), "copy should cite recipe names");

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

// Amount parsing + buy rounding
const chickenParts = parseAmountParts("140g (5 oz)");
assert(chickenParts.some((p) => p.unit === "oz" && p.value === 5), "parses 5 oz");
const chickenMeasure = pickMeasure(chickenParts, "chicken breast");
assert(chickenMeasure?.unit === "oz", "chicken prefers oz");
const buy = toBuyLabel("chicken breast", 11, "oz");
assert(/lb/i.test(buy.buy), `chicken buy should be lb, got ${buy.buy}`);

const berryRow = list.sections.flatMap((s) => s.items).find((i) => /berr/i.test(i.item));
assert(berryRow, "berries should appear");
assert(berryRow?.recipes?.length >= 1, "items track recipe names");
assert(berryRow.buy, "items have buy label");

const proteinRow = list.sections
  .flatMap((s) => s.items)
  .find((i) => /chicken/i.test(i.item));
if (proteinRow) {
  assert(/lb|pack|tub|bag|dozen|loaf|carton|can|use what/i.test(proteinRow.buy), `unexpected buy ${proteinRow.buy}`);
  assert(!/^\d+\s*oz;\s*\d+\s*oz/.test(proteinRow.buy), "should not show raw oz;oz serving list");
}

console.log("OK grocery smoke", {
  meals: list.mealCount,
  items: list.lineCount,
  aisles: list.sections.map((s) => `${s.aisle}:${s.items.length}`),
  notes: list.notes.length,
  sampleProtein: proteinRow && { item: proteinRow.item, buy: proteinRow.buy, recipes: proteinRow.recipes },
});
console.log("--- sample copy ---");
console.log(text.slice(0, 800));
