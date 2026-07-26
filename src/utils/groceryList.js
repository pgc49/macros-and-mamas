/**
 * Build a shoppable grocery list from a committed week plan.
 *
 * Recipes stay exact for macros. This layer translates need → buy:
 * sum recipe amounts → round up to purchase units → tag recipe names.
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
    re: /\b(berry|berries|banana|apple|orange|peach|spinach|lettuce|romaine|greens|cucumber|tomato|pepper|zucchini|broccoli|asparagus|cabbage|brussels|onion|garlic|lemon|lime|avocado|potato|sweet potato|fruit|herb|dill|celery)\b/i,
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

const MEAT_RE = /\b(chicken|turkey|salmon|halibut|tuna|beef|steak|meatball)\b/i;
const EGG_RE = /\beggs?\b/i;
const EGG_WHITE_RE = /\begg white/i;
const SAUSAGE_RE = /\bsausage\b/i;
const YOGURT_RE = /\b(yogurt|skyr|cottage cheese)\b/i;
const BREAD_RE = /\b(sourdough|bread|bagel)\b/i;
const TORTILLA_RE = /\btortilla\b/i;
const RICE_RE = /\brice\b/i;
const OAT_RE = /\boat/i;
const GREENS_RE = /\b(spinach|lettuce|romaine|greens|cabbage|broccoli|asparagus|brussels|zucchini|pepper|cucumber|celery|tomato)\b/i;
const BERRY_RE = /\bberr/i;
const MILK_RE = /\bmilk\b/i;
const PROTEIN_POWDER_RE = /\bprotein powder\b/i;

const FRAC_CHAR = { "½": 0.5, "⅓": 1 / 3, "¼": 0.25, "¾": 0.75, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };

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
    .replace(/\b(fresh or frozen|fresh|frozen|cooked|raw|diced|sliced|chopped|shredded|grilled|roasted|steamed|leftover|optional|medium|small|large|boneless|skinless|liquid)\b/g, " ")
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
  s = s.replace(/\b(boneless|skinless)\s+/gi, "");
  s = s.replace(/\bmedium\s+/gi, "");
  s = s.replace(/\bsmall\s+/gi, "");
  s = s.replace(/\blarge\s+/gi, "");
  s = s.replace(/,?\s*big squeeze\b/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return String(item || "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
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

function parseNumberToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (FRAC_CHAR[s] != null) return FRAC_CHAR[s];
  const mixed = s.match(/^(\d+)\s*([½⅓¼¾⅔⅛])/);
  if (mixed) return Number(mixed[1]) + (FRAC_CHAR[mixed[2]] || 0);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull measurable quantities from a recipe amount string.
 * Prefers weight (oz/g) when present — macros-friendly.
 */
export function parseAmountParts(amountStr) {
  const s = String(amountStr || "");
  const parts = [];
  const re = /([½⅓¼¾⅔⅛]|\d+\s*[½⅓¼¾⅔⅛]|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|cups?|tbsp|tablespoons?|tsp|teaspoons?|lb|lbs|pounds?|scoop|scoops|slice|slices|link|links|can|cans)\b/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const value = parseNumberToken(m[1]);
    if (value == null || value <= 0) continue;
    let unit = m[2].toLowerCase();
    if (unit.startsWith("ounce")) unit = "oz";
    else if (unit.startsWith("gram")) unit = "g";
    else if (unit.startsWith("cup")) unit = "cup";
    else if (unit.startsWith("tablespoon") || unit === "tbsp") unit = "tbsp";
    else if (unit.startsWith("teaspoon") || unit === "tsp") unit = "tsp";
    else if (unit.startsWith("pound") || unit === "lb" || unit === "lbs") unit = "lb";
    else if (unit.startsWith("scoop")) unit = "scoop";
    else if (unit.startsWith("slice")) unit = "slice";
    else if (unit.startsWith("link")) unit = "link";
    else if (unit.startsWith("can")) unit = "can";
    parts.push({ value, unit });
  }
  // Bare counts: "1", "2", "½" (eggs, fruit, etc.)
  if (!parts.length) {
    const bare = s.match(/^\s*([½⅓¼¾⅔⅛]|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*$/);
    if (bare) {
      const value = parseNumberToken(bare[1]);
      if (value != null && value > 0) parts.push({ value, unit: "count" });
    }
  }
  return parts;
}

