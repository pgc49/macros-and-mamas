/* ==================================================================
   /functions/api/meal-idea.js — single-meal AI for the week planner
   ==================================================================
   Auth + paid (or admin). Body:
     { mode: "describe", slot, description }
     { mode: "options", slot }  → 2–3 meals for that slot from prefs
     { mode: "eating_out", slot, description?, images[], remaining?, dayTotals? }
       → 3 restaurant picks from menu photo(s) + caption (ranked for remaining macros)
   Soft rate limit: 20 / day via estimate_calls type='meal_idea'.
   Secrets: OPENROUTER_API_KEY, SUPABASE_*, optional MEAL_PLAN_MODEL
   Default model: google/gemini-3.1-flash-lite (OpenRouter).
   ================================================================== */

import {
  buildDescribeMealPrompt,
  buildEatingOutPrompt,
  buildSlotOptionsPrompt,
  EATING_OUT_JSON_HINT,
  MEAL_IDEA_JSON_HINT,
} from "../_shared/clientMealIdeaPrompt.js";
import {
  callOpenRouter,
  logAiFailure,
  messageForKind,
  parseJsonLoose,
  resolveModels,
} from "../_shared/openrouter.js";
import { sanitizePlanMeal } from "../_shared/planMealShape.js";
import { fetchCustomMeals } from "../_shared/customMealsPrompt.js";

