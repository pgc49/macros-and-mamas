/**
 * Read-only upcoming drips for a lead. Same decisions cron uses —
 * no second schedule store.
 */
import {
  planRemainingFinishJoining,
} from "../../functions/_shared/finishJoining.mjs";
import {
  isPaidProfile,
  planRemainingQuizDrips,
  QUIZ_RANGES_TYPE,
} from "../../functions/_shared/quizDrip.mjs";
import { planRemainingOpeningWeek1h } from "../../functions/_shared/quizOpeningWeek1h.mjs";
import { canFinishPaying } from "../config";
import { emailTypeLabel, normalizeEmailAddress } from "./emailLog";

/** Cron only treats status=sent as done; failed stays scheduled. */
export function sentTypesFromEvents(events) {
  const types = new Set();
  for (const event of events || []) {
    const status = String(event?.status || "sent");
    if (status !== "sent") continue;
    const type = String(event?.email_type || "").trim();
    if (type) types.add(type);
  }
  return types;
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

function leadProfile(lead) {
  if (!lead?.profileId && lead?.funnelStatus !== "signed_up_unpaid" && lead?.funnelStatus !== "paid") {
    return null;
  }
  if (!lead?.profileId && !lead?.profileCreatedAt) return null;
  return {
    id: lead.profileId || null,
    email: lead.email || null,
    paid: lead.funnelStatus === "paid",
    paid_at: lead.profilePaidAt || null,
    refunded: Boolean(lead.profileRefunded),
    role: lead.profileRole || "client",
    created_at: lead.profileCreatedAt || null,
  };
}

export function formatDripWhen(item, now = Date.now()) {
  if (!item) return "";
  if (item.due || (Number.isFinite(item.atMs) && item.atMs <= now)) return "Due now";
  if (!Number.isFinite(item.atMs)) return "";
  try {
    return new Date(item.atMs).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function nextDripLine(plan, now = Date.now()) {
  const next = plan?.remaining?.[0];
  if (!next) return "No more drips scheduled";
  const when = formatDripWhen(next, now);
  const name = emailTypeLabel({ email_type: next.emailType });
  return when ? `Next: ${name} · ${when}` : `Next: ${name}`;
}

export function dripStopCopy(stopReason) {
  if (stopReason === "paid") return "She already paid — no conversion drips.";
  if (stopReason === "unsubscribed") return "Unsubscribed.";
  if (stopReason === "waitlist_plantbased") return "Plant-based — no sales drip.";
  if (stopReason === "enrollment_closed") return "Enrollment is closed — no more unpaid nudges.";
  return "";
}

export function planLeadDrips({
  lead,
  events = [],
  unsubscribed = false,
  now = Date.now(),
  enrollmentOpen,
} = {}) {
  const sentTypes = sentTypesFromEvents(events);
  const profile = leadProfile(lead);
  const email = normalizeEmailAddress(lead?.email);

  if (unsubscribed) {
    return { track: "stopped", remaining: [], stopReason: "unsubscribed", email };
  }
  if (lead?.funnelStatus === "paid" || isPaidProfile(profile)) {
    return { track: "paid", remaining: [], stopReason: "paid", email };
  }

  const quizRangesAt = quizRangesAtFromEvents(events);
  const openingWeek = planRemainingOpeningWeek1h({
    now,
    lead,
    profile,
    unsubscribed: false,
    sentTypes,
    quizRangesAt,
  });

  if (profile) {
    const nudgeAllowed = enrollmentOpen === false
      ? false
      : canFinishPaying(profile.created_at);
    const planned = planRemainingFinishJoining({
      now,
      profile,
      unsubscribed: false,
      sentTypes,
      nudgeAllowed,
    });
    return {
      track: "finish_joining",
      remaining: [...openingWeek.remaining, ...planned.remaining],
      stopReason: planned.stopReason,
      email,
    };
  }

  const planned = planRemainingQuizDrips({
    now,
    lead,
    profile: null,
    unsubscribed: false,
    sentTypes,
    quizRangesAt,
  });
  return {
    track: "quiz",
    remaining: [...openingWeek.remaining, ...planned.remaining],
    stopReason: planned.stopReason,
    email,
  };
}
