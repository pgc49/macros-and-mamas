/* ==================================================================
   /functions/api/coach.js — the meal coach's conversation layer
   ==================================================================
   Auth + paid (or admin). Body:
     { mode: "ask",     text, slot, budget?, recent?[] }
     { mode: "menu",    text?, slot, budget?, images[] }   → what to order
     { mode: "kitchen", text?, slot, budget?, images[] }   → from what she has

   Three things this endpoint will not do:

   1. Answer anything outside food and her ranges. classifyAsk runs first,
      so an out-of-scope question is refused before a model is called at
      all — no cost, and the same words every time.
   2. Quote her numbers. What's left today and what this slot can afford
      are worked out on her device; the model is told them and forbidden
      from repeating them.
   3. Pass on macros that don't add up. Every returned meal has to survive
      4/4/9, and the client re-checks fit against the real budget before
      any card is drawn.

   Soft rate limit: 30 model calls / rolling 24h via estimate_calls
   type='coach'. Deterministic answers never reach this endpoint.
   Secrets: OPENROUTER_API_KEY, SUPABASE_*, optional MEAL_PLAN_MODEL
   ================================================================== */

import {
  buildCoachAskPrompt,
  buildCoachKitchenPrompt,
  buildCoachMenuPrompt,
  COACH_SYSTEM,
} from "../_shared/coachPrompt.js";
import { classifyAsk, macrosPlausible, replyIsClean } from "../_shared/coachGuardrails.js";
import {
  callOpenRouter,
  logAiFailure,
  messageForKind,
  parseJsonLoose,
  resolveModels,
} from "../_shared/openrouter.js";
import {
  checkAiLimit,
  fetchEnrollment,
  json,
  loadSelf,
  requireSupabaseUser,
} from "../_shared/clientAiAccess.js";
import { sanitizePlanMeal } from "../_shared/planMealShape.js";
import { fetchCustomMeals } from "../_shared/customMealsPrompt.js";

const MAX_PER_DAY = 30;
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_500_000;
const MAX_TEXT = 600;
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const MODES = new Set(["ask", "menu", "kitchen"]);

const COACH_FAILURE_COPY = {
  retryLabel: "ask me again",
  manualLabel: "pick something from Meals",
};

