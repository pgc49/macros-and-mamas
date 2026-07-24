/**
 * Build a shoppable grocery list from a By Day week (default or personalized).
 *
 * Design notes (from competitor research):
 * - Industry pipeline: plan → extract → soft-merge → aisle sort → copy/export
 * - Hard unit math (cup↔g) is where apps fail; MVP keeps amounts as written
 * - Prefer batch (family cook) over plate serving when present
 * - Surface source meal names so she can sanity-check merges
 */

import { withRecipeDetail, mealToCard } from "../content/recipeDetails.js";

/** Aisle order matches Callie's pantry cheat sheet spirit + store walk. */
export const AISLE_ORDER = [
  "Produce",
  "Protein",
  "Dairy & eggs",
  "Bread & grains",
  "Pantry",
  "Fats & sweeteners",
  "Other",
];

const AISLE_RULES = [
  {
    aisle: "Produce",
    re: /\b(berry|berries|banana|apple|orange|peach|spinach|lettuce|romaine|greens|cucumber|tomato|pepper|zucchini|broccoli|asparagus|cabbage|brussels|onion|garlic|lemon|lime|avocado|potato|sweet potato|fruit)\b/i,
  },
  {
    aisle: "Protein",
    re: /\b(chicken|turkey|salmon|halibut|tuna|sausage|meatball|beef|protein powder|egg white|eggs?\b|cottage cheese)\b/i,
  },
  {
    aisle: "Dairy & eggs",
    re: /\b(yogurt|greek|skyr|milk|parmesan|feta|cheese|butter|cream)\b/i,
  },
  {
    aisle: "Bread & grains",
    re: /\b(oat|rice|quinoa|sourdough|bread|tortilla|granola|breadcrumb|chickpea)\b/i,
  },
  {
    aisle: "Fats & sweeteners",
    re: /\b(olive oil|oil|peanut butter|honey|maple|hemp|vinaigrette|mayo|dijon)\b/i,
  },
  {
    aisle: "Pantry",
    re: /\b(aminos|tamari|soy|salsa|marinara|spice|cinnamon|herb|stock|broth|applesauce|baking)\b/i,
  },
];

/** Soft pantry staples often already at home — still listed, tagged for her eye. */
const STAPLE_RE = /\b(kosher salt|sea salt|\bsalt\b|black pepper|cracked pepper|cooking spray|\bwater\b)\b/i;

export function aisleFor(item) {
  const text = String(item || "");
  for (const rule of AISLE_RULES) {
    if (rule.re.test(text)) return rule.aisle;
  }
  return "Other";
}

/** Normalize for merge keys — strip brand asides, prep notes, punctuation noise. */
export function normalizeItemKey(item) {
  return String(item || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(fresh|frozen|cooked|raw|diced|sliced|chopped|shredded|grilled|leftover|optional)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayItem(item) {
  // Keep readable name; trim trailing prep clauses after em dash / comma-heavy brand notes lightly
  return String(item || "")
    .replace(/\s+/g, " ")
    .trim();
}

function linesFromMeal(meal) {
  const card = meal.serving || meal.batch || meal.ingredients
    ? withRecipeDetail(meal)
    : mealToCard(meal);
  const preferBatch = card.batch?.length ? card.batch : null;
  const lines = preferBatch || card.serving || card.ingredients || [];
  return {
    name: card.name || meal.name || "Meal",
    usedBatch: !!preferBatch,
    lines: lines.filter((l) => l && (l.item || l.name)),
  };
}

/**
 * @param {Array<{ day?: string, meals?: any[] }>} weekDays
 * @returns {{ sections: Array<{ aisle: string, items: Array }>, mealCount: number, lineCount: number, notes: string[] }}
 */
export function buildGroceryList(weekDays) {
  const byKey = new Map();
  const notes = [];
  let mealCount = 0;
  const batchNames = new Map(); // recipe name → days seen (for leftover hint)

  (weekDays || []).forEach((day) => {
    const dayLabel = day.day || "";
    (day.meals || []).forEach((meal) => {
      mealCount += 1;
      const { name, usedBatch, lines } = linesFromMeal(meal);
      if (usedBatch) {
        const prev = batchNames.get(name) || [];
        prev.push(dayLabel);
        batchNames.set(name, prev);
      }
      lines.forEach((line) => {
        const rawItem = line.item || line.name || "";
        const amount = String(line.amount || "").trim();
        const key = normalizeItemKey(rawItem);
        if (!key) return;
        const existing = byKey.get(key);
        if (existing) {
          if (amount && !existing.amounts.includes(amount)) existing.amounts.push(amount);
          if (name && !existing.meals.includes(name)) existing.meals.push(name);
        } else {
          byKey.set(key, {
            key,
            item: displayItem(rawItem),
            amounts: amount ? [amount] : [],
            meals: name ? [name] : [],
            aisle: aisleFor(rawItem),
            staple: STAPLE_RE.test(rawItem),
          });
        }
      });
    });
  });

  batchNames.forEach((days, name) => {
    const uniqueDays = [...new Set(days.filter(Boolean))];
    if (uniqueDays.length > 1) {
      notes.push(
        `${name} is on ${uniqueDays.join(" + ")} — one family batch may cover both if you meal prep.`,
      );
    }
  });

  const sections = AISLE_ORDER.map((aisle) => {
    const items = [...byKey.values()]
      .filter((x) => x.aisle === aisle)
      .sort((a, b) => a.item.localeCompare(b.item, undefined, { sensitivity: "base" }));
    return { aisle, items };
  }).filter((s) => s.items.length > 0);

  return {
    sections,
    mealCount,
    lineCount: [...byKey.values()].length,
    notes,
  };
}

/** Plain text for clipboard / Messages / Notes. */
export function formatGroceryListText(list, { title = "Macros and Mamas — grocery list" } = {}) {
  if (!list?.sections?.length) {
    return `${title}\n\nNo ingredients found for this week.`;
  }
  const parts = [title, ""];
  list.sections.forEach((sec) => {
    parts.push(sec.aisle.toUpperCase());
    sec.items.forEach((row) => {
      const amt = row.amounts.length ? ` — ${row.amounts.join("; ")}` : "";
      const staple = row.staple ? " (likely on hand)" : "";
      parts.push(`• ${row.item}${amt}${staple}`);
    });
    parts.push("");
  });
  if (list.notes?.length) {
    parts.push("Notes");
    list.notes.forEach((n) => parts.push(`• ${n}`));
    parts.push("");
  }
  parts.push("Amounts follow the recipes as written — adjust if you skip a day or cook for the family.");
  return parts.join("\n").trim() + "\n";
}
