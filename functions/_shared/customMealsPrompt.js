/**
 * Format + load mama's saved My meals for AI week/meal prompts.
 * These are proven favorites — prefer reusing them when they fit
 * ranges, diet, and allergens.
 */

const MAX_MEALS = 40;
const MAX_INGREDIENT_CHARS = 160;

/**
 * @param {Array<{ name?: string, cal?: number, p?: number, c?: number, f?: number, serves?: number, ingredients?: string }>} meals
 */
export function buildCustomMealsBlock(meals = [], { max = MAX_MEALS } = {}) {
  const list = (Array.isArray(meals) ? meals : []).slice(0, max);
  if (!list.length) {
    return [
      "## Her saved My meals",
      "(none yet — lean on her loves + Callie's bank; when she saves meals later, prefer those)",
    ].join("\n");
  }

  const lines = list.map((m) => {
    const name = String(m.name || "Untitled").trim().slice(0, 80) || "Untitled";
    const cal = Number(m.cal) || 0;
    const p = Number(m.p) || 0;
    const c = Number(m.c) || 0;
    const f = Number(m.f) || 0;
    const serves = Number(m.serves) || 1;
    const servesBit = serves > 1 ? ` · batch serves ${serves}` : "";
    const ingRaw = String(m.ingredients || "").replace(/\s+/g, " ").trim();
    const ing = ingRaw
      ? ` — ${ingRaw.slice(0, MAX_INGREDIENT_CHARS)}${ingRaw.length > MAX_INGREDIENT_CHARS ? "…" : ""}`
      : "";
    return `- ${name} (${cal} cal · ${p}P/${c}C/${f}F per serving${servesBit})${ing}`;
  });

  return [
    "## Her saved My meals (proven favorites — reuse often)",
    "She already likes these and saved them under My meals. When a saved meal fits her ranges + diet/allergens, schedule or lightly adapt it before inventing a new plate or forcing a bank recipe.",
    "Macros below are ONE serving — use them when you reuse a meal (scale portions only if needed to hit the day). Set basedOn to the My meals name when you adapt one.",
    "Still vary the week — don't paste the same 2 meals every day unless she has very few saved.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Load custom_meals for a profile.
 * @param {{ useServiceRole?: boolean, authHeader?: string, limit?: number }} opts
 */
export async function fetchCustomMeals(env, userId, opts = {}) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base || !userId) return [];

  const limit = Math.min(MAX_MEALS, Math.max(1, Number(opts.limit) || MAX_MEALS));
  const useService = !!opts.useServiceRole;
  const key = useService
    ? env.SUPABASE_SERVICE_ROLE_KEY
    : (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "");
  const auth = useService
    ? `Bearer ${key}`
    : (opts.authHeader || "");

  if (!key || !auth) return [];

  const url =
    `${base}/rest/v1/custom_meals`
    + `?profile_id=eq.${encodeURIComponent(userId)}`
    + `&select=name,cal,p,c,f,serves,ingredients,updated_at`
    + `&order=updated_at.desc`
    + `&limit=${limit}`;

  const resp = await fetch(url, {
    headers: { apikey: key, authorization: auth },
  });
  if (!resp.ok) {
    // Older DBs without serves/ingredients — retry slim select
    const slim = await fetch(
      `${base}/rest/v1/custom_meals`
        + `?profile_id=eq.${encodeURIComponent(userId)}`
        + `&select=name,cal,p,c,f,updated_at`
        + `&order=updated_at.desc`
        + `&limit=${limit}`,
      { headers: { apikey: key, authorization: auth } },
    );
    if (!slim.ok) {
      console.warn("fetchCustomMeals failed", resp.status, await resp.text().catch(() => ""));
      return [];
    }
    const rows = await slim.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
