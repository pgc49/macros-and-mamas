/* ==================================================================
   /functions/api/email-cron.js — hourly lifecycle nudges (#1, #3)
   + quiz-lead drip (marketing_leads, no profile row)
   ==================================================================
   Auth: Authorization: Bearer $CRON_SECRET  (Cloudflare secret)
   Or invoke via GitHub Actions schedule (no local CLI needed).

   #1 Finish joining: unpaid, created ≥1h / ≥24h, plus one Aug 26 PT last note
   #3 Intake reminder: paid, no macros, paid_at ≥24h / ≥72h (max two)
   Track A quiz drip: marketing_leads with no profile, +2d / last (+6d or Aug 26 PT)
   Track B finish-joining: unpaid profiles only — do not merge the tracks
   ================================================================== */

import {
  loadUserContact,
  sendFinishJoiningEmail,
  sendIntakeReminderEmail,
} from "../_shared/supabaseEmail.js";
import {
  fetchUnsubscribedEmails,
  normalizeEmail,
} from "../_shared/emailUnsubscribe.mjs";
import {
  indexEmailEvents,
  indexProfilesByEmail,
  planQuizLeadSends,
  quizCronEventTypes,
} from "../_shared/quizDrip.mjs";
import {
  decideFinishJoiningAction,
  finishJoiningVariant,
} from "../_shared/finishJoining.mjs";
import { emailHasQuizUnlock } from "../_shared/pricing.js";
import { sendQuizDripEmail } from "../_shared/quizDripSend.js";