const MAX_PER_DAY = 20;
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_500_000;
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const MODES = new Set(["describe", "options", "eating_out"]);
const MEAL_IDEA_COPY = {
  retryLabel: "tap it again",
  manualLabel: "pick a recipe from the bank",
};

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "meal ideas unavailable" }, 503);
    }

    const authHeader = request.headers.get("authorization") || "";
    const user = await requireSupabaseUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const access = await fetchEnrollment(env, user.id, authHeader);
    if (!access || access.refunded || (!access.paid && access.role !== "admin")) {
      return json({ error: "payment required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mode = MODES.has(body.mode) ? body.mode : null;
    if (!mode) return json({ error: "mode must be describe, options, or eating_out" }, 400);

    let slot = String(body.slot || "").toLowerCase();
    if (!SLOTS.has(slot)) {
      if (mode === "options" || mode === "eating_out") {
        return json({ error: "slot required (breakfast|lunch|dinner|snack)" }, 400);
      }
      slot = "dinner";
    }

    const description = String(body.description || "").trim().slice(0, 500);
    if (mode === "describe" && description.length < 3) {
      return json({ error: "Describe the meal you want (a few words is fine)." }, 400);
    }

    const images = mode === "eating_out" ? parseImages(body) : [];
    if (mode === "eating_out" && !images.length) {
      return json({ error: "Add a photo of the menu first." }, 400);
    }

    // Admins (Callie / Tech Guy) — unlimited AI for coaching + QA. Mamas stay capped.
    const isAdmin = access.role === "admin";
    if (!isAdmin) {
      const limit = await checkIdeaLimit(env, user.id);
      if (!limit.ok) {
        return json(
          {
            error: "rate_limited",
            message: limit.message,
            retry_after_seconds: limit.retryAfterSeconds || 86400,
          },
          429,
        );
      }
    }

    const { profile, macros } = await loadSelf(env, user.id, authHeader);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (!macros) {
      return json(
        {
          error: "macros_required",
          message: "Your ranges need Callie's approval before AI meal ideas unlock.",
        },
        409,
      );
    }

    const customMeals = await fetchCustomMeals(env, user.id, { authHeader });
    const models = resolveModels(env);
    const remaining = sanitizeMacroBag(body.remaining);
    const dayTotals = sanitizeMacroBag(body.dayTotals);

    let prompt;
    let userContent;
    let jsonHint = MEAL_IDEA_JSON_HINT;
    let maxTokens = 4000;
    let system =
      "You are Callie's postpartum meal assistant. Prefer her saved My meals when they fit, then the recipe bank. Honest macros from ingredients. Honor food loves and diet/allergens. JSON only.";

    if (mode === "describe") {
      prompt = buildDescribeMealPrompt({ profile, macros, slot, description, customMeals });
      userContent = `${prompt}\n\n${jsonHint}`;
    } else if (mode === "options") {
      prompt = buildSlotOptionsPrompt({ profile, macros, slot, customMeals });
      userContent = `${prompt}\n\n${jsonHint}`;
      maxTokens = 8000;
    } else {
      prompt = buildEatingOutPrompt({
        profile,
        macros,
        slot,
        description,
        customMeals,
        remaining,
        dayTotals,
      });
      jsonHint = EATING_OUT_JSON_HINT;
      maxTokens = 8000;
      system =
        "You are Callie's postpartum meal assistant helping with restaurant menus. Read menu photos carefully. Suggest exactly 3 orderable dishes ranked for remaining macros / day range. Restaurant macros are rough estimates. Honor diet/allergens. JSON only.";
      userContent = [
        { type: "text", text: `${prompt}\n\n${jsonHint}` },
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.media_type};base64,${img.image_b64}` },
        })),
      ];
    }

    const result = await callOpenRouter({
      env,
      label: "meal_idea",
      models,
      maxTokens,
      temperature: mode === "eating_out" ? 0.25 : 0.3,
      timeoutMs: mode === "eating_out" ? 55_000 : 40_000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    if (!result.ok) {
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_idea",
        kind: result.kind,
        status: result.status,
        detail: result.detail,
      });
      return json(
        { error: "meal ideas unavailable", message: messageForKind(result.kind, MEAL_IDEA_COPY) },
        502,
      );
    }

    const parsedJson = parseJsonLoose(result.text);
    if (!parsedJson.ok) {
      console.error("meal-idea JSON parse failed", result.text.slice(0, 400));
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_idea",
        kind: "parse",
        model: result.model,
        detail: result.text.slice(0, 300),
      });
      return json(
        { error: "could not parse meal JSON", message: messageForKind("empty", MEAL_IDEA_COPY) },
        502,
      );
    }

    const meals = normalizeMeals(parsedJson.value, slot, { eatingOut: mode === "eating_out" });
    if (!meals.length) {
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_idea",
        kind: "empty",
        model: result.model,
        detail: "no meals returned after normalize",
      });
      return json(
        {
          error: "no meals returned",
          message: mode === "eating_out"
            ? "Couldn't read clear dishes from that menu — try a sharper photo or add a note with the dishes you're considering."
            : messageForKind("empty", MEAL_IDEA_COPY),
        },
        502,
      );
    }
    if (mode === "describe") {
      return json({ ok: true, mode, meal: meals[0] }, 200);
    }
    return json({ ok: true, mode, meals: meals.slice(0, 3) }, 200);
  } catch (e) {
    console.error("meal-idea failed", e);
    return json({ error: "meal ideas failed" }, 500);
  }
}

function parseImages(body) {
  const rawList = Array.isArray(body?.images) && body.images.length
    ? body.images.slice(0, MAX_IMAGES)
    : (body?.image_b64 && typeof body.image_b64 === "string"
      ? [{ image_b64: body.image_b64, media_type: body.media_type }]
      : []);
  const images = [];
  for (const item of rawList) {
    const b64 = typeof item?.image_b64 === "string" ? item.image_b64 : "";
    if (!b64 || b64.length > MAX_IMAGE_CHARS) continue;
    const mime = String(item?.media_type || "image/jpeg").slice(0, 40);
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) continue;
    images.push({ image_b64: b64, media_type: mime });
  }
  return images;
}

function sanitizeMacroBag(value) {
  if (!value || typeof value !== "object") return null;
  const n = (k) => {
    const v = Number(value[k]);
    return Number.isFinite(v) ? Math.round(v) : 0;
  };
  return { cal: n("cal"), p: n("p"), c: n("c"), f: n("f") };
}

function normalizeMeals(parsed, fallbackSlot, { eatingOut = false } = {}) {
  const raw = Array.isArray(parsed?.meals)
    ? parsed.meals
    : parsed?.meal
      ? [parsed.meal]
      : [];
  return raw
    .filter((m) => m && m.name)
    .map((m) => {
      let desc = String(m.desc || "").slice(0, 280);
      if (eatingOut && desc && !/rough|estimate|restaurant/i.test(desc)) {
        desc = `Rough restaurant estimate — ${desc}`.slice(0, 280);
      }
      return sanitizePlanMeal({
        slot: SLOTS.has(String(m.slot || "").toLowerCase())
          ? String(m.slot).toLowerCase()
          : fallbackSlot,
        name: String(m.name).slice(0, 120),
        basedOn: eatingOut ? null : (m.basedOn ? String(m.basedOn).slice(0, 120) : null),
        desc,
        cal: Math.round(Number(m.cal) || 0),
        p: Math.round(Number(m.p) || 0),
        c: Math.round(Number(m.c) || 0),
        f: Math.round(Number(m.f) || 0),
        servings: 1,
        ingredients: m.ingredients,
        batch: eatingOut ? null : m.batch,
        steps: m.steps,
      });
    });
}

async function requireSupabaseUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) return null;
  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchEnrollment(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon || !userId || !authHeader) return null;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,role`,
    { headers: { apikey: anon, authorization: authHeader } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function loadSelf(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon) throw new Error("missing supabase config");

  const [pResp, mResp] = await Promise.all([
    fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { apikey: anon, authorization: authHeader } },
    ),
    fetch(
      `${base}/rest/v1/macros?profile_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { apikey: anon, authorization: authHeader } },
    ),
  ]);

  const profiles = await pResp.json().catch(() => []);
  const macrosRows = await mResp.json().catch(() => []);
  const row = profiles[0];
  if (!row) return { profile: null, macros: null };

  const profile = {
    name: row.name,
    diet: row.diet,
    prefB: row.pref_b,
    prefL: row.pref_l,
    prefD: row.pref_d,
    prefS: row.pref_s,
    seasonNote: row.season_note,
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    allergenNote: row.allergen_note || "",
    foodAvoids: row.food_avoids || "",
  };
  const m = macrosRows[0];
  const macros = m
    ? {
        cal: Number(m.cal),
        protein: Number(m.protein),
        carbs: Number(m.carbs),
        fat: Number(m.fat),
      }
    : null;
  return { profile, macros };
}

async function checkIdeaLimit(env, userId) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { ok: true };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url =
    `${base}/rest/v1/estimate_calls?profile_id=eq.${encodeURIComponent(userId)}`
    + `&type=eq.meal_idea&created_at=gte.${encodeURIComponent(dayAgo)}&select=id`;
  const resp = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "count=exact",
      "range-unit": "items",
      range: "0-0",
    },
  });
  let dayCount = 0;
  if (resp.ok) {
    const contentRange = resp.headers.get("content-range") || "";
    const m = contentRange.match(/\/(\d+|\*)/);
    if (m && m[1] !== "*") dayCount = Number(m[1]) || 0;
  }
  if (dayCount >= MAX_PER_DAY) {
    return {
      ok: false,
      message: "You've used today's AI meal ideas. Add from the bank or My meals, or try again tomorrow.",
      retryAfterSeconds: 86400,
    };
  }
  await fetch(`${base}/rest/v1/estimate_calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({ profile_id: userId, type: "meal_idea" }),
  }).catch(() => {});
  return { ok: true };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
