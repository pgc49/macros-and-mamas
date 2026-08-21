/**
 * Track B — account created, still unpaid. Finish-joining only.
 * +1h / +24h, then one last note on Wed Aug 26 PT. Stop after that.
 * A profiles row already stopped Track A (quiz drip).
 */
import {
  isLastUnpaidSalesDayPt,
  isOnOrAfterDoorsClosePt,
  lastUnpaidSalesDayStartMs,
} from "./cohortEmailWindow.mjs";

export const HOUR_MS = 60 * 60 * 1000;
export const FINISH_JOINING_1H = "finish_joining_1h";
export const FINISH_JOINING_24H = "finish_joining_24h";
export const FINISH_JOINING_CLOSE = "finish_joining_close";

export const FINISH_JOINING_TYPES = [
  FINISH_JOINING_1H,
  FINISH_JOINING_24H,
  FINISH_JOINING_CLOSE,
];

export function finishJoiningVariant(step) {
  if (step === FINISH_JOINING_CLOSE) return "close";
  if (step === FINISH_JOINING_24H) return "24h";
  return "1h";
}

export function finishJoiningEmailType(variant) {
  if (variant === "close") return FINISH_JOINING_CLOSE;
  if (variant === "24h") return FINISH_JOINING_24H;
  return FINISH_JOINING_1H;
}

/**
 * Prefer the latest due step so a late cron does not dump 1h+24h+close.
 * Close is calendar-based (Wed Aug 26 PT) and never sends on or after Aug 27 PT.
 */
export function pickDueFinishJoiningStep({ ageMs, sentTypes, now } = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);
  const age = Number(ageMs);

  if (!Number.isFinite(age) || age < 0) return null;
  if (sent.has(FINISH_JOINING_CLOSE)) return null;

  const closeDue = Number.isFinite(now)
    && !isOnOrAfterDoorsClosePt(now)
    && isLastUnpaidSalesDayPt(now)
    && !sent.has(FINISH_JOINING_CLOSE);
  if (closeDue) return FINISH_JOINING_CLOSE;

  if (age >= 24 * HOUR_MS && !sent.has(FINISH_JOINING_24H)) {
    return FINISH_JOINING_24H;
  }
  if (
    age >= 1 * HOUR_MS
    && age < 24 * HOUR_MS
    && !sent.has(FINISH_JOINING_1H)
    && !sent.has(FINISH_JOINING_24H)
  ) {
    return FINISH_JOINING_1H;
  }
  return null;
}

export function decideFinishJoiningAction({
  now,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  nudgeAllowed = true,
} = {}) {
  const sent = sentTypes instanceof Set ? sentTypes : new Set(sentTypes || []);

  if (unsubscribed) return { action: "skip", reason: "unsubscribed" };
  if (!nudgeAllowed) return { action: "skip", reason: "enrollment_closed" };
  if (!profile) return { action: "skip", reason: "no_profile" };
  if (profile.role === "admin") return { action: "skip", reason: "admin" };
  if (profile.refunded) return { action: "skip", reason: "refunded" };
  if (profile.paid === true || profile.paid_at) return { action: "skip", reason: "paid" };

  const createdMs = profile.created_at ? Date.parse(profile.created_at) : NaN;
  if (!Number.isFinite(createdMs) || !Number.isFinite(now)) {
    return { action: "skip", reason: "no_anchor" };
  }

  const ageMs = now - createdMs;
  const step = pickDueFinishJoiningStep({ ageMs, sentTypes: sent, now });
  if (!step) return { action: "skip", reason: "not_due" };
  if (sent.has(step)) return { action: "skip", reason: "already_sent" };

  return { action: "send", step, ageMs, reason: step };
}

function finishJoiningProbeTimes({ now, createdMs }) {
  const times = [now, createdMs + HOUR_MS, createdMs + 24 * HOUR_MS];
  const lastStart = lastUnpaidSalesDayStartMs();
  if (Number.isFinite(lastStart)) times.push(lastStart);
  return [...new Set(times.filter((t) => Number.isFinite(t) && t >= now))].sort((a, b) => a - b);
}

/**
 * Remaining Track B drips cron still owes this unpaid profile, with expected times.
 * Uses pickDueFinishJoiningStep at now and at each upcoming due instant.
 */
export function planRemainingFinishJoining({
  now,
  profile = null,
  unsubscribed = false,
  sentTypes = new Set(),
  nudgeAllowed = true,
} = {}) {
  const sent = sentTypes instanceof Set ? new Set(sentTypes) : new Set(sentTypes || []);

  if (unsubscribed) return { remaining: [], stopReason: "unsubscribed" };
  if (!nudgeAllowed) return { remaining: [], stopReason: "enrollment_closed" };
  if (!profile) return { remaining: [], stopReason: "no_profile" };
  if (profile.role === "admin") return { remaining: [], stopReason: "admin" };
  if (profile.refunded) return { remaining: [], stopReason: "refunded" };
  if (profile.paid === true || profile.paid_at) return { remaining: [], stopReason: "paid" };

  const createdMs = profile.created_at ? Date.parse(profile.created_at) : NaN;
  if (!Number.isFinite(createdMs) || !Number.isFinite(now)) {
    return { remaining: [], stopReason: "no_anchor" };
  }

  const remaining = [];
  for (const at of finishJoiningProbeTimes({ now, createdMs })) {
    const step = pickDueFinishJoiningStep({
      ageMs: at - createdMs,
      sentTypes: sent,
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
