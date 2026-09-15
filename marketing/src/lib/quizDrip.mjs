/**
 * Track A — quiz submitted, no account (marketing_leads, no profiles row).
 * Immediate ranges email is #1 (quiz_ranges). Follow-ups: +2d, then last
 * at +6d or Wed Aug 26 PT (whichever first). Never send last on/after Aug 27 PT.
 * quiz_drip_2d is skipped for leftover leads created before Whitney
 * (2026-08-30T20:42:00.000Z). Quizzes at/after that stay on live Track A.
 * Pregnancy gets one soft +3d note. Plant-based gets no follow-up.
 *
 * Track B — signed up, unpaid — is finish-joining only. A profiles row
 * for the email stops this drip immediately. Do not merge the tracks.
 */

import {
  isLastUnpaidSalesDayPt,
  isLastQuizSalesWindowOpenPt,
  isOnOrAfterDoorsClosePt,
  lastQuizSalesOpenMs,
} from "./cohortEmailWindow.mjs";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Last quiz sales email: +6 days, or Aug 26 PT if that comes first. */
export const QUIZ_LAST_MIN_AGE_MS = 6 * DAY_MS;
/** Recent leads whose #1 send was not logged can still enter the drip. */
export const ANCHOR_FALLBACK_MS = 8 * DAY_MS;

export const QUIZ_RANGES_TYPE = "quiz_ranges";
export const QUIZ_DRIP_2D = "quiz_drip_2d";
export const QUIZ_DRIP_7D = "quiz_drip_7d";
export const QUIZ_PREGNANCY_NOTE = "quiz_pregnancy_note";
/** Hold the last sales email. Flip to true to stop cron from sending it. */
export const QUIZ_DRIP_7D_PAUSED = false;
/** Whitney's quiz time (Sun Aug 30, 1:42pm PT). Leftover 51 created before this skip +2d. */
export const QUIZ_DRIP_2D_FREEZE_CUTOFF = "2026-08-30T20:42:00.000Z";
export const QUIZ_DRIP_2D_FREEZE_CUTOFF_MS = Date.parse(QUIZ_DRIP_2D_FREEZE_CUTOFF);

/** True when a marketing lead predates the leftover freeze and must not get quiz_drip_2d. */
export function isFrozenLeftoverQuizLead(createdAt) {
  const created = typeof createdAt === "number"
    ? createdAt
    : Date.parse(createdAt);
  return Number.isFinite(created) && created < QUIZ_DRIP_2D_FREEZE_CUTOFF_MS;
}

export const QUIZ_DRIP_SALES_TYPES = [QUIZ_DRIP_2D, QUIZ_DRIP_7D];
export const QUIZ_DRIP_ALL_TYPES = [
  QUIZ_RANGES_TYPE,
  ...QUIZ_DRIP_SALES_TYPES,
  QUIZ_PREGNANCY_NOTE,
];

export const QUIZ_SALES_SEGMENTS = new Set(["main", "early_pp_nurture"]);
export const QUIZ_NO_SALES_SEGMENTS = new Set([
  "pregnancy_nurture",
  "waitlist_plantbased",
]);

const ACCOUNT_EVENT_TYPES = new Set([
  "welcome",
  "finish_joining_1h",
  "finish_joining_24h",
  "finish_joining_close",
]);

export function isPaidProfile(profile) {
  if (!profile) return false;
  if (profile.paid === true) return true;
  if (profile.paid_at) return true;
  return false;
}

export function quizDripAnchorMs({ leadCreatedAt, quizRangesAt, now }) {
  if (Number.isFinite(quizRangesAt)) return quizRangesAt;
  const created = typeof leadCreatedAt === "number"
    ? leadCreatedAt
    : Date.parse(leadCreatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(now)) return null;
  if (now - created <= ANCHOR_FALLBACK_MS) return created;
  return null;
}

