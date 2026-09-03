/**
 * Track A opening-week follow-up — distinct from quiz_drip_2d.
 * Clock: first quiz_ranges send. Due at +1 hour.
 * Automatic cron has a recovery lookback so a missed hourly tick retries
 * without blasting leftover leads from before this event existed.
 * Account-unpaid stays eligible (finish-checkout CTA). Paid / unsub stop.
 */

import { isPaidProfile, QUIZ_SALES_SEGMENTS } from "./quizDrip.mjs";

export const QUIZ_OPENING_WEEK_1H = "quiz_opening_week_1h";
export const QUIZ_RANGES_TYPE = "quiz_ranges";
export const HOUR_MS = 60 * 60 * 1000;
export const QUIZ_OPENING_WEEK_1H_MIN_AGE_MS = 1 * HOUR_MS;
/** Retry window after the +1h due instant. Hourly cron can miss a few ticks. */
export const QUIZ_OPENING_WEEK_1H_LOOKBACK_MS = 8 * HOUR_MS;
export const BACKFILL_CONFIRM = "SEND_QUIZ_OPENING_WEEK_1H";
export const BACKFILL_MAX_EMAILS = 5;

export function normalizeLeadEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function openingWeekIdempotencyKey(entityId) {
  const id = String(entityId || "").trim();
  if (!id) return "";
  return `${QUIZ_OPENING_WEEK_1H}/${id}`.slice(0, 256);
}

export function openingWeekEntityId({ lead, email } = {}) {
  const leadId = String(lead?.id || "").trim();
  if (leadId) return leadId;
  return normalizeLeadEmail(email);
}

export function quizRangesAtFromEvents(events) {
  let earliest = null;
  for (const event of events || []) {
    if (String(event?.email_type || "") !== QUIZ_RANGES_TYPE) continue;
    if (String(event?.status || "sent") !== "sent") continue;
    const at = Date.parse(event?.created_at);
    if (!Number.isFinite(at)) continue;
    if (earliest == null || at < earliest) earliest = at;
  }
  return earliest;
}

export function sentOpeningWeek(sentTypes) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  return sent.has(QUIZ_OPENING_WEEK_1H);
}

function salesSegment(lead) {
  return String(lead?.segment || "");
}

function stopReason({
  lead,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
} = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  const segment = salesSegment(lead);

  if (unsubscribed) return "unsubscribed";
  if (isPaidProfile(profile)) return "paid";
  if (profile?.comp) return "paid";
  if (sent.has("welcome")) return "paid";
  if (segment === "waitlist_plantbased") return "waitlist_plantbased";
  if (segment === "pregnancy_nurture") return "not_sales_segment";
  if (!QUIZ_SALES_SEGMENTS.has(segment)) return "not_sales_segment";
  if (sent.has(QUIZ_OPENING_WEEK_1H)) return "already_sent";
  return null;
}

export function openingWeekCtaKind(profile) {
  if (profile && !isPaidProfile(profile) && !profile.comp) return "checkout";
  return "join";
}

/**
 * @param {{ mode?: "cron" | "backfill" }} opts
 * cron: +1h due, then lookback only (no leftover blast).
 * backfill: +1h due, no upper lookback — still re-checks paid/unsub/sent.
 */