/** Choose the best unit to accumulate for an item. */
export function pickMeasure(parts, itemKey) {
  if (!parts?.length) return null;
  const byUnit = (u) => parts.find((p) => p.unit === u);
  if (MEAT_RE.test(itemKey) || SAUSAGE_RE.test(itemKey)) {
    return byUnit("oz") || byUnit("lb") || byUnit("g") || byUnit("link") || parts[0];
  }
  if (PROTEIN_POWDER_RE.test(itemKey)) {
    return byUnit("scoop") || byUnit("g") || parts[0];
  }
  if (EGG_WHITE_RE.test(itemKey) || YOGURT_RE.test(itemKey) || MILK_RE.test(itemKey) || OAT_RE.test(itemKey) || RICE_RE.test(itemKey)) {
    return byUnit("cup") || byUnit("g") || byUnit("oz") || parts[0];
  }
  if (BREAD_RE.test(itemKey)) {
    return byUnit("slice") || byUnit("oz") || byUnit("g") || parts[0];
  }
  // Prefer weight when both cup and g/oz appear (e.g. "40g (½ cup)")
  return byUnit("g") || byUnit("oz") || byUnit("cup") || byUnit("tbsp") || byUnit("tsp") || byUnit("count") || parts[0];
}

function toOz(value, unit) {
  if (unit === "oz") return value;
  if (unit === "g") return value / 28.3495;
  if (unit === "lb") return value * 16;
  return null;
}

function addNeed(bucket, measure, qtyMul) {
  if (!measure) return;
  const mul = qtyMul > 0 ? qtyMul : 1;
  const add = measure.value * mul;
  if (!bucket.unit) {
    bucket.unit = measure.unit;
    bucket.total = add;
    return;
  }
  // Same unit family
  if (bucket.unit === measure.unit) {
    bucket.total += add;
    return;
  }
  // g ↔ oz ↔ lb
  const a = toOz(bucket.total, bucket.unit);
  const b = toOz(add, measure.unit);
  if (a != null && b != null) {
    bucket.unit = "oz";
    bucket.total = a + b;
    return;
  }
  // Can't merge units — keep primary, stash note fragment
  if (!bucket.extraAmounts) bucket.extraAmounts = [];
  bucket.extraAmounts.push(`${roundNice(add)} ${measure.unit}`);
}

function roundNice(n) {
  if (!Number.isFinite(n)) return n;
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return (Math.round(n * 10) / 10).toString();
}

function formatLb(lb) {
  if (lb <= 1) return "1 lb";
  if (Math.abs(lb - 1.5) < 0.01) return "1½ lb";
  if (Math.abs(lb - Math.round(lb)) < 0.01) return `${Math.round(lb)} lb`;
  return `${roundNice(lb)} lb`;
}

/**
 * Turn summed recipe need into a store buy quantity.
 */
