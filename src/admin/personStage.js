/**
 * Derived CRM stage for one person. Nurture is a badge, never a stage —
 * leftover-first (#304) keeps pregnant / plant-based in play.
 */
import { membershipAccess } from "../lib/membershipAccess";
import { isLeftoverLead } from "./quizLeads";

export const PERSON_STAGES = [
  "new_lead",
  "nudging",
  "leftover",
  "cold",
  "paid_needs_setup",
  "active",
  "alumni",
  "refunded",
  "signed_up",
];

export const NURTURE_SEGMENTS = new Set([
  "pregnancy_nurture",
  "waitlist_plantbased",
  "early_pp_nurture",
]);

const NURTURE_BADGE = {
  pregnancy_nurture: "Pregnant",
  waitlist_plantbased: "Plant-based",
  early_pp_nurture: "Early PP",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeEmailLower(email) {
  return String(email || "").trim().toLowerCase();
}

export function isNurtureSegment(segment) {
  return NURTURE_SEGMENTS.has(String(segment || "").trim());
}

export function nurtureBadges(lead) {
  const segment = String(lead?.segment || "").trim();
  const badge = NURTURE_BADGE[segment];
  return badge ? [badge] : [];
}

export function isPaidApproved(client) {
  if (!client) return false;
  if (client.refunded) return false;
  const paid = Boolean(client.paid || client.paid_at);
  const approved = Boolean(
    client.approved
    || client.macros?.approved
    || client.status === "active"
    || client.stage === "active",
  );
  return paid && approved;
}

export function lastTouchMs({ lastEmailAt, lastAdminDmAt, lastAdminTouchAt } = {}) {
  const times = [lastEmailAt, lastAdminDmAt, lastAdminTouchAt]
    .map((v) => (typeof v === "number" ? v : Date.parse(v)))
    .filter((n) => Number.isFinite(n));
  if (!times.length) return null;
  return Math.max(...times);
}

/**
 * @param {{
 *   client?: object|null,
 *   lead?: object|null,
 *   leftover?: boolean,
 *   remainingDrips?: number,
 *   sentBeyondRanges?: boolean,
 *   unsubscribed?: boolean,
 *   markedCold?: boolean,
 *   lastEmailAt?: string|number|null,
 *   lastAdminDmAt?: string|number|null,
 *   lastAdminTouchAt?: string|number|null,
 *   now?: number|Date,
 * }} input
 */
export function derivePersonStage(input = {}) {
  const now = input.now instanceof Date ? input.now.getTime() : Number(input.now || Date.now());
  const client = input.client || null;
  const lead = input.lead || null;
  const leftover = input.leftover ?? (lead ? isLeftoverLead(lead) : false);
  const nurture = isNurtureSegment(lead?.segment);

  if (client?.refunded || client?.stage === "refunded") return "refunded";

  if (isPaidApproved(client)) {
    const access = membershipAccess({
      role: client.role,
      paid: client.paid,
      refunded: client.refunded,
      cohort_label: client.cohort_label,
      subscription_status: client.subscription_status,
      tier: client.tier,
    }, new Date(now));
    if (access.paywall || access.reason === "membership_required") return "alumni";
    return "active";
  }

  if (
    client?.stage === "paid_awaiting_intake"
    || client?.stage === "awaiting_approval"
    || (client?.paid && !isPaidApproved(client))
  ) {
    return "paid_needs_setup";
  }

  if (leftover) {
    if (input.markedCold && !nurture) return "cold";
    if (input.unsubscribed && !nurture) return "cold";

    const created = Date.parse(lead?.created_at || client?.createdAt || "");
    const ageMs = Number.isFinite(created) ? now - created : null;
    const remaining = Number(input.remainingDrips || 0);
    const sentBeyond = Boolean(input.sentBeyondRanges);
    if (ageMs != null && ageMs < 2 * DAY_MS && !sentBeyond) return "new_lead";
    if (remaining > 0) return "nudging";

    const touch = lastTouchMs(input);
    const stale = touch == null || now - touch > 14 * DAY_MS;
    if (stale && !nurture && remaining === 0) return "cold";
    return "leftover";
  }

  if (client?.stage === "signed_up" || (client && !client.paid)) return "signed_up";
  return leftover ? "leftover" : "signed_up";
}

export function personStageLabel(stage) {
  switch (stage) {
    case "new_lead": return "New lead";
    case "nudging": return "Nudging";
    case "leftover": return "Still in play";
    case "cold": return "Cold";
    case "paid_needs_setup": return "Needs setup";
    case "active": return "Active";
    case "alumni": return "Alumni";
    case "refunded": return "Refunded";
    case "signed_up": return "Signed up";
    default: return "Lead";
  }
}

export function personStageColor(stage, T) {
  if (stage === "active") return { bg: T.sageSoft, color: T.sage };
  if (stage === "paid_needs_setup" || stage === "new_lead" || stage === "nudging") {
    return { bg: T.amberSoft, color: T.amber };
  }
  if (stage === "cold" || stage === "refunded" || stage === "alumni") {
    return { bg: T.track, color: T.inkSoft };
  }
  return { bg: T.accentSoft, color: T.accentDeep };
}
