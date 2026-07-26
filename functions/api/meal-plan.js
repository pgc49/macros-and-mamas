/* ==================================================================
   /functions/api/meal-plan.js — admin draft week meal plans (OpenRouter)
   ==================================================================
   Admin-only. Body: { clientId, feedback?, previousPlan? }
   Builds a 7-day plan from intake tastes + Callie recipe bank + ranges.
   Optional Callie feedback regenerates from a prior draft digest.
   Draft for Callie review — not shown to clients.
   Secrets: OPENROUTER_API_KEY, SUPABASE_*, optional MEAL_PLAN_MODEL
   ================================================================== */

import {
  buildMealPlanPrompt,
  digestPreviousPlan,
  MEAL_PLAN_JSON_HINT,
} from "../_shared/mealPlanPrompt.js";
import {
  callOpenRouter,
  logAiFailure,
  parseJsonLoose,
  resolveModels,
} from "../_shared/openrouter.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "meal plan unavailable" }, 503);
    }

    const admin = await requireUser(request, env);
    if (!admin) return json({ error: "unauthorized" }, 401);
    if (!(await checkAdmin(env, admin.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const clientId = body.clientId;
    if (!clientId) return json({ error: "missing clientId" }, 400);

    const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2500) : "";
    const previousDigest = body.previousPlan
      ? digestPreviousPlan(body.previousPlan)
      : "";

    const { profile, macros } = await loadClientForPlan(env, clientId);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (!macros) return json({ error: "macros required — approve ranges first" }, 409);

    const models = resolveModels(env);
    const prompt = buildMealPlanPrompt({
      profile,
      macros,
      feedback: feedback || undefined,
      previousDigest: previousDigest || undefined,
    });

    const result = await callOpenRouter({
      env,
      label: "meal_plan",
      models,
      maxTokens: 16000,
      temperature: 0.2,
      timeoutMs: 50_000,
      messages: [
        {
          role: "system",
          content:
            "You are a careful postpartum nutrition meal planner for Callie. #1 job: every day's totals MUST land inside her approved cal/P/C/F bands by adjusting real food quantities — never invent macros and never return out-of-range days. Prefer Callie's recipe bank. Honor her revision notes when provided. Output JSON only.",
        },
        { role: "user", content: `${prompt}\n\n${MEAL_PLAN_JSON_HINT}` },
      ],
    });

    if (!result.ok) {
      await logAiFailure(env, {
        userId: admin.id,
        label: "meal_plan",
        kind: result.kind,
        status: result.status,
        detail: result.detail,
      });
      return json(
        { error: "meal plan unavailable", message: "AI didn't come back — try Draft again." },
        502,
      );
    }

    const model = result.model;
    const parsedPlan = parseJsonLoose(result.text);
    if (!parsedPlan.ok) {
      console.error("meal-plan JSON parse failed", result.text.slice(0, 400));
      await logAiFailure(env, {
        userId: admin.id,
        label: "meal_plan",
        kind: "parse",
        model,
        detail: result.text.slice(0, 300),
      });
      return json(
        { error: "could not parse plan JSON", message: "AI didn't come back cleanly — try Draft again." },
        502,
      );
    }
    const plan = parsedPlan.value;

    if (!plan?.days || !Array.isArray(plan.days) || plan.days.length < 7) {
      await logAiFailure(env, {
        userId: admin.id,
        label: "meal_plan",
        kind: "empty",
        model,
        detail: `plan missing 7 days (got ${Array.isArray(plan?.days) ? plan.days.length : 0})`,
      });
      return json({ error: "plan missing 7 days", plan }, 502);
    }

    // Recompute day totals / inRange server-side so Callie can trust the badges
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
      const meals = Array.isArray(day.meals) ? day.meals : [];
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
      return {
        ...day,
        meals,
        dayTotals,
        inRange: {
          cal: dayTotals.cal >= target.calLo && dayTotals.cal <= target.calHi,
          p: dayTotals.p >= target.pLo && dayTotals.p <= target.pHi,
          c: dayTotals.c >= target.cLo && dayTotals.c <= target.cHi,
          f: dayTotals.f >= target.fLo && dayTotals.f <= target.fHi,
        },
      };
    });
    plan.dailyTarget = target;

    const outOfRangeDays = plan.days.filter(
      (d) => d.inRange && Object.values(d.inRange).some((v) => v === false),
    ).length;

    plan.meta = {
      clientId,
      clientName: profile.name || null,
      model,
      generatedAt: new Date().toISOString(),
      status: "draft",
      clientFacing: false,
      hadFeedback: Boolean(feedback),
      outOfRangeDays,
    };

    return json({ ok: true, plan, outOfRangeDays }, 200);
  } catch (e) {
    console.error("meal-plan failed", e);
    return json({ error: "meal plan failed" }, 500);
  }
}

async function requireUser(request, env) {
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

async function checkAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

async function loadClientForPlan(env, clientId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing supabase config");

  const [pResp, mResp] = await Promise.all([
    fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(clientId)}&select=*`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    ),
    fetch(
      `${base}/rest/v1/macros?profile_id=eq.${encodeURIComponent(clientId)}&select=*`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    ),
  ]);

  const pRows = pResp.ok ? await pResp.json() : [];
  const mRows = mResp.ok ? await mResp.json() : [];
  const row = pRows[0];
  const m = mRows[0];
  if (!row) return { profile: null, macros: null };

  const profile = {
    name: [row.name, row.last_name].filter(Boolean).join(" ") || row.name,
    age: row.age,
    currentWeight: row.current_weight,
    goalWeight: row.goal_weight,
    monthsPP: row.months_pp,
    breastfeeding: row.breastfeeding,
    pregnant: row.pregnant,
    goal: row.goal,
    activity: row.activity,
    stress: row.stress,
    insulinResistance: !!row.insulin_resistance,
    diet: row.diet || "none",
    prefB: row.pref_b || "",
    prefL: row.pref_l || "",
    prefD: row.pref_d || "",
    prefS: row.pref_s || "",
    seasonNote: row.season_note || "",
  };

  const macros = m
    ? { cal: m.cal, protein: m.protein, carbs: m.carbs, fat: m.fat, notes: m.notes || [] }
    : null;

  return { profile, macros };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
