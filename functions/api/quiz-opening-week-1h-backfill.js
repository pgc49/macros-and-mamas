/* ==================================================================
   /functions/api/quiz-opening-week-1h-backfill.js
   One-time gated backfill for quiz_opening_week_1h.

   Auth: Authorization: Bearer $CRON_SECRET
   Default is dry-run. Live send requires:
     { dryRun: false, confirm: "SEND_QUIZ_OPENING_WEEK_1H", emails: [...] }
   Re-checks eligibility at invoke time. Do not call from hourly cron.
   ================================================================== */

import {
  BACKFILL_CONFIRM,
  QUIZ_OPENING_WEEK_1H,
  backfillWillSend,
} from "../_shared/quizOpeningWeek1h.mjs";
import { openingWeek1hPreviewText, openingWeek1hSubject } from "../_shared/quizOpeningWeek1hEmail.mjs";
import { backfillAllowlistFromBody, runQuizOpeningWeek1h } from "../_shared/quizOpeningWeek1hRun.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);

    const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return json({ error: "missing supabase config" }, 503);

    const body = await request.json().catch(() => ({}));
    const emails = backfillAllowlistFromBody(body);
    if (!emails.length) {
      return json({
        error: "emails allowlist required",
        event: QUIZ_OPENING_WEEK_1H,
        dryRun: true,
        confirmRequired: BACKFILL_CONFIRM,
      }, 400);
    }

    const willSend = backfillWillSend({
      dryRun: body.dryRun,
      confirm: body.confirm,
    });
    const dryRun = !willSend;

    const profiles = await fetchProfiles(base, key);
    const sent = await runQuizOpeningWeek1h({
      env,
      base,
      key,
      now: Date.now(),
      profiles,
      mode: "backfill",
      allowlist: emails,
      dryRun,
    });

    return json({
      ok: true,
      event: QUIZ_OPENING_WEEK_1H,
      dryRun,
      wouldSend: dryRun ? sent.planned : undefined,
      sent: dryRun ? 0 : sent[QUIZ_OPENING_WEEK_1H],
      planned: sent.planned,
      skipped: sent.skipped,
      skippedReasons: sent.skippedReasons,
      errors: sent.errors,
      plans: sent.plans,
      subject: openingWeek1hSubject("Mama"),
      preview: openingWeek1hPreviewText("Mama"),
      confirmRequired: dryRun ? BACKFILL_CONFIRM : undefined,
    }, 200);
  } catch (e) {
    console.error("quiz opening week backfill failed", e);
    return json({ error: "backfill failed" }, 500);
  }
}

function authorize(request, env) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not set");
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return timingSafeEqual(token, secret);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function fetchProfiles(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,name,email,role,paid,refunded,comp,created_at,paid_at&order=created_at.asc`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) throw new Error(`profiles ${resp.status}`);
  return resp.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
