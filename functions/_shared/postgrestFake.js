/**
 * CI PostgREST stand-in that 400s unknown columns — the live 400 that
 * used to become macrosStatus "none" when tests ignored `order=`.
 */

export const LIVE_MACROS_COLUMNS = new Set([
  "profile_id",
  "cal",
  "protein",
  "fat",
  "carbs",
  "notes",
  "approved",
  "approved_at",
]);

export const LIVE_TABLE_COLUMNS = {
  macros: LIVE_MACROS_COLUMNS,
  profiles: new Set([
    "id", "name", "email", "paid", "refunded", "role", "diet", "allergens",
    "allergen_note", "food_avoids", "pref_b", "pref_l", "pref_d", "pref_s",
    "season_note", "breastfeeding", "months_pp", "status",
  ]),
  estimate_calls: new Set([
    "id", "profile_id", "type", "created_at", "request_id",
  ]),
};

export function postgrestColumnsFromUrl(url) {
  const value = String(url || "");
  const tableMatch = value.match(/\/rest\/v1\/([a-z0-9_]+)/i);
  const table = tableMatch?.[1] || "";
  const used = new Set();
  const order = value.match(/[?&]order=([^&]+)/);
  if (order) {
    for (const part of decodeURIComponent(order[1]).split(",")) {
      const col = part.split(".")[0].trim();
      if (col) used.add(col);
    }
  }
  const select = value.match(/[?&]select=([^&]+)/);
  if (select && select[1] !== "*") {
    for (const part of decodeURIComponent(select[1]).split(",")) {
      const col = part.trim();
      if (col && col !== "*") used.add(col);
    }
  }
  for (const match of value.matchAll(/[?&]([a-z_][a-z0-9_]*)=eq\./gi)) {
    used.add(match[1]);
  }
  for (const match of value.matchAll(/[?&]([a-z_][a-z0-9_]*)=gte\./gi)) {
    used.add(match[1]);
  }
  return { table, columns: [...used] };
}

export function rejectUnknownPostgrestColumns(url, table, allowed) {
  const parsed = postgrestColumnsFromUrl(url);
  if (parsed.table !== table) return null;
  for (const col of parsed.columns) {
    if (!allowed.has(col)) {
      return new Response(
        JSON.stringify({
          code: "42703",
          details: null,
          hint: null,
          message: `column ${table}.${col} does not exist`,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  }
  return null;
}
