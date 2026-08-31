import { adminCohortName } from "../lib/cohorts";
import { joinPersonName } from "../lib/personName";
import { isStripeCollected } from "../../functions/_shared/comp.js";
import { addDaysIso, localDateIso } from "../utils/dates";
import { daysSinceIso } from "./clientFlags";
import { isAdminQaClient } from "./adminQa";
import { isAwaitingApproval, isAwaitingIntake, isHealthClient, isUnpaidSignup, lastLogIso, matchesClientHealthFilter } from "./clientHealth";

export const UNASSIGNED_COHORT = "unassigned";

export function cohortKey(client) {
  const label = String(client?.cohort_label || "").trim();
  return label || UNASSIGNED_COHORT;
}

export function matchesCohort(client, cohortFilter) {
  if (!cohortFilter || cohortFilter === "all") return true;
  return cohortKey(client) === cohortFilter;
}

export function listRosterCohorts(all) {
  const present = new Set();
  for (const c of all || []) {
    if (String(c?.role || "").toLowerCase() === "admin") continue;
    if (isAdminQaClient(c)) continue;
    present.add(cohortKey(c));
  }
  const options = [{ id: "all", label: "All groups" }];
  for (const row of [
    { id: "2026-07", label: adminCohortName("2026-07") },
    { id: "2026-08", label: adminCohortName("2026-08") },
  ]) {
    if (present.has(row.id)) options.push(row);
  }
  for (const id of [...present].sort()) {
    if (id === "2026-07" || id === "2026-08" || id === UNASSIGNED_COHORT) continue;
    options.push({ id, label: adminCohortName(id) });
  }
  if (present.has(UNASSIGNED_COHORT)) {
    options.push({ id: UNASSIGNED_COHORT, label: "Unassigned" });
  }
  return options;
}

/** Always offer Founding / Cohort 2 / Unassigned so leftover + group compose. */
export function listLeadCohorts(leads) {
  const present = new Set();
  for (const row of leads || []) {
    present.add(cohortKey(row));
  }
  const options = [
    { id: "all", label: "All groups" },
    { id: "2026-07", label: adminCohortName("2026-07") },
    { id: "2026-08", label: adminCohortName("2026-08") },
  ];
  for (const id of [...present].sort()) {
    if (id === "2026-07" || id === "2026-08" || id === UNASSIGNED_COHORT) continue;
    options.push({ id, label: adminCohortName(id) });
  }
  options.push({ id: UNASSIGNED_COHORT, label: "Unassigned" });
  return options;
}

const PLACEHOLDER_NAMES = new Set(["new signup", "mama", "unnamed"]);

function isPlaceholderName(value) {
  const raw = String(value || "").trim();
  return !raw || PLACEHOLDER_NAMES.has(raw.toLowerCase());
}

function emailLocalPart(value) {
  const email = String(value || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email;
}

function givenName(person) {
  return String(person?.name || person?.first_name || "").trim();
}

function familyName(person) {
  return String(person?.lastName || person?.last_name || "").trim();
}

function personEmail(person) {
  return person?.email || person?.sender_email || "";
}

/**
 * Shared admin identity: Clients roster, inbox DIRECT, Start a thread.
 * Placeholder names {mama, new signup, unnamed} are not real — fall through
 * to first+last (no doubled last), then email local-part. Never “Mama”.
 */
export function adminPersonTitle(...candidates) {
  for (const raw of candidates) {
    if (!raw) continue;
    const named = givenName(raw);
    if (named && !isPlaceholderName(named)) {
      const joined = joinPersonName(named, familyName(raw));
      if (joined) return joined;
    }
    const first = String(raw.firstName || raw.first_name || "").trim();
    const firstOk = isPlaceholderName(first) ? "" : first;
    const combined = joinPersonName(firstOk, familyName(raw));
    if (combined) return combined;
    const local = emailLocalPart(personEmail(raw));
    if (local) return local;
  }
  return "Unnamed";
}

/** Alias — Clients roster and sorts. Same helper as inbox. */
export function rosterTitle(client) {
  return adminPersonTitle(client);
}

/** Alias — inbox / start-a-thread walk roster row, then peer, then email. */
export function inboxDisplayName(...candidates) {
  return adminPersonTitle(...candidates);
}

function lastMessageOf(row) {
  return row?.lastMessage || row?.last_message || null;
}

function senderProfileOf(last) {
  return last?.sender_profile || last?.senderProfile || null;
}

/** True when the last-message sender is the mama/peer, not Callie. */
export function senderProfileIsPeer(row, last = lastMessageOf(row)) {
  const sender = senderProfileOf(last);
  if (!sender) return false;
  const peerId = row?.clientId || row?.client_id || null;
  if (!peerId) return false;
  if (sender.id && String(sender.id) === String(peerId)) return true;
  if (last?.sender_id && String(last.sender_id) === String(peerId)) return true;
  return false;
}

/**
 * DIRECT row title. Roster is preferred; a missed clientMap entry still
 * resolves from inbox peer / lastMessage.sender_profile / email — not “Mama”.
 */
export function inboxThreadTitle(row, client = null) {
  const last = lastMessageOf(row);
  const sender = senderProfileIsPeer(row, last) ? senderProfileOf(last) : null;
  return adminPersonTitle(
    client,
    row?.peer,
    sender,
    { email: row?.peer?.email || sender?.email || last?.sender_email || "" },
  );
}

export function formatLastMessaged(iso, nowMs = Date.now()) {
  if (!iso) return { label: "Never messaged", stale: true };
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return { label: "Never messaged", stale: true };
  const diff = nowMs - then;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < 45 * 60 * 1000) return { label: "Just now", stale: false };
  if (diff < day) {
    const hours = Math.max(1, Math.round(diff / hour));
    return { label: `${hours}h ago`, stale: false };
  }
  if (diff < 7 * day) {
    const days = Math.max(1, Math.round(diff / day));
    return { label: `${days}d ago`, stale: days >= 3 };
  }
  try {
    return {
      label: new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      stale: true,
    };
  } catch {
    return { label: "Never messaged", stale: true };
  }
}

