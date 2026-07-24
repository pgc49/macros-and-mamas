/**
 * Build a shoppable grocery list from a committed week plan.
 *
 * MVP pipeline: plan meals → expand compounds → clean prep words → soft-merge
 * by normalized key → aisle sort → attach source meal names.
 * Amounts stay as written (no cup↔g math). Prefer family batch when present.
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
    re: /\b(berry|berries|banana|apple|orange|peach|spinach|lettuce|romaine|greens|cucumber|tomato|pepper|zucchini|broccoli|asparagus|cabbage|brussels|onion|garlic|lemon|lime|avocado|potato|sweet potato|fruit|herb|dill)\b/i,
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

const STAPLE_RE = /\b(kosher salt|sea salt|\bsalt\b|black pepper|cracked pepper|cooking spray|\bwater\b|pinch of salt)\b/i;

/** Recipe phrases → separate shoppable staples (MVP heuristics). */
const COMPOUND_SPLITS = [
  {
    test: (item) => /\bgarlic butter\b/i.test(item),
    parts: (amount) => [
      { item: "garlic cloves", amount: amount ? `${amount} (for garlic butter)` : "for garlic butter" },
      { item: "butter", amount: amount || "" },
    ],
  },
  {
    test: (item) => /\bdill\b/i.test(item) && /\blemon\b/i.test(item),
    parts: (amount) => [
      { item: "fresh dill", amount: amount || "to taste" },
      { item: "lemon", amount: amount || "to taste" },
    ],
  },
  {
    test: (item) => /\blime\b/i.test(item) && /\bsalt\b/i.test(item),
    parts: (amount) => [
      { item: "lime", amount: amount || "to taste" },
      { item: "salt", amount: "pinch (likely on hand)" },
    ],
  },
  {
    test: (item) => /\boil-spray\b|\bolive oil spray\b|cooking spray/i.test(item),
    parts: (amount) => [
      { item: "olive oil or cooking spray", amount: amount || "for cooking" },
    ],
  },
  {
    test: (item) => /\bcabbage slaw\b/i.test(item),
    parts: (amount) => [
      { item: "cabbage (for slaw)", amount: amount || "" },
      { item: "lime", amount: "for slaw" },
    ],
  },
];

export function aisleFor(item) {
  const text = String(item || "");
  for (const rule of AISLE_RULES) {
    if (rule.re.test(text)) return rule.aisle;
  }
  return "Other";
}

/**
 * Soft-merge key: strip prep methods so "cucumber, sliced" ≈ "cucumber slices"
 * and "fresh or frozen berries" ≈ "berries".
 */
export function normalizeItemKey(item) {
  return String(item || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(fresh or frozen|fresh|frozen|cooked|raw|diced|sliced|chopped|shredded|grilled|roasted|steamed|leftover|optional|medium|small|large)\b/g, " ")
    .replace(/\b(oil-spray sautéed|sautéed|with lime|with lemon|big squeeze)\b/g, " ")
    .replace(/\bslices?\b/g, " ")
    .replace(/\bflorets?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cleaner grocery-aisle label (less recipe-prep wording). */
export function shoppableLabel(item) {
  let s = String(item || "").replace(/\s+/g, " ").trim();
  s = s.replace(/,?\s*(sliced|diced|chopped|shredded|roasted|steamed|grilled|oil-spray sautéed|sautéed)\b.*$/i, "");
  s = s.replace(/\b(fresh or frozen|fresh|frozen)\s+/gi, "");
  s = s.replace(/\bmedium\s+/gi, "");
  s = s.replace(/\bsmall\s+/gi, "");
  s = s.replace(/\blarge\s+/gi, "");
  s = s.replace(/,?\s*big squeeze\b/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  // Capitalize first letter for display consistency
  if (!s) return String(item || "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function displayItem(item) {
  return shoppableLabel(item);
}

/** Expand compound recipe lines into shoppable rows. */
export function expandGroceryLine(rawItem, amount) {
  const item = String(rawItem || "").trim();
  const amt = String(amount || "").trim();
  if (!item) return [];
  for (const rule of COMPOUND_SPLITS) {
    if (rule.test(item)) {
      return rule.parts(amt).map((p) => ({
        item: p.item,
        amount: p.amount || "",
        expandedFrom: item,
      }));
    }
  }
  return [{ item, amount: amt, expandedFrom: null }];
}

function linesFromMeal(meal) {
  const card = meal.serving || meal.batch || meal.ingredients
    ? withRecipeDetail(meal)
    : mealToCard(meal);
  const preferBatch = card.batch?.length ? card.batch : null;
  const lines = preferBatch || card.serving || card.ingredients || [];
  const qty = Number(meal.qty) > 0 ? Number(meal.qty) : 1;
  return {
    name: card.name || meal.name || "Meal",
    qty,
    usedBatch: !!preferBatch,
    lines: lines.filter((l) => l && (l.item || l.name)),
  };
}

/**
 * @param {Array<{ day?: string, meals?: any[] }>} weekDays
 */
export function buildGroceryList(weekDays) {
  const byKey = new Map();
  const notes = [];
  let mealCount = 0;
  const batchNames = new Map();

  (weekDays || []).forEach((day) => {
    const dayLabel = day.day || "";
    (day.meals || []).forEach((meal) => {
      mealCount += 1;
      const { name, qty, usedBatch, lines } = linesFromMeal(meal);
      const qtyLabel = qty !== 1 ? ` · ${qty}×` : "";
      const dayMeal = dayLabel ? `${dayLabel}: ${name}${qtyLabel}` : `${name}${qtyLabel}`;
      if (usedBatch) {
        const prev = batchNames.get(name) || [];
        prev.push(dayLabel);
        batchNames.set(name, prev);
      }
      if (qty !== 1 && usedBatch) {
        notes.push(
          `${name} is planned at ${qty}× serving — family batch amounts are listed once; scale your shop if you’re cooking more plates.`,
        );
      }
      lines.forEach((line) => {
        const rawItem = line.item || line.name || "";
        let amount = String(line.amount || "").trim();
        if (amount && qty !== 1 && !usedBatch) {
          amount = `${amount} ×${qty}`;
        }
        const expanded = expandGroceryLine(rawItem, amount);
        expanded.forEach((part) => {
          if (part.expandedFrom) {
            const note = `Split “${part.expandedFrom}” into shoppable items.`;
            if (!notes.includes(note)) notes.push(note);
          }
          const key = normalizeItemKey(part.item);
          if (!key) return;
          const existing = byKey.get(key);
          const amt = String(part.amount || "").trim();
          if (existing) {
            if (amt && !existing.amounts.includes(amt)) existing.amounts.push(amt);
            if (dayMeal && !existing.meals.includes(dayMeal)) existing.meals.push(dayMeal);
            // Prefer shorter shoppable label
            if (shoppableLabel(part.item).length < existing.item.length) {
              existing.item = shoppableLabel(part.item);
            }
          } else {
            byKey.set(key, {
              key,
              item: shoppableLabel(part.item),
              amounts: amt ? [amt] : [],
              meals: dayMeal ? [dayMeal] : [],
              aisle: aisleFor(part.item),
              staple: STAPLE_RE.test(part.item),
            });
          }
        });
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
      if (row.meals?.length) {
        parts.push(`    ← ${row.meals.join(" · ")}`);
      }
    });
    parts.push("");
  });
  if (list.notes?.length) {
    parts.push("Notes");
    list.notes.forEach((n) => parts.push(`• ${n}`));
    parts.push("");
  }
  parts.push("Built from your planned meals. Amounts follow recipes as written — adjust for your household.");
  return parts.join("\n").trim() + "\n";
}
