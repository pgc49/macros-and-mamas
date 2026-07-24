/* ==================================================================
   /functions/api/meal-idea.js — single-meal AI for the week planner
   ==================================================================
   Auth + paid (or admin). Body:
     { mode: "describe", slot, description }
     { mode: "options", slot }  → 2–3 meals for that slot from prefs
   Soft rate limit: 20 / day via estimate_calls type='meal_idea'.
   Secrets: OPENROUTER_API_KEY, SUPABASE_*, optional MEAL_PLAN_MODEL
   ================================================================== */

import {
  buildDescribeMealPrompt,
  buildSlotOptionsPrompt,
  MEAL_IDEA_JSON_HINT,
} from "../_shared/clientMealIdeaPrompt.js";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";
const MAX_PER_DAY = 20;
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

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
    const mode = body.mode === "describe" ? "describe" : body.mode === "options" ? "options" : null;
    if (!mode) return json({ error: "mode must be describe or options" }, 400);

    let slot = String(body.slot || "").toLowerCase();
    if (!SLOTS.has(slot)) {
      if (mode === "options") return json({ error: "slot required (breakfast|lunch|dinner|snack)" }, 400);
      slot = "dinner";
    }

    const description = String(body.description || "").trim().slice(0, 500);
    if (mode === "describe" && description.length < 3) {
      return json({ error: "Describe the meal you want (a few words is fine)." }, 400);
    }

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

    const model = String(env.MEAL_PLAN_MODEL || DEFAULT_MODEL).slice(0, 120);
    const prompt =
      mode === "describe"
        ? buildDescribeMealPrompt({ profile, macros, slot, description })
        : buildSlotOptionsPrompt({ profile, macros, slot });

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "http-referer": "https://www.macrosandmamas.com",
        "x-title": "Macros and Mamas Meal Idea",
      },
      body: JSON.stringify({
        model,
        max_tokens: mode === "options" ? 8000 : 4000,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are Callie's postpartum meal assistant. Prefer her recipe bank. Honest macros from ingredients. Honor food loves. JSON only.",
          },
          { role: "user", content: `${prompt}\n\n${MEAL_IDEA_JSON_HINT}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data = await resp.json().catch(() => null);
    if (!data) return json({ error: "meal ideas unavailable" }, 502);
    if (data.error) {
      console.error("openrouter meal-idea error", data.error);
      return json({ error: data.error?.message || "meal ideas unavailable" }, 502);
    }

    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return json({ error: "empty model response" }, 502);

    const match = text.match(/\{[\s\S]*\}/);
    let parsed;
    try {
      parsed = JSON.parse(match ? match[0] : text);
    } catch (e) {
      console.error("meal-idea JSON parse failed", e, text.slice(0, 400));
      return json({ error: "could not parse meal JSON" }, 502);
    }

    const meals = normalizeMeals(parsed, slot);
    if (!meals.length) return json({ error: "no meals returned" }, 502);
    if (mode === "describe") {
      return json({ ok: true, mode, meal: meals[0] }, 200);
    }
    return json({ ok: true, mode, meals: meals.slice(0, 3) }, 200);
  } catch (e) {
    console.error("meal-idea failed", e);
    return json({ error: "meal ideas failed" }, 500);
  }
}

function normalizeMeals(parsed, fallbackSlot) {
  const raw = Array.isArray(parsed?.meals)
    ? parsed.meals
    : parsed?.meal
      ? [parsed.meal]
      : [];
  return raw
    .filter((m) => m && m.name)
    .map((m) => ({
      slot: SLOTS.has(String(m.slot || "").toLowerCase())
        ? String(m.slot).toLowerCase()
        : fallbackSlot,
      name: String(m.name).slice(0, 120),
      basedOn: m.basedOn ? String(m.basedOn).slice(0, 120) : null,
      desc: String(m.desc || "").slice(0, 280),
      cal: Math.round(Number(m.cal) || 0),
      p: Math.round(Number(m.p) || 0),
      c: Math.round(Number(m.c) || 0),
      f: Math.round(Number(m.f) || 0),
      servings: Number(m.servings) > 0 ? Number(m.servings) : 1,
      ingredients: Array.isArray(m.ingredients) ? m.ingredients.slice(0, 24) : [],
      batch: Array.isArray(m.batch) && m.batch.length ? m.batch.slice(0, 30) : null,
      steps: Array.isArray(m.steps) ? m.steps.map((s) => String(s).slice(0, 400)).slice(0, 10) : [],
    }));
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
