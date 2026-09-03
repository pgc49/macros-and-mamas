/**
 * Shared planner+send loop for quiz_opening_week_1h (cron + gated backfill).
 */

import { fetchUnsubscribedEmails } from "./emailUnsubscribe.mjs";
import { indexEmailEvents, indexProfilesByEmail } from "./quizDrip.mjs";
import {
  QUIZ_OPENING_WEEK_1H,
  openingWeekEventTypes,
  parseBackfillEmails,
  planQuizOpeningWeekSends,
} from "./quizOpeningWeek1h.mjs";
import { sendQuizOpeningWeek1hEmail } from "./quizOpeningWeek1hSend.js";

export async function runQuizOpeningWeek1h({
  env,
  base,
  key,
  now,
  profiles,
  mode = "cron",
  allowlist = null,
  dryRun = false,
  sendFn = sendQuizOpeningWeek1hEmail,
} = {}) {
  const sent = {
    [QUIZ_OPENING_WEEK_1H]: 0,
    skipped: 0,
    errors: 0,
    planned: 0,
    skippedReasons: {},
  };

  const unsub = await fetchUnsubscribedEmails(env);
  if (!unsub.ok) {
    console.error("quiz opening week skipped: unsubscribe list unavailable");
    sent.errors += 1;
    return sent;
  }

  const [leads, eventRows] = await Promise.all([
    fetchMarketingLeads(base, key),
    fetchOpeningWeekEvents(base, key),
  ]);

  const { plans, skipped } = planQuizOpeningWeekSends({
    now,
    leads,
    profileByEmail: indexProfilesByEmail(profiles),
    eventsByEmail: indexEmailEvents(eventRows),
    unsubscribedEmails: unsub.emails,
    mode,
    allowlist,
  });
  sent.skippedReasons = skipped;
  sent.skipped += Object.values(skipped).reduce((n, v) => n + v, 0);
  sent.planned = plans.length;
  sent.plans = plans.map((plan) => ({
    cta: plan.cta,
    hasProfile: plan.hasProfile,
    ageMs: plan.ageMs,
  }));

  if (dryRun) return sent;

  for (const plan of plans) {
    try {
      const profile = indexProfilesByEmail(profiles).get(plan.email) || null;
      const r = await sendFn(env, {
        email: plan.email,
        firstName: plan.lead.first_name,
        lead: plan.lead,
        profile,
        source: mode === "backfill" ? "quiz-opening-week-1h-backfill" : "email-cron",
      });
      if (r?.ok) sent[QUIZ_OPENING_WEEK_1H] += 1;
      else if (r?.skipped) sent.skipped += 1;
      else sent.errors += 1;
    } catch (e) {
      console.error("quiz opening week send failed", plan.lead?.id || "lead", e);
      sent.errors += 1;
    }
  }

  return sent;
}

export function backfillAllowlistFromBody(body) {
  return parseBackfillEmails(body?.emails);
}

async function fetchMarketingLeads(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/marketing_leads?select=id,email,first_name,segment,created_at&order=created_at.desc&limit=1000`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("marketing_leads fetch failed", resp.status, await resp.text());
    return [];
  }
  return resp.json().catch(() => []);
}

async function fetchOpeningWeekEvents(base, key) {
  const types = openingWeekEventTypes();
  const filter = types.map((t) => `"${t}"`).join(",");
  const resp = await fetch(
    `${base}/rest/v1/email_events?select=to_email,email_type,created_at,status&email_type=in.(${filter})&status=eq.sent`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("opening week email_events fetch failed", resp.status, await resp.text());
    return [];
  }
  return resp.json().catch(() => []);
}