export function isQuietActive(client, todayIso = localDateIso()) {
  const active = client?.stage === "active" || client?.status === "active";
  if (!active || client?.refunded) return false;
  const lastActive = client?.lastActiveDate || client?.lastMealDate || null;
  if (!lastActive) return true;
  const okIfOnOrAfter = addDaysIso(todayIso, -1);
  return lastActive < okIfOnOrAfter;
}

export function needsYou(client, todayIso = localDateIso()) {
  if (!client || client.role === "admin") return false;
  if (isAdminQaClient(client)) return false;
  if (Number(client.unreadFromMama) > 0) return true;
  if (isAwaitingApproval(client)) return true;
  return isQuietActive(client, todayIso);
}

export function matchesRosterQuery(client, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    client?.name,
    client?.firstName,
    client?.lastName,
    client?.email,
    client?.phone,
    client?.cohort_label,
    adminCohortName(client?.cohort_label),
    rosterTitle(client),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function byName(a, b) {
  return rosterTitle(a).localeCompare(rosterTitle(b), undefined, { sensitivity: "base" });
}

export const ROSTER_SORTS = [
  ["board", "Board"],
  ["last_messaged", "Last messaged"],
  ["last_logged", "Last logged"],
  ["name", "Name"],
  ["signed_up", "Signed up"],
];

export const WEEKLY_NOTE_DAYS = 7;

/** Paid client with no admin DM, or last note older than a week. */
export function needsWeeklyNote(client, todayIso = localDateIso(), days = WEEKLY_NOTE_DAYS) {
  if (!isHealthClient(client)) return false;
  if (!client?.lastAdminAt) return true;
  const n = daysSinceIso(client.lastAdminAt, todayIso);
  return n == null || n >= days;
}

/** Never / missing dates count as oldest. */
export function compareNullableIso(a, b, dir = "asc") {
  const aEmpty = !a;
  const bEmpty = !b;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return dir === "asc" ? -1 : 1;
  if (bEmpty) return dir === "asc" ? 1 : -1;
  const cmp = String(a).localeCompare(String(b));
  return dir === "desc" ? -cmp : cmp;
}

function boardCompare(a, b, filter, todayIso) {
  if (filter === "unpaid") {
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  }
  if (filter === "doing_well" || filter === "steady" || filter === "active") {
    return byName(a, b);
  }
  if (filter === "needs_note") {
    const messaged = compareNullableIso(a.lastAdminAt, b.lastAdminAt, "asc");
    return messaged || byName(a, b);
  }
  const rank = attentionRank(a, todayIso) - attentionRank(b, todayIso);
  if (rank !== 0) return rank;
  const messaged = compareNullableIso(a.lastAdminAt, b.lastAdminAt, "asc");
  return messaged || byName(a, b);
}

export function compareRosterSort(a, b, { sort = "board", dir = "asc", filter = "needs_help", todayIso } = {}) {
  if (!sort || sort === "board") return boardCompare(a, b, filter, todayIso);
  if (sort === "name") {
    const cmp = byName(a, b);
    return dir === "desc" ? -cmp : cmp;
  }
  if (sort === "last_messaged") {
    const cmp = compareNullableIso(a.lastAdminAt, b.lastAdminAt, dir);
    return cmp || byName(a, b);
  }
  if (sort === "last_logged") {
    const cmp = compareNullableIso(lastLogIso(a), lastLogIso(b), dir);
    return cmp || byName(a, b);
  }
  if (sort === "signed_up") {
    const cmp = compareNullableIso(a.createdAt, b.createdAt, dir);
    return cmp || byName(a, b);
  }
  return boardCompare(a, b, filter, todayIso);
}

/** Exported so Home can consume this rank — do not rewrite the rules here. */
export function attentionRank(client, todayIso) {
  if (Number(client.unreadFromMama) > 0) return 0;
  if (isAwaitingApproval(client)) {
    return 1;
  }
  if (isQuietActive(client, todayIso)) return 2;
  if (client.stage === "active" && !client.lastAdminAt) return 3;
  return 4;
}

export function filterRoster(all, filter, {
  query = "",
  todayIso = localDateIso(),
  cohort = "all",
  nowMs = Date.now(),
  sort = "board",
  dir = "asc",
} = {}) {
  const admins = (all || []).filter((c) => c.role === "admin").slice().sort(byName);
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && !isAdminQaClient(c) && matchesCohort(c, cohort));
  let list = clientsOnly;
  if (filter === "needs_you") {
    list = clientsOnly.filter((c) => needsYou(c, todayIso));
  } else if (filter === "unpaid") {
    list = clientsOnly.filter((c) => isUnpaidSignup(c));
  } else if (filter === "paid") {
    list = clientsOnly.filter((c) => isStripeCollected(c));
  } else if (filter === "awaiting_intake") {
    list = clientsOnly.filter((c) => isAwaitingIntake(c));
  } else if (filter === "awaiting_approval") {
    list = clientsOnly.filter((c) => isAwaitingApproval(c));
  } else if (filter === "active") {
    list = clientsOnly.filter((c) => c.stage === "active" || c.status === "active");
  } else if (filter === "refunded") {
    list = clientsOnly.filter((c) => c.refunded || c.stage === "refunded");
  } else if (filter === "needs_note") {
    list = clientsOnly.filter((c) => needsWeeklyNote(c, todayIso));
  } else if (filter === "unread" || filter === "quiet" || filter === "needs_help" || filter === "steady" || filter === "doing_well") {
    list = clientsOnly.filter((c) => matchesClientHealthFilter(c, filter, todayIso, nowMs));
  }

  list = list.filter((c) => matchesRosterQuery(c, query));
  list = list.slice().sort((a, b) => compareRosterSort(a, b, { sort, dir, filter, todayIso }));

  const showAdmins = (filter === "all" || filter === "active") && (!cohort || cohort === "all");
  const adminHits = showAdmins ? admins.filter((c) => matchesRosterQuery(c, query)) : [];
  return [...adminHits, ...list];
}