/** Said the same way every time, so a refusal never reads like a glitch. */
const DEFLECT_MESSAGE = {
  urgent: "care",
  ranges: "ranges",
  weight: "weight",
  admin: "admin",
  off_topic: "offTopic",
};

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "coach unavailable" }, 503);
    }

    const authHeader = request.headers.get("authorization") || "";
    const user = await requireSupabaseUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const access = await fetchEnrollment(env, user.id, authHeader);
    if (!access || access.refunded || (!access.paid && access.role !== "admin")) {
      return json({ error: "payment required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mode = MODES.has(body.mode) ? body.mode : "ask";
    const text = String(body.text || "").trim().slice(0, MAX_TEXT);
    const slot = SLOTS.has(String(body.slot || "").toLowerCase())
      ? String(body.slot).toLowerCase()
      : "dinner";
    const images = mode === "ask" ? [] : parseImages(body);

    if (mode === "ask" && text.length < 2) {
      return json({ error: "Ask me something about your next meal." }, 400);
    }
    if (mode !== "ask" && !images.length) {
      return json({ error: "Add a photo first." }, 400);
    }

    // The guardrail runs before anything is spent. A photo of a menu is a
    // food question by construction, so only free text is classified.
    const verdict = mode === "ask" ? classifyAsk(text) : { scope: "food", aside: null };
    if (verdict.scope !== "food") {
      return json({
        ok: true,
        scope: verdict.scope,
        deflect: DEFLECT_MESSAGE[verdict.scope] || "offTopic",
        meals: [],
      });
    }

    const isAdmin = access.role === "admin";
    if (!isAdmin) {
      const limit = await checkAiLimit(env, user.id, {
        type: "coach",
        max: MAX_PER_DAY,
        busyMessage: "I can't think straight right now. Try again in a minute, or pick something from Meals.",
        spentMessage: "That's all the thinking I've got for today. Meals has the full bank whenever you want it.",
      });
      if (!limit.ok) {
        return json(
          { error: "rate_limited", message: limit.message, retry_after_seconds: limit.retryAfterSeconds },
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
          message: "Your ranges need Callie's approval before I can help with meals.",
        },
        409,
      );
    }

    const customMeals = await fetchCustomMeals(env, user.id, { authHeader });
    const budget = sanitizeBudget(body.budget);
    const recentNames = parseRecent(body.recent);
    const args = { profile, budget, slot, customMeals, recentNames };

    let prompt;
    if (mode === "menu") prompt = buildCoachMenuPrompt({ ...args, note: text });
    else if (mode === "kitchen") prompt = buildCoachKitchenPrompt({ ...args, note: text });
    else prompt = buildCoachAskPrompt({ ...args, question: text });

    const userContent = images.length
      ? [
        { type: "text", text: prompt },
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.media_type};base64,${img.image_b64}` },
        })),
      ]
      : prompt;

    const result = await callOpenRouter({
      env,
      label: "coach",
      models: resolveModels(env),
      maxTokens: images.length ? 8000 : 4000,
      temperature: 0.3,
      timeoutMs: images.length ? 55_000 : 35_000,
      messages: [
        { role: "system", content: COACH_SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    if (!result.ok) {
      await logAiFailure(env, {
        userId: user.id,
        label: "coach",
        kind: result.kind,
        status: result.status,
        detail: result.detail,
      });
      return json(
        { error: "coach unavailable", message: messageForKind(result.kind, COACH_FAILURE_COPY) },
        502,
      );
    }

    const parsed = parseJsonLoose(result.text);
    if (!parsed.ok) {
      await logAiFailure(env, {
        userId: user.id,
        label: "coach",
        kind: "parse",
        model: result.model,
        detail: result.text.slice(0, 300),
      });
      return json(
        { error: "could not read that", message: messageForKind("empty", COACH_FAILURE_COPY) },
        502,
      );
    }

    // Second layer: the model gets to hand a question back too.
    if (String(parsed.value?.scope || "").toLowerCase() === "callie") {
      return json({ ok: true, scope: "off_topic", deflect: "offTopic", meals: [] });
    }

    const reply = cleanReply(parsed.value?.reply);
    const meals = normalizeMeals(parsed.value, slot, mode);

    return json({
      ok: true,
      scope: "food",
      mode,
      reply,
      meals,
      mealSource: mode === "menu" ? "menu" : mode === "kitchen" ? "kitchen" : "new",
      aside: verdict.aside || null,
    });
  } catch (e) {
    console.error("coach failed", e);
    return json({ error: "coach failed" }, 500);
  }
}

function parseImages(body) {
  const raw = Array.isArray(body?.images) ? body.images.slice(0, MAX_IMAGES) : [];
  const images = [];
  for (const item of raw) {
    const b64 = typeof item?.image_b64 === "string" ? item.image_b64 : "";
    if (!b64 || b64.length > MAX_IMAGE_CHARS) continue;
    const mime = String(item?.media_type || "image/jpeg").slice(0, 40);
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) continue;
    images.push({ image_b64: b64, media_type: mime });
  }
  return images;
}

function sanitizeBudget(value) {
  if (!value || typeof value !== "object") return null;
  const n = (k) => {
    const v = Number(value[k]);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  };
  const budget = { cal: n("cal"), pNeed: n("pNeed"), c: n("c"), f: n("f") };
  return budget.cal > 0 ? budget : null;
}

function parseRecent(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((n) => String(n || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 25);
}

/**
 * Anything that reads like the model talking about itself, hedging like a
 * chatbot, or quoting her ranges back is dropped rather than shown.
 */
function cleanReply(raw) {
  const text = String(raw || "").trim().slice(0, 400);
  if (!text) return "";
  return replyIsClean(text) ? text : "";
}

function normalizeMeals(parsed, fallbackSlot, mode) {
  const raw = Array.isArray(parsed?.meals) ? parsed.meals : parsed?.meal ? [parsed.meal] : [];
  const out = [];
  for (const m of raw.slice(0, 3)) {
    if (!m?.name) continue;
    const macros = {
      cal: Math.round(Number(m.cal) || 0),
      p: Math.round(Number(m.p) || 0),
      c: Math.round(Number(m.c) || 0),
      f: Math.round(Number(m.f) || 0),
    };
    // A meal whose macros don't add up is worse than no meal at all.
    if (!macrosPlausible(macros)) continue;

    let desc = String(m.desc || "").slice(0, 280);
    if (mode === "menu" && desc && !/estimate/i.test(desc)) {
      desc = `Rough estimate — ${desc}`.slice(0, 280);
    }

    out.push(sanitizePlanMeal({
      slot: SLOTS.has(String(m.slot || "").toLowerCase()) ? String(m.slot).toLowerCase() : fallbackSlot,
      name: String(m.name).slice(0, 120),
      basedOn: mode === "menu" ? null : (m.basedOn ? String(m.basedOn).slice(0, 120) : null),
      desc,
      ...macros,
      servings: 1,
      ingredients: m.ingredients,
      batch: null,
      steps: m.steps,
    }));
  }
  return out;
}