export function quizLastSalesDue({ ageMs, now } = {}) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0) return false;
  if (!Number.isFinite(now)) return false;
  if (isOnOrAfterDoorsClosePt(now)) return false;
  if (!isLastQuizSalesWindowOpenPt(now)) return false;
  if (age >= QUIZ_LAST_MIN_AGE_MS) return true;
  if (isLastUnpaidSalesDayPt(now)) return true;
  return false;
}

/**
 * Prefer the latest due step (same pattern as finish-joining).
 * Missed earlier steps are skipped so a late cron does not dump mid+last at once.
 */
export function pickDueQuizDripStep({ ageMs, sentTypes, segment, now } = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  const seg = String(segment || "");
  const age = Number(ageMs);

  if (!Number.isFinite(age) || age < 0) return null;

  if (seg === "waitlist_plantbased") return null;

  if (seg === "pregnancy_nurture") {
    if (age >= 3 * DAY_MS && !sent.has(QUIZ_PREGNANCY_NOTE)) {
      return QUIZ_PREGNANCY_NOTE;
    }
    return null;
  }

  if (!QUIZ_SALES_SEGMENTS.has(seg)) return null;

  const lastDue = quizLastSalesDue({ ageMs: age, now });
  if (lastDue && !sent.has(QUIZ_DRIP_7D)) {
    // Do not fall through to +2d on the last-day window.
    if (QUIZ_DRIP_7D_PAUSED) return null;
    return QUIZ_DRIP_7D;
  }
  if (
    age >= 2 * DAY_MS
    && !lastDue
    && !sent.has(QUIZ_DRIP_2D)
    && !sent.has(QUIZ_DRIP_7D)
  ) {
    return QUIZ_DRIP_2D;
  }
  return null;
}

export function decideQuizDripAction({
  now,
  lead,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  quizRangesAt = null,
} = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  const segment = String(lead?.segment || "");

  if (unsubscribed) return { action: "skip", reason: "unsubscribed" };
  if (isPaidProfile(profile)) return { action: "skip", reason: "paid" };
  if (sent.has("welcome")) return { action: "skip", reason: "paid" };
  // Track B: any profiles row means finish-joining owns this email.
  if (profile) return { action: "skip", reason: "has_profile" };
  if (
    sent.has("finish_joining_1h")
    || sent.has("finish_joining_24h")
    || sent.has("finish_joining_close")
  ) {
    return { action: "skip", reason: "has_profile" };
  }
  if (segment === "waitlist_plantbased") {
    return { action: "skip", reason: "waitlist_plantbased" };
  }

  const anchor = quizDripAnchorMs({
    leadCreatedAt: lead?.created_at,
    quizRangesAt,
    now,
  });
  if (anchor == null) return { action: "skip", reason: "no_anchor" };

  const ageMs = now - anchor;
  const step = pickDueQuizDripStep({ ageMs, sentTypes: sent, segment, now });
  if (!step) return { action: "skip", reason: "not_due" };
  if (sent.has(step)) return { action: "skip", reason: "already_sent" };
  if (step === QUIZ_DRIP_2D && isFrozenLeftoverQuizLead(lead?.created_at)) {
    return { action: "skip", reason: "frozen_leftover" };
  }

  return { action: "send", step, ageMs, reason: step };
}

export function indexEmailEvents(rows) {
  const byEmail = new Map();
  for (const row of rows || []) {
    const email = String(row.to_email || "").trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, { types: new Set(), quizRangesAt: null });
    }
    const entry = byEmail.get(email);
    const type = String(row.email_type || "");
    if (type) entry.types.add(type);
    if (type === QUIZ_RANGES_TYPE) {
      const at = Date.parse(row.created_at);
      if (Number.isFinite(at)) {
        if (entry.quizRangesAt == null || at < entry.quizRangesAt) {
          entry.quizRangesAt = at;
        }
      }
    }
  }
  return byEmail;
}