const HOUR = 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  try {
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);

    const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return json({ error: "missing supabase config" }, 503);

    const now = Date.now();
    const sent = {
      finish_joining_1h: 0,
      finish_joining_24h: 0,
      finish_joining_close: 0,
      intake_reminder_24h: 0,
      intake_reminder_72h: 0,
      quiz_drip_2d: 0,
      quiz_drip_7d: 0,
      quiz_pregnancy_note: 0,
      skipped: 0,
      errors: 0,
    };

    const profiles = await fetchAllProfiles(base, key);
    const macrosIds = await fetchMacroProfileIds(base, key);
    const already = await fetchSentTypes(base, key);
    const unsub = await fetchUnsubscribedEmails(env);
    if (!unsub.ok) {
      console.error("email-cron finish-joining skipped: unsubscribe list unavailable");
      sent.errors += 1;
    }

    for (const p of profiles) {
      if (p.role === "admin" || p.refunded) continue;

      const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
      const paidMs = p.paid_at ? Date.parse(p.paid_at) : NaN;
      const types = already.get(p.id) || new Set();

      try {
        // Track B — unpaid abandoned checkout (skip new accounts while enrollment is closed).
        // Quiz-only leads with no profiles row never enter this loop.
        if (!p.paid && Number.isFinite(createdMs) && unsub.ok) {
          const decision = decideFinishJoiningAction({
            now,
            profile: p,
            unsubscribed: false,
            sentTypes: types,
            nudgeAllowed: canNudgeUnpaid(env, createdMs),
          });
          if (decision.action === "send") {
            const contact = await loadUserContact(env, p.id);
            const email = contact.email;
            if (!email) {
              sent.skipped += 1;
            } else if (unsub.emails.has(normalizeEmail(email))) {
              sent.skipped += 1;
            } else {
              const quizUnlock = await emailHasQuizUnlock(env, email);
              const r = await sendFinishJoiningEmail(env, {
                email,
                name: contact.name || p.name,
                userId: p.id,
                variant: finishJoiningVariant(decision.step),
                quizUnlock,
              });
              if (r?.ok && sent[decision.step] != null) sent[decision.step] += 1;
              else if (r?.skipped) sent.skipped += 1;
              else sent.errors += 1;
            }
          }
        }

        // #3 — paid, intake incomplete
        if (p.paid && !macrosIds.has(p.id) && Number.isFinite(paidMs)) {
          const age = now - paidMs;
          if (age >= 72 * HOUR && !types.has("intake_reminder_72h")) {
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendIntakeReminderEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "72h",
              });
              if (r?.ok) sent.intake_reminder_72h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          } else if (
            age >= 24 * HOUR
            && age < 72 * HOUR
            && !types.has("intake_reminder_24h")
            && !types.has("intake_reminder_72h")
          ) {
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendIntakeReminderEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "24h",
              });
              if (r?.ok) sent.intake_reminder_24h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          }
        }
      } catch (e) {
        console.error("email-cron profile failed", p.id, e);
        sent.errors += 1;
      }
    }

    const drip = await runQuizLeadDrip({ env, base, key, now, profiles });
    sent.quiz_drip_2d += drip.quiz_drip_2d;
    sent.quiz_drip_7d += drip.quiz_drip_7d;
    sent.quiz_pregnancy_note += drip.quiz_pregnancy_note;
    sent.skipped += drip.skipped;
    sent.errors += drip.errors;

    return json({ ok: true, sent }, 200);
  } catch (e) {
    console.error("email-cron failed", e);
    return json({ error: "cron failed" }, 500);
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

/** While closed, only nudge unpaid accounts created before the cutoff. */
function canNudgeUnpaid(env, createdMs) {
  const open = String(env.ENROLLMENT_OPEN || "").toLowerCase() === "true";
  if (open) return true;
  const closedAt = env.ENROLLMENT_CLOSED_AT || "2026-07-26T02:00:00.000Z";
  const closed = Date.parse(closedAt);
  return Number.isFinite(createdMs) && Number.isFinite(closed) && createdMs < closed;
}

async function fetchAllProfiles(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,name,email,role,paid,refunded,created_at,paid_at&order=created_at.asc`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  if (!resp.ok) throw new Error(`profiles ${resp.status}`);
  return resp.json();
}

async function fetchMacroProfileIds(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/macros?select=profile_id`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  if (!resp.ok) throw new Error(`macros ${resp.status}`);
  const rows = await resp.json();
  return new Set((rows || []).map((r) => r.profile_id));
}

async function fetchSentTypes(base, key) {
  const types = [
    "finish_joining_1h",
    "finish_joining_24h",
    "finish_joining_close",
    "intake_reminder_24h",
    "intake_reminder_72h",
  ];
  const filter = types.map((t) => `"${t}"`).join(",");
  const resp = await fetch(
    `${base}/rest/v1/email_events?select=profile_id,email_type,status&email_type=in.(${filter})&status=eq.sent`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  const map = new Map();
  if (!resp.ok) {
    console.error("email_events fetch failed", resp.status, await resp.text());
    return map;
  }
  const rows = await resp.json();
  for (const r of rows || []) {
    if (!r.profile_id) continue;
    if (!map.has(r.profile_id)) map.set(r.profile_id, new Set());
    map.get(r.profile_id).add(r.email_type);
  }
  return map;
}

export async function runQuizLeadDrip({ env, base, key, now, profiles }) {
  const sent = {
    quiz_drip_2d: 0,
    quiz_drip_7d: 0,
    quiz_pregnancy_note: 0,
    skipped: 0,
    errors: 0,
  };

  const unsub = await fetchUnsubscribedEmails(env);
  if (!unsub.ok) {
    console.error("email-cron quiz drip skipped: unsubscribe list unavailable");
    sent.errors += 1;
    return sent;
  }

  const [leads, eventRows] = await Promise.all([
    fetchMarketingLeads(base, key),
    fetchQuizEmailEvents(base, key),
  ]);

  const { plans, skipped } = planQuizLeadSends({
    now,
    leads,
    profileByEmail: indexProfilesByEmail(profiles),
    eventsByEmail: indexEmailEvents(eventRows),
    unsubscribedEmails: unsub.emails,
  });
  sent.skipped += Object.values(skipped).reduce((n, v) => n + v, 0);

  for (const plan of plans) {
    try {
      const r = await sendQuizDripEmail(env, {
        email: plan.email,
        firstName: plan.lead.first_name,
        lead: plan.lead,
        step: plan.step,
      });
      if (r?.ok && sent[plan.step] != null) sent[plan.step] += 1;
      else if (r?.skipped) sent.skipped += 1;
      else sent.errors += 1;
    } catch (e) {
      console.error("email-cron quiz drip failed", plan.email, e);
      sent.errors += 1;
    }
  }

  return sent;
}

async function fetchMarketingLeads(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/marketing_leads?select=id,email,first_name,segment,created_at,protein_low_g,protein_high_g,carbs_low_g,carbs_high_g,fat_low_g,fat_high_g,calories_low,calories_high&order=created_at.desc&limit=1000`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("marketing_leads fetch failed", resp.status, await resp.text());
    return [];
  }
  return resp.json().catch(() => []);
}

async function fetchQuizEmailEvents(base, key) {
  const types = quizCronEventTypes();
  const filter = types.map((t) => `"${t}"`).join(",");
  const resp = await fetch(
    `${base}/rest/v1/email_events?select=to_email,email_type,created_at,status&email_type=in.(${filter})&status=eq.sent`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("quiz email_events fetch failed", resp.status, await resp.text());
    return [];
  }
  return resp.json().catch(() => []);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
