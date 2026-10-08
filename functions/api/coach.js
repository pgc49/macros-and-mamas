/* ==================================================================
   /functions/api/coach.js — the meal coach's conversation layer
   ==================================================================
   Auth + paid (or admin). Body:
     { mode: "ask",     text, slot, budget?, recent?[] }
     { mode: "menu",    text?, slot, budget?, images[] }   → what to order
     { mode: "kitchen", text?, slot, budget?, images[] }   → from what she has
     { mode: "record",  template, topic?, body?, payload?, localDate }
         → persist a local/teach reply. Arbitrary coach content is rejected.
           Teach/noneFit are rebuilt here. Cards/read are source='client'.

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
  buildCoachMenuLinkPrompt,
  buildCoachMenuPrompt,
  COACH_SYSTEM,
  sanitizeCoachContext,
} from "../_shared/coachPrompt.js";
import {
  classifyAsk,
  deflectForScope,
  deflectModelHandoff,
  isCrisisUrgent,
  isMealAsk,
  macrosPlausible,
  replyHasJargon,
  replyIsClean,
  scopeIsRefused,
} from "../_shared/coachGuardrails.js";
import { askedForMealOptions, askedMealCount, limitAskMeals } from "../_shared/coachAskMeals.js";
import { filterCoachMeals } from "../_shared/coachMealFilter.js";
import { escalateDoor, isWontLogRefusal } from "../_shared/coachRefusalSummary.js";
import {
  callOpenRouter,
  logAiFailure,
  parseJsonLoose,
  resolveCoachModels,
} from "../_shared/openrouter.js";
import {
  checkAiLimit,
  fetchEnrollment,
  json,
  loadCoachSelf,
  requireSupabaseUser,
} from "../_shared/clientAiAccess.js";
import { sanitizePlanMeal } from "../_shared/planMealShape.js";
import { fetchCustomMeals } from "../_shared/customMealsPrompt.js";
import { hasMenuLink, localCoachTeach, PAIN_TOPICS, teachBody } from "../../src/utils/coachTeach.js";
import { dishOnPage, fetchMenuPage, firstMenuLink } from "../_shared/menuPage.js";
import { COACH_BUSY_LINE, COACH_LIMIT_SPENT, leadFineTuningReply, leadLimitReply, menuFromPageCopy } from "../../src/content/coachVoice.js";
import { slotNamedInAsk } from "../../src/utils/coachIntent.js";
import { appendCoachRefusal } from "../_shared/coachRefusalSummary.js";
import {
  buildLocalCoachRecord,
  clampCoachRequestId,
  countPainTeachToday,
  insertCoachReply,
  isCoachRequestId,
  isStuckPainCount,
  noteReserveRequestId,
  persistServerCoach,
} from "../_shared/coachMessages.js";
import { sizeMealsForPersist } from "../_shared/coachPlateScale.js";
import { notifyCrisisEmail } from "../_shared/coachCrisisEmail.js";
import { ensureFoodMeals, fallbackMealReply, MEAL_TEACH_TOPICS, padCoachMeals } from "../_shared/coachFoodFallback.js";

const MAX_PER_DAY = 30;
const MAX_RECORD_PER_DAY = 200;
const MAX_NOTES_PER_DAY = 20;
const COACH_NOTE_TYPE = "coach_note";
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_500_000;
const MAX_TEXT = 600;
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const MODES = new Set(["ask", "menu", "kitchen", "record"]);
const LOG_NAG = /\b(log it|pencil in|save to my meals|don't forget to log|log this|save this)\b/gi;

function wantsFoodFill(text, { mode, scope, crisis = false, topic = null } = {}) {
  if (crisis) return false;
  if (isMealAsk(text, { mode, topic })) return true;
  return scope === "urgent" || scope === "supply";
}

function coachFillArgs({ text, slot, mode, topic, profile, customMeals, day, reply, safe, iron }) {
  const skipNames = [
    ...((day && day.alreadySuggested) || []),
    ...((day && day.turnedDown) || []),
  ];
  const want = askedMealCount(text);
  return {
    text,
    slot,
    mode,
    topic,
    profile,
    customMeals,
    reply,
    safe,
    iron: iron || /\biron\b/i.test(String(text || "")),
    skipNames,
    count: want >= 2 ? want : 3,
  };
}

function stripLogNag(reply) {
  return String(reply || "")
    .replace(LOG_NAG, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

const LOGGED_MEAL_PHOTO = /\b(already (ate|logged)|just (ate|logged)|logged this|ate this|i logged)\b/i;

function isLoggedMealPhoto(text, mode) {
  return (mode === "menu" || mode === "kitchen") && LOGGED_MEAL_PHOTO.test(String(text || ""));
}

function finishLocalPicks(filled, { day, workingNumbers = false, lead = null } = {}) {
  let reply = filled?.reply || "";
  if (day?.notLogging) reply = stripLogNag(reply);
  if (typeof lead === "function") reply = lead(reply);
  else if (workingNumbers) reply = leadFineTuningReply(reply);
  return { meals: filled?.meals || [], reply };
}

async function allowCoachNote(env, userId, { isAdmin, requestId }) {
  if (isAdmin) return true;
  const limit = await checkAiLimit(env, userId, {
    type: COACH_NOTE_TYPE,
    max: MAX_NOTES_PER_DAY,
    requestId: noteReserveRequestId(requestId),
    busyMessage: "I couldn't save that just now. Try again in a minute.",
    spentMessage: "That's enough saved notes for today. I'll still answer here.",
  });
  return limit.ok;
}

async function persistCannedCoach(env, userId, body, message, {
  isAdmin,
  requestId,
  asked = "",
  scope = null,
  escalate = null,
}) {
  const allowed = await allowCoachNote(env, userId, { isAdmin, requestId });
  const door = escalateDoor(asked, { scope, escalate });
  const crisis = door === "crisis";
  if (!allowed && !crisis) return false;
  if (door && (allowed || crisis)) {
    const noted = await appendCoachRefusal(env, userId, { asked, scope, escalate });
    if (!noted.ok && !noted.skipped) {
      await logAiFailure(env, {
        userId,
        label: "coach",
        kind: "note",
        detail: noted.reason === "full"
          ? "client_summaries append full"
          : "client_summaries append failed",
      });
    } else if (noted.ok && Number(noted.trimmed) > 0) {
      await logAiFailure(env, {
        userId,
        label: "coach",
        kind: "note",
        detail: `client_summaries append trimmed:${noted.trimmed}`,
      });
    }
    if (door === "crisis" && noted.ok && !noted.skipped && !noted.capped && !noted.unchanged) {
      await notifyCrisisEmail(env, { userId, asked });
    }
  }
  if (allowed) {
    await persistServerCoach(env, userId, body, {
      ...message,
      payload: { ...(message.payload || {}), requestId },
    });
  }
  return allowed;
}

export async function onRequestPost({ request, env }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await requireSupabaseUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const access = await fetchEnrollment(env, user.id, authHeader);
    if (!access || access.refunded || (!access.paid && access.role !== "admin")) {
      return json({ error: "payment required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mode = MODES.has(body.mode) ? body.mode : "ask";
    const isAdmin = access.role === "admin";
    const requestId = clampCoachRequestId(body.requestId);

    // Local cards/read/teach only. The client never sends a model reply
    // back. Arbitrary coach content is rejected; pins never come from here.
    if (mode === "record") {
      if (!isAdmin) {
        const limit = await checkAiLimit(env, user.id, {
          type: "coach_record",
          max: MAX_RECORD_PER_DAY,
          busyMessage: "I couldn't save that just now. Try again in a minute.",
          spentMessage: "That's enough saved replies for today. Tomorrow's a fresh start.",
        });
        if (!limit.ok) {
          return json(
            { error: "rate_limited", message: limit.message, retry_after_seconds: limit.retryAfterSeconds },
            429,
          );
        }
      }
      const local = buildLocalCoachRecord(body);
      if (!local) return json({ error: "invalid record" }, 400);
      const saved = await insertCoachReply(env, user.id, {
        ...local,
        localDate: body.localDate,
        requestId: clampCoachRequestId(body.requestId),
      });
      if (!saved.ok) return json({ error: "could not save" }, 502);
      return json({
        ok: true,
        message: {
          id: saved.id || null,
          role: "coach",
          source: local.source,
          body: local.body,
          kind: local.kind,
          payload: local.payload,
          requestId: isCoachRequestId(body.requestId) ? String(body.requestId).trim() : null,
          localDate: body.localDate || null,
        },
      });
    }

    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "coach unavailable" }, 503);
    }
    const text = String(body.text || "").trim().slice(0, MAX_TEXT);
    const askedSlot = slotNamedInAsk(text);
    const slot = askedSlot
      || (SLOTS.has(String(body.slot || "").toLowerCase())
        ? String(body.slot).toLowerCase()
        : "dinner");
    const images = mode === "ask" ? [] : parseImages(body);
    const earlyDay = sanitizeCoachContext({
      ...(body.context || {}),
      notLogging: Boolean(body.context?.notLogging) || isWontLogRefusal(text),
    });
    const loadedSelf = await loadCoachSelf(env, user.id, authHeader);
    const earlyProfile = loadedSelf?.profile || null;

    if (mode === "ask" && text.length < 2) {
      return json({ error: "Ask me something about your next meal." }, 400);
    }
    if (mode !== "ask" && !images.length) {
      return json({ error: "Add a photo first." }, 400);
    }

    // Classify free text on ask and on a photo note. A symptom typed under
    // a menu shot must still reach Callie. An empty photo note stays food.
    const verdict = (mode === "ask" || text.length >= 2)
      ? classifyAsk(text)
      : { scope: "food", aside: null };

    // Callie's own sentences. Same matcher the client runs, so a crafted
    // request cannot spend a model call on a question she already answered.
    // A pasted link is not one of those sentences. It is fetched below.
    const teach = mode === "ask" && !hasMenuLink(text) ? localCoachTeach(text) : null;
    // Ignore escalate:'stuck' from the client. The third pain ask today
    // is stuck; anything earlier is just the teach again.
    const painCount = teach && PAIN_TOPICS.has(teach.topic)
      ? await countPainTeachToday(env, user.id, teach.topic)
      : 0;
    if (teach && PAIN_TOPICS.has(teach.topic) && isStuckPainCount(painCount)) {
      const filled = wantsFoodFill(text, { mode, topic: teach.topic, scope: "food" })
        ? ensureFoodMeals([], coachFillArgs({ text, slot, mode, topic: teach.topic, safe: true, day: earlyDay, profile: earlyProfile }))
        : { meals: [] };
      await persistCannedCoach(env, user.id, body, {
        body: "",
        kind: "deflect",
        payload: { deflect: "again", cards: persistMeals(filled.meals, slot) },
      }, {
        isAdmin,
        requestId,
        asked: text,
        escalate: "stuck",
      });
      return json({
        ok: true,
        scope: "stuck",
        deflect: "again",
        meals: filled.meals,
        mealSource: filled.meals.length ? "new" : undefined,
      });
    }
    if (scopeIsRefused(verdict.scope)) {
      const deflect = deflectForScope(verdict.scope, text);
      const crisis = deflect === "emergency" || isCrisisUrgent(text);
      const filled = wantsFoodFill(text, { mode, scope: verdict.scope, crisis })
        ? ensureFoodMeals([], coachFillArgs({
          text,
          slot,
          mode,
          safe: verdict.scope === "urgent" || verdict.scope === "supply",
          day: earlyDay,
          profile: earlyProfile,
        }))
        : { meals: [] };
      await persistCannedCoach(env, user.id, body, {
        body: "",
        kind: "deflect",
        payload: { deflect, cards: persistMeals(filled.meals, slot) },
      }, {
        isAdmin,
        requestId,
        asked: text,
        scope: verdict.scope,
      });
      return json({
        ok: true,
        scope: verdict.scope,
        deflect,
        meals: filled.meals,
        mealSource: filled.meals.length ? "new" : undefined,
      });
    }

    if (teach) {
      const reply = teachBody(teach.topic, {
        again: teach.topic === "neverSkip" && painCount.total >= 1,
        notLogging: Boolean(body.context?.notLogging) || isWontLogRefusal(text),
      });
      const filled = MEAL_TEACH_TOPICS.has(teach.topic)
        ? ensureFoodMeals([], coachFillArgs({ text, slot, mode, topic: teach.topic, reply, day: earlyDay, profile: earlyProfile }))
        : { meals: [], reply };
      const teachReply = earlyDay?.notLogging ? stripLogNag(filled.reply || reply) : (filled.reply || reply);
      await persistCannedCoach(env, user.id, body, {
        body: teachReply,
        kind: filled.meals.length ? "cards" : "text",
        payload: {
          teach: teach.topic,
          aside: verdict.aside || null,
          cards: persistMeals(filled.meals, slot),
        },
      }, { isAdmin, requestId, asked: text });
      return json({
        ok: true,
        scope: "food",
        teach: teach.topic,
        reply: teachReply,
        meals: filled.meals,
        mealSource: filled.meals.length ? "new" : undefined,
        aside: verdict.aside || null,
      });
    }

    // A link we cannot read must not become a guessed dish.
    // Reserve the note bucket before any fetch so a pasted URL cannot
    // spend the hop budget after she is already over the cap.
    let menuPage = null;
    if (mode === "ask" && hasMenuLink(text)) {
      const noteOk = isAdmin || await allowCoachNote(env, user.id, { isAdmin, requestId });
      if (!noteOk) {
        const reply = teachBody("menuClosed");
        const filled = ensureFoodMeals([], coachFillArgs({ text, slot, mode, topic: "menuClosed", reply, day: earlyDay, profile: earlyProfile }));
        return json({
          ok: true,
          scope: "food",
          teach: "menuClosed",
          reply: filled.reply,
          meals: filled.meals,
          mealSource: "new",
        });
      }
      const link = firstMenuLink(text);
      menuPage = link ? await fetchMenuPage(link) : { ok: false, reason: "bad-url" };
      if (!menuPage.ok) {
        const reply = teachBody("menuClosed");
        const filled = ensureFoodMeals([], coachFillArgs({ text, slot, mode, topic: "menuClosed", reply, day: earlyDay, profile: earlyProfile }));
        await persistServerCoach(env, user.id, body, {
          body: filled.reply,
          kind: filled.meals.length ? "cards" : "text",
          payload: { teach: "menuClosed", cards: persistMeals(filled.meals, slot), requestId },
          requestId,
        });
        return json({
          ok: true,
          scope: "food",
          teach: "menuClosed",
          reply: filled.reply,
          meals: filled.meals,
          mealSource: "new",
        });
      }
    }

    // A reused requestId is a second try at the same ask, not a cached
    // reply. The reserve allows one extra model call; we do not skip it.
    if (!isAdmin) {
      const limit = await checkAiLimit(env, user.id, {
        type: "coach",
        max: MAX_PER_DAY,
        requestId,
        busyMessage: COACH_BUSY_LINE,
        spentMessage: COACH_LIMIT_SPENT,
      });
      if (!limit.ok) {
        const crisis = isCrisisUrgent(text);
        const canFill = Boolean(earlyProfile) && wantsFoodFill(text, { mode, scope: verdict.scope, crisis });
        const customMeals = canFill
          ? await fetchCustomMeals(env, user.id, { authHeader })
          : [];
        const filled = canFill
          ? finishLocalPicks(
            ensureFoodMeals([], coachFillArgs({
              text,
              slot,
              mode,
              profile: earlyProfile,
              customMeals,
              day: earlyDay,
            })),
            { day: earlyDay, lead: leadLimitReply },
          )
          : { meals: [], reply: limit.message };
        await persistServerCoach(env, user.id, body, {
          body: filled.reply || limit.message,
          kind: filled.meals.length ? "cards" : "text",
          payload: {
            cards: persistMeals(filled.meals, slot),
            requestId,
            limited: true,
          },
          requestId,
        });
        return json(
          {
            error: "rate_limited",
            message: filled.reply || limit.message,
            reply: filled.reply || limit.message,
            meals: filled.meals,
            mealSource: filled.meals.length ? "new" : undefined,
            retry_after_seconds: limit.retryAfterSeconds,
          },
          429,
        );
      }
    }

    const { profile, macros, macrosStatus } = loadedSelf || {};
    if (!profile) {
      const message = "I couldn't load your file just now. Try again in a minute.";
      await persistServerCoach(env, user.id, body, {
        body: message,
        kind: "text",
        payload: { requestId },
        requestId,
      });
      return json({ error: "profile not found", message }, 404);
    }

    const customMeals = await fetchCustomMeals(env, user.id, { authHeader });
    const budget = sanitizeBudget(body.budget);
    const recentNames = parseRecent(body.recent);
    const day = sanitizeCoachContext({
      ...body.context,
      notLogging: Boolean(body.context?.notLogging) || isWontLogRefusal(text),
    });
    const workingNumbers = macrosStatus === "draft" || macrosStatus === "none";
    const args = { profile, macros, macrosStatus, budget, slot, customMeals, recentNames, day };

    let prompt;
    if (menuPage?.ok) {
      prompt = buildCoachMenuLinkPrompt({
        ...args,
        question: text,
        pageUrl: menuPage.url,
        pageText: menuPage.text,
      });
    } else if (mode === "menu") prompt = buildCoachMenuPrompt({ ...args, note: text });
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
      models: resolveCoachModels(env),
      maxTokens: images.length ? 8000 : 4000,
      temperature: 0.5,
      timeoutMs: images.length ? 30_000 : 25_000,
      attempts: 1,
      reasoning: { effort: "low", exclude: true },
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
      if (wantsFoodFill(text, { mode, scope: verdict.scope })) {
        const filled = finishLocalPicks(
          ensureFoodMeals([], coachFillArgs({ text, slot, mode, profile, customMeals, day })),
          { day, workingNumbers },
        );
        await persistServerCoach(env, user.id, body, {
          body: filled.reply,
          kind: filled.meals.length ? "cards" : "text",
          payload: {
            cards: persistMeals(filled.meals, slot),
            aside: verdict.aside || null,
            requestId,
          },
          requestId,
        });
        return json({
          ok: true,
          scope: "food",
          mode,
          reply: filled.reply,
          meals: filled.meals,
          mealSource: "new",
          aside: verdict.aside || null,
        });
      }
      await persistServerCoach(env, user.id, body, {
        body: COACH_BUSY_LINE,
        kind: "text",
        payload: { requestId },
        requestId,
      });
      return json(
        { error: "coach unavailable", message: COACH_BUSY_LINE },
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
      if (wantsFoodFill(text, { mode, scope: "food" })) {
        const filled = ensureFoodMeals([], coachFillArgs({ text, slot, mode, profile, customMeals, day }));
        let reply = filled.reply;
        if (day?.notLogging) reply = stripLogNag(reply);
        if (workingNumbers) reply = leadFineTuningReply(reply);
        await persistServerCoach(env, user.id, body, {
          body: reply,
          kind: filled.meals.length ? "cards" : "text",
          payload: {
            cards: persistMeals(filled.meals, slot),
            aside: verdict.aside || null,
            requestId,
          },
          requestId,
        });
        return json({
          ok: true,
          scope: "food",
          mode,
          reply,
          meals: filled.meals,
          mealSource: "new",
          aside: verdict.aside || null,
        });
      }
      await persistServerCoach(env, user.id, body, {
        body: COACH_BUSY_LINE,
        kind: "text",
        payload: { requestId },
        requestId,
      });
      return json(
        { error: "could not read that", message: COACH_BUSY_LINE },
        502,
      );
    }

    // Second layer: the model gets to hand a question back too. Re-check
    // the original ask for red flags — never answer a crisis with off-topic.
    let modelHandedOff = false;
    if (String(parsed.value?.scope || "").toLowerCase() === "callie") {
      const deflect = deflectModelHandoff(text);
      if (deflect !== "offTopic") {
        const noted = await appendCoachRefusal(env, user.id, { asked: text, scope: "urgent" });
        if (!noted.ok && !noted.skipped) {
          await logAiFailure(env, {
            userId: user.id,
            label: "coach",
            kind: "note",
            detail: noted.reason === "full"
              ? "client_summaries append full"
              : "client_summaries append failed",
          });
        } else if (noted.ok && Number(noted.trimmed) > 0) {
          await logAiFailure(env, {
            userId: user.id,
            label: "coach",
            kind: "note",
            detail: `client_summaries append trimmed:${noted.trimmed}`,
          });
        }
        if (noted.ok && !noted.skipped && !noted.capped && !noted.unchanged && deflect === "emergency") {
          await notifyCrisisEmail(env, { userId: user.id, asked: text });
        }
        const crisis = deflect === "emergency" || isCrisisUrgent(text);
        const filled = wantsFoodFill(text, { mode, scope: "food", crisis })
          ? ensureFoodMeals([], coachFillArgs({ text, slot, mode, profile, customMeals, safe: true }))
          : { meals: [] };
        await persistServerCoach(env, user.id, body, {
          body: "",
          kind: "deflect",
          payload: { deflect, cards: persistMeals(filled.meals, slot), requestId },
          requestId,
        });
        return json({
          ok: true,
          scope: "urgent",
          deflect,
          meals: filled.meals,
          mealSource: filled.meals.length ? "new" : undefined,
        });
      }
      if (!isMealAsk(text, { mode })) {
        await persistServerCoach(env, user.id, body, {
          body: "",
          kind: "deflect",
          payload: { deflect: "offTopic", requestId },
          requestId,
        });
        return json({ ok: true, scope: "off_topic", deflect: "offTopic", meals: [] });
      }
      modelHandedOff = true;
    }

    let reply = modelHandedOff ? "" : cleanReply(parsed.value?.reply);
    const orderMode = menuPage?.ok ? "menu" : mode;
    let meals = modelHandedOff ? [] : normalizeMeals(parsed.value, slot, orderMode, {
      lockSlot: Boolean(askedSlot),
      estimate: workingNumbers,
    });
    meals = filterCoachMeals(meals, {
      text,
      profile,
      skipNames: [...(day?.alreadySuggested || []), ...(day?.turnedDown || [])],
    });
    if (mode === "ask" && !menuPage?.ok) {
      meals = limitAskMeals(meals, { askedForOptions: askedForMealOptions(text) });
    }
    let teachTopic = null;
    const fill = coachFillArgs({ text, slot, mode: orderMode, profile, customMeals, day, reply });

    if (menuPage?.ok) {
      const kept = meals.filter((meal) => dishOnPage(meal.name, menuPage.text));
      if (!kept.length) {
        const filled = ensureFoodMeals([], {
          ...fill,
          mode: "menu",
          topic: "menuMiss",
          reply: teachBody("menuMiss"),
        });
        reply = filled.reply;
        meals = filled.meals;
        teachTopic = "menuMiss";
      } else {
        reply = menuFromPageCopy(kept.map((meal) => meal.name));
        meals = kept;
      }
    }

    const want = askedMealCount(text);
    if (want >= 2 && meals.length && meals.length < want) {
      meals = padCoachMeals(meals, { ...fill, count: want });
    }

    if (isLoggedMealPhoto(text, mode)) {
      const filled = ensureFoodMeals([], {
        ...fill,
        skipNames: [...(fill.skipNames || []), ...meals.map((meal) => meal.name)],
        reply: reply || "Here's a next one.",
      });
      meals = filled.meals;
      reply = filled.reply;
    } else if (wantsFoodFill(text, { mode, topic: teachTopic, scope: "food" }) && !meals.length) {
      const filled = ensureFoodMeals([], { ...fill, topic: teachTopic, reply });
      meals = filled.meals;
      reply = filled.reply;
    } else if (!reply && meals.length) {
      reply = fallbackMealReply(meals);
    }
    if (day?.notLogging) reply = stripLogNag(reply);
    if (workingNumbers) reply = leadFineTuningReply(reply);

    const mealSource = orderMode === "menu" ? "menu" : mode === "kitchen" ? "kitchen" : "new";
    const shownMeals = sizeMealsForPersist(meals, budget, slot, mealSource);
    await persistServerCoach(env, user.id, body, {
      body: reply,
      kind: shownMeals.length ? "cards" : "text",
      payload: {
        cards: shownMeals,
        aside: verdict.aside || null,
        teach: teachTopic,
        requestId,
      },
    });
    return json({
      ok: true,
      scope: "food",
      mode,
      ...(teachTopic ? { teach: teachTopic } : {}),
      reply,
      meals,
      mealSource,
      aside: verdict.aside || null,
    });
  } catch (e) {
    console.error("coach failed", e);
    return json({ error: "coach failed" }, 500);
  }
}

function persistMeals(meals, slot, source = "new") {
  return sizeMealsForPersist(meals, null, slot, source);
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

function cleanReply(raw) {
  const text = String(raw || "").trim().slice(0, 400);
  if (!text || replyHasJargon(text) || !replyIsClean(text)) return "";
  return text;
}

/** Cooking steps are a recipe. A menu card only keeps an order. */
function orderStepsOnly(steps) {
  const cook = /\b(preheat|bake|simmer|saut[eé]|chop|dice|oven|skillet|boil|whisk|stir|minutes|recipe)\b/i;
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step) => String(step || "").trim())
    .filter((step) => step && !cook.test(step))
    .slice(0, 6);
}

function normalizeMeals(parsed, fallbackSlot, mode, { lockSlot = false, estimate = false } = {}) {
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
    if ((mode === "menu" || estimate) && desc && !/estimate/i.test(desc)) {
      desc = `Rough estimate — ${desc}`.slice(0, 280);
    }

    out.push(sanitizePlanMeal({
      slot: lockSlot
        ? fallbackSlot
        : (SLOTS.has(String(m.slot || "").toLowerCase()) ? String(m.slot).toLowerCase() : fallbackSlot),
      name: String(m.name).slice(0, 120),
      basedOn: mode === "menu" ? null : (m.basedOn ? String(m.basedOn).slice(0, 120) : null),
      desc,
      ...macros,
      servings: Number(m.servings) === 0.5 || /half portion|\(half\)/i.test(String(m.name || ""))
        ? 0.5
        : 1,
      // A menu photo is an order, not a recipe we wrote. Ingredients here were
      // a made-up method for a dish we may not have read.
      ingredients: mode === "menu" ? [] : m.ingredients,
      batch: null,
      steps: mode === "menu" ? orderStepsOnly(m.steps) : m.steps,
    }));
  }
  return out;
}