export function toBuyLabel(itemKey, total, unit) {
  if (total == null || !unit || !(total > 0)) {
    return { buy: "1", needNote: "" };
  }

  if (STAPLE_RE.test(itemKey)) {
    return { buy: "on hand?", needNote: "" };
  }

  if (MEAT_RE.test(itemKey) && (unit === "oz" || unit === "g" || unit === "lb")) {
    const oz = toOz(total, unit) ?? total;
    const lb = Math.ceil((oz / 16) * 2) / 2; // round up to nearest ½ lb
    const buyLb = Math.max(1, lb);
    return {
      buy: formatLb(buyLb),
      needNote: `~${Math.round(oz)} oz for recipes`,
    };
  }

  if (SAUSAGE_RE.test(itemKey) && (unit === "link" || unit === "count")) {
    const n = Math.ceil(total);
    if (n <= 6) return { buy: "1 pack", needNote: `${n} links for recipes` };
    const packs = Math.ceil(n / 6);
    return { buy: `${packs} packs`, needNote: `${n} links for recipes` };
  }

  if (EGG_WHITE_RE.test(itemKey) && unit === "cup") {
    const cartons = Math.max(1, Math.ceil(total / 2)); // ~2 cups per carton-ish
    return {
      buy: cartons === 1 ? "1 carton" : `${cartons} cartons`,
      needNote: `${roundNice(total)} cups for recipes`,
    };
  }

  if (EGG_RE.test(itemKey) && !EGG_WHITE_RE.test(itemKey) && (unit === "count" || unit === "link")) {
    const dozen = Math.max(1, Math.ceil(total / 12));
    return {
      buy: dozen === 1 ? "1 dozen" : `${dozen} dozen`,
      needNote: `${Math.ceil(total)} eggs for recipes`,
    };
  }

  if (YOGURT_RE.test(itemKey) && (unit === "cup" || unit === "g" || unit === "oz")) {
    let cups = total;
    if (unit === "g") cups = total / 227;
    if (unit === "oz") cups = total / 8;
    const tubs = Math.max(1, Math.ceil(cups / 2)); // ~32 oz tub ≈ 4 cups; use 2-cup heuristic for "large tub"
    return {
      buy: tubs === 1 ? "1 large tub" : `${tubs} large tubs`,
      needNote: `~${roundNice(cups)} cups for recipes`,
    };
  }

  if (MILK_RE.test(itemKey) && (unit === "cup" || unit === "oz")) {
    const cups = unit === "oz" ? total / 8 : total;
    if (cups <= 4) return { buy: "1 quart", needNote: `${roundNice(cups)} cups for recipes` };
    return { buy: "1 half-gallon", needNote: `${roundNice(cups)} cups for recipes` };
  }

  if (BREAD_RE.test(itemKey) && (unit === "slice" || unit === "oz" || unit === "count")) {
    return { buy: "1 loaf", needNote: unit === "slice" || unit === "count" ? `${Math.ceil(total)} slices for recipes` : "" };
  }

  if (TORTILLA_RE.test(itemKey) && (unit === "count" || unit === "slice")) {
    return { buy: "1 pack", needNote: `${Math.ceil(total)} for recipes` };
  }

  if (RICE_RE.test(itemKey) && unit === "cup") {
    // cooked cups → rough dry need; still buy one bag for the week
    return { buy: "1 bag", needNote: `${roundNice(total)} cups cooked for recipes` };
  }

  if (OAT_RE.test(itemKey) && (unit === "cup" || unit === "g")) {
    return { buy: "1 container", needNote: unit === "cup" ? `${roundNice(total)} cups dry for recipes` : `${Math.round(total)}g for recipes` };
  }

  if (PROTEIN_POWDER_RE.test(itemKey) && (unit === "scoop" || unit === "g")) {
    return {
      buy: "use what you have",
      needNote: unit === "scoop" ? `${roundNice(total)} scoops for recipes` : `${Math.round(total)}g for recipes`,
    };
  }

  if ((GREENS_RE.test(itemKey) || BERRY_RE.test(itemKey)) && (unit === "cup" || unit === "count" || unit === "g")) {
    if (BERRY_RE.test(itemKey)) {
      return { buy: "1 bag (fresh or frozen)", needNote: unit === "cup" ? `${roundNice(total)} cups for recipes` : "" };
    }
    return { buy: "1 bag / bunch", needNote: unit === "cup" ? `${roundNice(total)} cups for recipes` : "" };
  }

  if (unit === "tbsp" || unit === "tsp") {
    return { buy: "1 bottle / jar", needNote: `${roundNice(total)} ${unit} for recipes` };
  }

  if (unit === "can") {
    const n = Math.max(1, Math.ceil(total));
    return { buy: n === 1 ? "1 can" : `${n} cans`, needNote: "" };
  }

  if (unit === "count") {
    const n = Math.max(1, Math.ceil(total));
    return { buy: String(n), needNote: "" };
  }

  if (unit === "cup") {
    return { buy: `${roundNice(total)} cups`, needNote: "recipe total — buy a pack that covers it" };
  }

  if (unit === "g") {
    return { buy: `${Math.round(total)}g total`, needNote: "weigh what you need at home" };
  }

  if (unit === "oz") {
    return { buy: `${roundNice(total)} oz total`, needNote: "" };
  }

  return { buy: "1", needNote: "" };
}