export function indexProfilesByEmail(profiles) {
  const map = new Map();
  for (const p of profiles || []) {
    const email = String(p.email || "").trim().toLowerCase();
    if (!email) continue;
    const prev = map.get(email);
    if (!prev || isPaidProfile(p)) map.set(email, p);
  }
  return map;
}

export function planQuizLeadSends({
  now,
  leads,
  profileByEmail,
  eventsByEmail,
  unsubscribedEmails,
} = {}) {
  const plans = [];
  const skipped = {};
  const bump = (reason) => {
    skipped[reason] = (skipped[reason] || 0) + 1;
  };

  for (const lead of leads || []) {
    const email = String(lead.email || "").trim().toLowerCase();
    if (!email) {
      bump("no_email");
      continue;
    }
    const events = eventsByEmail?.get(email) || { types: new Set(), quizRangesAt: null };
    const decision = decideQuizDripAction({
      now,
      lead,
      profile: profileByEmail?.get(email) || null,
      unsubscribed: Boolean(unsubscribedEmails?.has(email)),
      sentTypes: events.types,
      quizRangesAt: events.quizRangesAt,
    });
    if (decision.action !== "send") {
      bump(decision.reason || "skipped");
      continue;
    }
    plans.push({ email, lead, step: decision.step, ageMs: decision.ageMs });
  }

  return { plans, skipped };
}

export function quizCronEventTypes() {
  return [
    ...QUIZ_DRIP_ALL_TYPES,
    ...ACCOUNT_EVENT_TYPES,
  ];
}

function quizDripStopReason({
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  segment = "",
} = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  if (unsubscribed) return "unsubscribed";
  if (isPaidProfile(profile)) return "paid";
  if (sent.has("welcome")) return "paid";
  if (profile) return "has_profile";
  if (
    sent.has("finish_joining_1h")
    || sent.has("finish_joining_24h")
    || sent.has("finish_joining_close")
  ) {
    return "has_profile";
  }
  if (segment === "waitlist_plantbased") return "waitlist_plantbased";
  return null;
}

function quizProbeTimes({ now, anchor, segment }) {
  const times = [now];
  if (segment === "pregnancy_nurture") {
    times.push(anchor + 3 * DAY_MS);
  } else if (QUIZ_SALES_SEGMENTS.has(segment)) {
    times.push(anchor + 2 * DAY_MS);
    times.push(anchor + QUIZ_LAST_MIN_AGE_MS);
    const lastStart = lastQuizSalesOpenMs();
    if (Number.isFinite(lastStart)) times.push(lastStart);
  }
  return [...new Set(times.filter((t) => Number.isFinite(t) && t >= now))].sort((a, b) => a - b);
}

/**
 * Remaining Track A drips cron still owes this quiz-only lead, with expected times.
 * Uses pickDueQuizDripStep at now and at each upcoming due instant — not a second calendar.
 */
export function planRemainingQuizDrips({
  now,
  lead,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  quizRangesAt = null,
} = {}) {
  const sent = sentTypes instanceof Set ? new Set(sentTypes) : new Set(sentTypes || []);
  const segment = String(lead?.segment || "");
  const stopReason = quizDripStopReason({ profile, unsubscribed, sentTypes: sent, segment });
  if (stopReason) return { remaining: [], stopReason };

  const anchor = quizDripAnchorMs({
    leadCreatedAt: lead?.created_at,
    quizRangesAt,
    now,
  });
  if (anchor == null) return { remaining: [], stopReason: "no_anchor" };

  const remaining = [];
  for (const at of quizProbeTimes({ now, anchor, segment })) {
    const step = pickDueQuizDripStep({
      ageMs: at - anchor,
      sentTypes: sent,
      segment,
      now: at,
    });
    if (!step || sent.has(step)) continue;
    remaining.push({
      emailType: step,
      atMs: at,
      due: at <= now,
    });
    sent.add(step);
  }
  return { remaining, stopReason: remaining.length ? null : "not_due" };
}
