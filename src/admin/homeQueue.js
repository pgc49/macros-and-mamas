/**
 * Home Needs-you queue. Clients use attentionRank as-is (299/302 own those
 * rules). Leftover leads append as hot / last-drip rows. Snoozed people drop out.
 */
import { isAdminQaClient } from "./adminQa";
import { attentionRank, needsYou } from "./clientRoster";
import { isAwaitingApproval, isAwaitingIntake } from "./clientHealth";
import { lastTouchMs } from "./personStage";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isHotLeftover(person, now = Date.now()) {
  if (!person?.leftover || person.snoozed || person.stage === "cold") return false;
  const touch = person.lastTouchAt ?? lastTouchMs(person);
  if (touch && now - touch < DAY_MS) return false;
  const created = Date.parse(person.lead?.created_at || "");
  if (!Number.isFinite(created)) return now - (touch || 0) > DAY_MS;
  return now - created > DAY_MS;
}

export function isAgingLastDrip(person) {
  if (!person?.leftover || person.snoozed) return false;
  const remaining = person.remainingDrips || [];
  if (!remaining.length) return false;
  return remaining.length === 1;
}

function clientReason(client, todayIso) {
  if (Number(client?.unreadFromMama) > 0) {
    const n = Number(client.unreadFromMama);
    return n === 1 ? "Unread message" : `${n} unread messages`;
  }
  if (isAwaitingApproval(client)) {
    return "Waiting on your approval";
  }
  if (isAwaitingIntake(client)) return "Paid — needs intake";
  if (needsYou(client, todayIso)) return "Quiet — no logs";
  return "Needs you";
}

/**
 * Flat ranked list for Home. Client rows keep attentionRank order.
 * Lead rows sit after client ranks 0–2 so approvals/unreads stay on top.
 */
export function buildHomeQueue({
  people = [],
  todayIso,
  now = Date.now(),
} = {}) {
  const rows = [];

  for (const person of people) {
    if (person.snoozed) continue;
    if (isAdminQaClient(person) || isAdminQaClient(person.client)) continue;
    const client = person.client;
    if (client && needsYou(client, todayIso)) {
      rows.push({
        key: `client:${person.profileId || person.emailLower}`,
        person,
        kind: "client",
        reason: clientReason(client, todayIso),
        action: Number(client.unreadFromMama) > 0 ? "thread" : "card",
        rank: attentionRank(client, todayIso),
        sortAt: client.lastAdminAt || client.createdAt || "",
      });
      continue;
    }
    if (person.leftover && isHotLeftover(person, now)) {
      rows.push({
        key: `lead-hot:${person.emailLower}`,
        person,
        kind: "lead",
        reason: "Leftover — no touch in 24h",
        action: "email",
        rank: 5,
        sortAt: person.lead?.created_at || "",
      });
      continue;
    }
    if (person.leftover && isAgingLastDrip(person)) {
      rows.push({
        key: `lead-drip:${person.emailLower}`,
        person,
        kind: "lead",
        reason: "Last drip still open",
        action: "email",
        rank: 6,
        sortAt: person.lead?.created_at || "",
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.sortAt || "").localeCompare(String(b.sortAt || ""));
  });
}

export function newLeftoverLastHours(people, now = Date.now(), hours = 24) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return (people || []).filter((p) => {
    if (!p.leftover || p.stage === "cold") return false;
    const created = Date.parse(p.lead?.created_at || "");
    return Number.isFinite(created) && created >= cutoff;
  });
}

export function leftoverInPlayCount(people) {
  return (people || []).filter((p) => p.leftover && p.stage !== "cold").length;
}

export function todayStripStats(people, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  let newLeads = 0;
  let paidToday = 0;
  let paidCents = 0;
  for (const person of people || []) {
    const created = Date.parse(person.lead?.created_at || "");
    if (Number.isFinite(created) && created >= startMs && person.leftover) newLeads += 1;
    const paidAt = Date.parse(person.client?.paidAt || person.client?.paid_at || "");
    const stripe = person.client?.paid && !person.client?.comp;
    if (stripe && Number.isFinite(paidAt) && paidAt >= startMs) {
      paidToday += 1;
      paidCents += Number(person.client?.amountCents || 0);
    }
  }
  return { newLeads, paidToday, paidCents };
}

export function pipelineCounts(people) {
  let inPlay = 0;
  let settingUp = 0;
  let active = 0;
  for (const person of people || []) {
    if (person.leftover && person.stage !== "cold") inPlay += 1;
    if (person.stage === "paid_needs_setup") settingUp += 1;
    if (person.stage === "active") active += 1;
  }
  return { inPlay, settingUp, active };
}