function formatRecipes(recipeCounts) {
  return [...recipeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
}

function asIngredientLines(value) {
  return Array.isArray(value) ? value : [];
}

function linesFromMeal(meal) {
  const card = meal.serving || meal.batch || meal.ingredients
    ? withRecipeDetail(meal)
    : mealToCard(meal);
  // Only real ingredient arrays — never a string label like "3 servings"
  // (AI Suggest wrote those; .filter on a string blanked the Meals tab).
  const preferBatch = asIngredientLines(card.batch);
  const lines = preferBatch.length
    ? preferBatch
    : asIngredientLines(card.serving).length
      ? asIngredientLines(card.serving)
      : asIngredientLines(card.ingredients);
  const qty = Number(meal.qty) > 0 ? Number(meal.qty) : 1;
  return {
    name: card.name || meal.name || "Meal",
    qty,
    usedBatch: preferBatch.length > 0,
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
      if (usedBatch) {
        const prev = batchNames.get(name) || [];
        prev.push(dayLabel);
        batchNames.set(name, prev);
      }
      if (qty !== 1 && usedBatch) {
        notes.push(
          `${name} is planned at ${qty}× serving — family batch buy sizes assume one batch; scale up if you’re cooking more.`,
        );
      }
      // Serving lines scale with qty; batch lines listed once per planned meal instance.
      const qtyMul = usedBatch ? 1 : qty;
      // Count each recipe once per meal — not once per ingredient line.
      const keyedThisMeal = new Set();

      lines.forEach((line) => {
        const rawItem = line.item || line.name || "";
        const amount = String(line.amount || "").trim();
        const expanded = expandGroceryLine(rawItem, amount);
        expanded.forEach((part) => {
          if (part.expandedFrom) {
            const note = `Split “${part.expandedFrom}” into shoppable items.`;
            if (!notes.includes(note)) notes.push(note);
          }
          const key = normalizeItemKey(part.item);
          if (!key) return;
          const label = shoppableLabel(part.item);
          const measure = pickMeasure(parseAmountParts(part.amount), key);
          const existing = byKey.get(key);
          const firstHit = !keyedThisMeal.has(key);
          if (firstHit) keyedThisMeal.add(key);
          if (existing) {
            if (firstHit) {
              existing.recipeCounts.set(name, (existing.recipeCounts.get(name) || 0) + 1);
            }
            addNeed(existing.need, measure, qtyMul);
            if (label.length < existing.item.length) existing.item = label;
            if (part.amount) existing.rawAmounts.push(part.amount);
          } else {
            const recipeCounts = new Map([[name, 1]]);
            const need = { total: 0, unit: null, extraAmounts: [] };
            addNeed(need, measure, qtyMul);
            byKey.set(key, {
              key,
              item: label,
              recipeCounts,
              need,
              rawAmounts: part.amount ? [part.amount] : [],
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
      .map((row) => {
        const { buy, needNote } = row.staple
          ? { buy: "on hand?", needNote: "" }
          : toBuyLabel(row.key, row.need.total, row.need.unit);
        const recipes = formatRecipes(row.recipeCounts);
        return {
          key: row.key,
          item: row.item,
          buy,
          needNote,
          recipes,
          /** @deprecated use buy — kept for older callers */
          amounts: [buy],
          /** @deprecated use recipes */
          meals: recipes,
          aisle: row.aisle,
          staple: row.staple,
        };
      })
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

/** Plain text for clipboard — buy qty + recipe names. */
export function formatGroceryListText(list, { title = "Macros and Mamas — grocery list" } = {}) {
  if (!list?.sections?.length) {
    return `${title}\n\nNo ingredients found for this week.`;
  }
  const parts = [title, ""];
  list.sections.forEach((sec) => {
    parts.push(sec.aisle.toUpperCase());
    sec.items.forEach((row) => {
      const buy = row.buy || (row.amounts || []).join("; ") || "—";
      const recipes = (row.recipes || row.meals || []).join(" · ");
      const staple = row.staple ? " (likely on hand)" : "";
      const forBit = recipes ? ` — for: ${recipes}` : "";
      parts.push(`• ${row.item} — buy ${buy}${staple}${forBit}`);
    });
    parts.push("");
  });
  if (list.notes?.length) {
    parts.push("Notes");
    list.notes.forEach((n) => parts.push(`• ${n}`));
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}