export function decideQuizOpeningWeek1h({
  now,
  lead,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  quizRangesAt = null,
  mode = "cron",
} = {}) {
  const stopped = stopReason({ lead, profile, unsubscribed, sentTypes });
  if (stopped) return { action: "skip", reason: stopped, cta: openingWeekCtaKind(profile) };

  const anchor = Number.isFinite(quizRangesAt) ? quizRangesAt : null;
  if (anchor == null) return { action: "skip", reason: "no_ranges", cta: openingWeekCtaKind(profile) };

  const ageMs = now - anchor;
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { action: "skip", reason: "not_due", cta: openingWeekCtaKind(profile), ageMs };
  }
  if (ageMs < QUIZ_OPENING_WEEK_1H_MIN_AGE_MS) {
    return { action: "skip", reason: "not_due", cta: openingWeekCtaKind(profile), ageMs, atMs: anchor + QUIZ_OPENING_WEEK_1H_MIN_AGE_MS };
  }
  if (
    mode !== "backfill"
    && ageMs > QUIZ_OPENING_WEEK_1H_MIN_AGE_MS + QUIZ_OPENING_WEEK_1H_LOOKBACK_MS
  ) {
    return { action: "skip", reason: "outside_lookback", cta: openingWeekCtaKind(profile), ageMs };
  }

  return {
    action: "send",
    step: QUIZ_OPENING_WEEK_1H,
    reason: QUIZ_OPENING_WEEK_1H,
    cta: openingWeekCtaKind(profile),
    ageMs,
    atMs: anchor + QUIZ_OPENING_WEEK_1H_MIN_AGE_MS,
    hasProfile: Boolean(profile),
  };
}

export function planQuizOpeningWeekSends({
  now,
  leads,
  profileByEmail,
  eventsByEmail,
  unsubscribedEmails,
  mode = "cron",
  allowlist = null,
} = {}) {
  const plans = [];
  const skipped = {};
  const bump = (reason) => {
    skipped[reason] = (skipped[reason] || 0) + 1;
  };
  const allow = allowlist instanceof Set
    ? allowlist
    : Array.isArray(allowlist)
      ? new Set([...allowlist].map(normalizeLeadEmail).filter(Boolean))
      : null;

  for (const lead of leads || []) {
    const email = normalizeLeadEmail(lead.email);
    if (!email) {
      bump("no_email");
      continue;
    }
    if (allow && !allow.has(email)) {
      bump("not_allowlisted");
      continue;
    }
    const events = eventsByEmail?.get(email) || { types: new Set(), quizRangesAt: null };
    const decision = decideQuizOpeningWeek1h({
      now,
      lead,
      profile: profileByEmail?.get(email) || null,
      unsubscribed: Boolean(unsubscribedEmails?.has(email)),
      sentTypes: events.types,
      quizRangesAt: events.quizRangesAt,
      mode,
    });
    if (decision.action !== "send") {
      bump(decision.reason || "skipped");
      continue;
    }
    plans.push({
      email,
      lead,
      step: QUIZ_OPENING_WEEK_1H,
      cta: decision.cta,
      ageMs: decision.ageMs,
      hasProfile: decision.hasProfile,
    });
  }

  return { plans, skipped };
}

export function planRemainingOpeningWeek1h({
  now,
  lead,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  quizRangesAt = null,
} = {}) {
  const decision = decideQuizOpeningWeek1h({
    now,
    lead,
    profile,
    unsubscribed,
    sentTypes,
    quizRangesAt,
    mode: "cron",
  });
  if (decision.action === "send") {
    return {
      remaining: [{
        emailType: QUIZ_OPENING_WEEK_1H,
        atMs: decision.atMs,
        due: true,
      }],
      stopReason: null,
    };
  }
  if (decision.reason === "not_due" && Number.isFinite(decision.atMs)) {
    return {
      remaining: [{
        emailType: QUIZ_OPENING_WEEK_1H,
        atMs: decision.atMs,
        due: false,
      }],
      stopReason: null,
    };
  }
  return { remaining: [], stopReason: decision.reason || "not_due" };
}

export function parseBackfillEmails(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const emails = [];
  const seen = new Set();
  for (const value of list) {
    const email = normalizeLeadEmail(value);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= BACKFILL_MAX_EMAILS) break;
  }
  return emails;
}

export function backfillWillSend({ dryRun, confirm } = {}) {
  return dryRun === false && String(confirm || "") === BACKFILL_CONFIRM;
}

export function openingWeekEventTypes() {
  return [QUIZ_RANGES_TYPE, QUIZ_OPENING_WEEK_1H, "welcome"];
}
