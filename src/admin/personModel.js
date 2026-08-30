/**
 * JS person assembler: one row per lower(email). Profiles win so paid-without-quiz
 * people still appear. Next-drip stays in JS via planLeadDrips.
 */
import { planLeadDrips, sentTypesFromEvents } from "./leadDripSchedule";
import {
  derivePersonStage,
  lastTouchMs,
  normalizeEmailLower,
  nurtureBadges,
} from "./personStage";
import { isLeftoverLead, leadDisplayName } from "./quizLeads";
import { rosterTitle } from "./clientRoster";

const QUIZ_RANGES = "quiz_ranges";

export function overrideForEmail(overrides, email) {
  const key = normalizeEmailLower(email);
  if (!key) return null;
  const list = Array.isArray(overrides) ? overrides : [];
  return list.find((row) => normalizeEmailLower(row.email_lower || row.email) === key) || null;
}

export function isSnoozed(override, now = Date.now()) {
  if (!override?.snoozed_until) return false;
  const until = Date.parse(override.snoozed_until);
  return Number.isFinite(until) && until > now;
}

function eventsForEmail(eventsByEmail, email) {
  const key = normalizeEmailLower(email);
  if (!key) return [];
  return eventsByEmail?.[key] || [];
}

function sentBeyondRanges(events) {
  const types = sentTypesFromEvents(events);
  return [...types].some((t) => t && t !== QUIZ_RANGES);
}

function lastEmailAt(events) {
  let latest = null;
  for (const event of events || []) {
    const at = Date.parse(event?.created_at);
    if (Number.isFinite(at) && (latest == null || at > latest)) latest = at;
  }
  return latest;
}

export function assemblePeople({
  clients = [],
  leads = [],
  overrides = [],
  eventsByEmail = {},
  unsubscribedEmails = new Set(),
  now = Date.now(),
} = {}) {
  const byEmail = new Map();

  for (const client of clients || []) {
    if (String(client?.role || "").toLowerCase() === "admin") continue;
    const email = normalizeEmailLower(client.email);
    if (!email) continue;
    byEmail.set(email, { client, lead: null });
  }

  for (const lead of leads || []) {
    const email = normalizeEmailLower(lead.email);
    if (!email) continue;
    const existing = byEmail.get(email);
    if (existing) {
      existing.lead = lead;
    } else {
      byEmail.set(email, { client: null, lead });
    }
  }

  const people = [];
  for (const [email, { client, lead }] of byEmail) {
    const override = overrideForEmail(overrides, email);
    const events = eventsForEmail(eventsByEmail, email);
    const leftover = lead ? isLeftoverLead(lead) : Boolean(client && !client.paid && !client.refunded);
    const drip = leftover && lead
      ? planLeadDrips({
        lead,
        events,
        unsubscribed: unsubscribedEmails.has(email),
        now,
      })
      : { remaining: [] };
    const lastEmail = lastEmailAt(events);
    const lastAdminDmAt = client?.lastAdminAt || null;
    const lastAdminTouchAt = override?.last_touch_at || override?.lastTouchAt || null;
    const stage = derivePersonStage({
      client,
      lead,
      leftover,
      remainingDrips: drip.remaining?.length || 0,
      sentBeyondRanges: sentBeyondRanges(events),
      unsubscribed: unsubscribedEmails.has(email),
      markedCold: Boolean(override?.marked_cold),
      lastEmailAt: lastEmail,
      lastAdminDmAt,
      lastAdminTouchAt,
      now,
    });
    const name = client
      ? (rosterTitle(client) || leadDisplayName(lead) || client.email)
      : leadDisplayName(lead);
    people.push({
      key: email,
      email: client?.email || lead?.email || email,
      emailLower: email,
      profileId: client?.id || lead?.profileId || null,
      name,
      kind: client ? "client" : "lead",
      stage,
      leftover,
      nurtureTags: nurtureBadges(lead),
      tags: lead ? [nurtureBadges(lead), lead.needs_review ? ["Needs review"] : []].flat() : nurtureBadges(lead),
      cohort_label: client?.cohort_label || lead?.cohort_label || null,
      sourceLabel: lead?.sourceKind || lead?.source || null,
      lastEmailAt: lastEmail,
      lastAdminDmAt,
      lastAdminTouchAt,
      lastActivityAt: client?.lastActiveDate || client?.lastMealDate || null,
      lastTouchAt: lastTouchMs({ lastEmailAt: lastEmail, lastAdminDmAt, lastAdminTouchAt }),
      unreadFromMama: Number(client?.unreadFromMama || 0),
      remainingDrips: drip.remaining || [],
      nextDrip: drip.remaining?.[0] || null,
      snoozed: isSnoozed(override, now),
      snoozedUntil: override?.snoozed_until || null,
      markedCold: Boolean(override?.marked_cold),
      client,
      lead,
    });
  }
  return people;
}

export function personMatchesQuery(person, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    person?.name,
    person?.email,
    person?.client?.phone,
    person?.lead?.phone,
    person?.cohort_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