export function rosterFilterCounts(all, todayIso = localDateIso(), cohort = "all", nowMs = Date.now()) {
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && !isAdminQaClient(c) && matchesCohort(c, cohort));
  return {
    needsYou: clientsOnly.filter((c) => needsYou(c, todayIso)).length,
    active: clientsOnly.filter((c) => c.stage === "active" || c.status === "active").length,
    awaitingApproval: clientsOnly.filter((c) => isAwaitingApproval(c)).length,
    awaitingIntake: clientsOnly.filter((c) => isAwaitingIntake(c)).length,
    unpaid: clientsOnly.filter((c) => isUnpaidSignup(c)).length,
    paid: clientsOnly.filter((c) => isStripeCollected(c)).length,
    refunded: clientsOnly.filter((c) => c.refunded || c.stage === "refunded").length,
    unread: clientsOnly.filter((c) => matchesClientHealthFilter(c, "unread", todayIso, nowMs)).length,
    quiet: clientsOnly.filter((c) => matchesClientHealthFilter(c, "quiet", todayIso, nowMs)).length,
    needsHelp: clientsOnly.filter((c) => matchesClientHealthFilter(c, "needs_help", todayIso, nowMs)).length,
    needsNote: clientsOnly.filter((c) => needsWeeklyNote(c, todayIso)).length,
    steady: clientsOnly.filter((c) => matchesClientHealthFilter(c, "steady", todayIso, nowMs)).length,
    doingWell: clientsOnly.filter((c) => matchesClientHealthFilter(c, "doing_well", todayIso, nowMs)).length,
    all: clientsOnly.length,
  };
}

export function rosterStats(all, cohort = "all") {
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && !isAdminQaClient(c) && matchesCohort(c, cohort));
  return {
    signups: clientsOnly.length,
    paid: clientsOnly.filter((c) => isStripeCollected(c)).length,
    unpaid: clientsOnly.filter((c) => !c.paid && !c.refunded).length,
    awaitingIntake: clientsOnly.filter((c) => isAwaitingIntake(c)).length,
    awaitingApproval: clientsOnly.filter((c) => isAwaitingApproval(c)).length,
    active: clientsOnly.filter((c) => c.stage === "active" || c.status === "active").length,
    refunded: clientsOnly.filter((c) => c.refunded || c.stage === "refunded").length,
  };
}
