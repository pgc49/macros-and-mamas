/* ==================================================================
   /functions/api/meal-suggest.js — client week suggestions (OpenRouter)
   ==================================================================
   Auth + paid (or admin). Suggests a full 7-day plan from intake tastes
   + Callie recipe bank + approved ranges. Client accepts into planner.
   Soft rate limit: 5 / day via estimate_calls type='meal_suggest'.
   Silent client retries log type='meal_suggest_retry' (does not count toward the 5/day).
   Secrets: OPENROUTER_API_KEY, SUPABASE_*, optional MEAL_PLAN_MODEL
   Default model: google/gemini-3.1-flash-lite (same family as meal estimates).
   ================================================================== */

import {
  buildClientSuggestPrompt,
  CLIENT_SUGGEST_JSON_HINT,
} from "../_shared/clientMealSuggestPrompt.js";
import {
  callOpenRouter,
  logAiFailure,
  parseJsonLoose,
  resolveModels,
} from "../_shared/openrouter.js";
import { sanitizePlanMeal } from "../_shared/planMealShape.js";
import { fetchCustomMeals } from "../_shared/customMealsPrompt.js";

const MAX_PER_DAY = 5;
const SUGGEST_RETRY_COPY = "AI was slow starting up — tap Suggest my week once more.";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "suggestions unavailable" }, 503);
    }

    const authHeader = request.headers.get("authorization") || "";
    const user = await requireSupabaseUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const access = await fetchEnrollment(env, user.id, authHeader);
    if (!access || access.refunded || (!access.paid && access.role !== "admin")) {
      return json({ error: "payment required" }, 403);
    }

    // Admins (Callie / Tech Guy) — unlimited AI for coaching + QA. Mamas stay capped.
    const isAdmin = access.role === "admin";
    if (!isAdmin) {
      const limit = await checkSuggestLimit(env, user.id);
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

    const { profile, macros } = await loadSelfForSuggest(env, user.id, authHeader);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (!macros) {
      return json(
        { error: "macros_required", message: "Your ranges need Callie's approval before AI can plan a week." },
        409,
      );
    }

    const body = await request.json().catch(() => ({}));
    const attempt = Math.max(1, Math.min(2, Number(body?.attempt) || 1));
    // Track silent retries (attempt 2) — not counted toward the 5/day suggest limit.
    if (attempt >= 2) {
      await logEstimateType(env, user.id, "meal_suggest_retry");
    }

    const customMeals = await fetchCustomMeals(env, user.id, { authHeader });
    const models = resolveModels(env);
    const model = models[0];
    const prompt = buildClientSuggestPrompt({ profile, macros, customMeals });

    const result = await callOpenRouter({
      env,
      label: "meal_suggest",
      models,
      maxTokens: 16000,
      temperature: 0.25,
      timeoutMs: 45_000,
      messages: [
        {
          role: "system",
          content:
            "You are Callie's meal-planning assistant helping a postpartum client plan her week. Honor her food loves and reuse her saved My meals when they fit. Keep every day inside her approved macro bands. Prefer My meals, then Callie's recipe bank. Output JSON only.",
        },
        { role: "user", content: `${prompt}\n\n${CLIENT_SUGGEST_JSON_HINT}` },
      ],
    });

    if (!result.ok) {
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_suggest",
        kind: result.kind,
        status: result.status,
        detail: result.detail,
      });
      return json({ error: "suggestions unavailable", message: SUGGEST_RETRY_COPY }, 502);
    }

    const parsedPlan = parseJsonLoose(result.text);
    if (!parsedPlan.ok) {
      console.error("meal-suggest JSON parse failed", result.text.slice(0, 400));
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_suggest",
        kind: "parse",
        model: result.model,
        detail: result.text.slice(0, 300),
      });
      return json({ error: "could not parse plan JSON", message: SUGGEST_RETRY_COPY }, 502);
    }
    const plan = parsedPlan.value;

    if (!plan?.days || !Array.isArray(plan.days) || plan.days.length < 7) {
      await logAiFailure(env, {
        userId: user.id,
        label: "meal_suggest",
        kind: "empty",
        model: result.model,
        detail: `plan missing 7 days (got ${Array.isArray(plan?.days) ? plan.days.length : 0})`,
      });
      return json({ error: "plan missing 7 days", message: SUGGEST_RETRY_COPY }, 502);
    }

    // Count only successful suggests so a flaky first attempt doesn't burn her daily limit.
    await logEstimateType(env, user.id, "meal_suggest");

    const target = plan.dailyTarget || {
      calLo: macros.cal,
      calHi: macros.cal + 150,
      pLo: macros.protein,
      pHi: macros.protein + 10,
      cLo: macros.carbs,
      cHi: macros.carbs + 10,
      fLo: macros.fat,
      fHi: macros.fat + 10,
    };

    plan.days = plan.days.slice(0, 7).map((day) => {
      const meals = (Array.isArray(day.meals) ? day.meals : []).map(sanitizePlanMeal);
      const dayTotals = meals.reduce(
        (a, m) => ({
          cal: a.cal + (Number(m.cal) || 0),
          p: a.p + (Number(m.p) || 0),
          c: a.c + (Number(m.c) || 0),
          f: a.f + (Number(m.f) || 0),
        }),
        { cal: 0, p: 0, c: 0, f: 0 },
      );
      const round = (n) => Math.round(n);
      dayTotals.cal = round(dayTotals.cal);
      dayTotals.p = round(dayTotals.p);
      dayTotals.c = round(dayTotals.c);
      dayTotals.f = round(dayTotals.f);
      return { ...day, meals, dayTotals };
    });
    plan.dailyTarget = target;
    plan.meta = {
      model,
      generatedAt: new Date().toISOString(),
      clientFacing: true,
    };

    return json({
      ok: true,
      plan,
      summary: plan.summaryForClient || "",
      retried: attempt >= 2,
    }, 200);
  } catch (e) {
    console.error("meal-suggest failed", e);
    return json({ error: "suggestions failed" }, 500);
  }
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

async function loadSelfForSuggest(env, userId, authHeader) {
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
    age: row.age,
    currentWeight: row.current_weight,
    goalWeight: row.goal_weight,
    goal: row.goal,
    activity: row.activity,
    stress: row.stress,
    insulinResistance: row.insulin_resistance,
    pregnant: row.pregnant,
    breastfeeding: row.breastfeeding,
    monthsPP: row.months_pp,
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

async function checkSuggestLimit(env, userId) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    // Allow without hard fail — payment gate already passed
    return { ok: true };
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url =
    `${base}/rest/v1/estimate_calls?profile_id=eq.${encodeURIComponent(userId)}`
    + `&type=eq.meal_suggest&created_at=gte.${encodeURIComponent(dayAgo)}&select=id`;
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
      message: "You've used today's AI week suggestions. Try the taste-matched bank picks, or come back tomorrow.",
      retryAfterSeconds: 86400,
    };
  }

  return { ok: true };
}

async function logEstimateType(env, userId, type) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId || !type) return;
  await fetch(`${base}/rest/v1/estimate_calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({ profile_id: userId, type }),
  }).catch(() => {});
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
