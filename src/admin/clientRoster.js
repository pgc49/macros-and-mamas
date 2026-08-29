import { adminCohortName } from "../lib/cohorts";
import { isStripeCollected } from "../../functions/_shared/comp.js";
import { addDaysIso, localDateIso } from "../utils/dates";

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

const PLACEHOLDER_NAMES = new Set(["new signup", "mama", "unnamed"]);

/** First+last when we have them; otherwise email local-part. Never “New signup”. */
export function rosterTitle(client) {
  const named = String(client?.name || "").trim();
  if (named && !PLACEHOLDER_NAMES.has(named.toLowerCase())) return named;
  const first = String(client?.firstName || "").trim();
  const last = String(client?.lastName || "").trim();
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  const email = String(client?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  if (email) return email;
  return "Unnamed";
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

/** Paid + intake/macros in + not yet approved. Not quiet actives, unpaid, or paid-no-intake. */
export function isReadyToApprove(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (client.refunded || client.stage === "refunded") return false;
  if (client.stage === "awaiting_approval") return true;
  return Boolean(client.status === "pending" && client.hasIntake && client.paid);
}

export function isPaidAwaitingIntake(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (client.refunded || client.stage === "refunded") return false;
  return client.stage === "paid_awaiting_intake";
}

/** Pregnant / early-BF / nursing / diet safety on a waiting (not-yet-approved) intake. */
export function hasWaitingIntakeSafetyFlag(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (client.refunded || client.stage === "refunded") return false;
  const waiting = client.stage === "awaiting_approval"
    || Boolean(client.status === "pending" && client.hasIntake);
  if (!waiting) return false;
  if (client.pregnant) return true;
  if (client.breastfeeding) return true;
  if (client.diet && client.diet !== "none") return true;
  return false;
}

/**
 * Interrupt queue (Needs you). Quiet logs and paid-no-intake are digest, not here.
 * Failed pay is not on the roster — refunds stay on the existing Refunded filter.
 */
export function needsYou(client, _todayIso = localDateIso()) {
  if (!client || client.role === "admin") return false;
  if (Number(client.unreadFromMama) > 0) return true;
  if (isReadyToApprove(client)) return true;
  if (hasWaitingIntakeSafetyFlag(client)) return true;
  return false;
}

/** Daily digest: quiet actives + paid-no-intake. Interrupt items stay on Needs you. */
export function isDigestItem(client, todayIso = localDateIso()) {
  if (!client || client.role === "admin") return false;
  if (needsYou(client)) return false;
  if (isQuietActive(client, todayIso)) return true;
  return isPaidAwaitingIntake(client);
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

function attentionRank(client, todayIso) {
  if (Number(client.unreadFromMama) > 0) return 0;
  if (hasWaitingIntakeSafetyFlag(client)) return 1;
  if (isReadyToApprove(client)) return 2;
  if (isQuietActive(client, todayIso)) return 3;
  if (isPaidAwaitingIntake(client)) return 4;
  if (client.stage === "active" && !client.lastAdminAt) return 5;
  return 6;
}

export function filterRoster(all, filter, { query = "", todayIso = localDateIso(), cohort = "all" } = {}) {
  const admins = (all || []).filter((c) => c.role === "admin").slice().sort(byName);
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && matchesCohort(c, cohort));
  let list = clientsOnly;
  if (filter === "needs_you") {
    list = clientsOnly.filter((c) => needsYou(c, todayIso));
  } else if (filter === "digest") {
    list = clientsOnly.filter((c) => isDigestItem(c, todayIso));
  } else if (filter === "unpaid") {
    list = clientsOnly.filter((c) => c.stage === "signed_up");
  } else if (filter === "paid") {
    list = clientsOnly.filter((c) => isStripeCollected(c));
  } else if (filter === "awaiting_intake") {
    list = clientsOnly.filter((c) => isPaidAwaitingIntake(c));
  } else if (filter === "awaiting_approval") {
    list = clientsOnly.filter((c) => isReadyToApprove(c));
  } else if (filter === "active") {
    list = clientsOnly.filter((c) => c.stage === "active" || c.status === "active");
  } else if (filter === "refunded") {
    list = clientsOnly.filter((c) => c.refunded || c.stage === "refunded");
  }

  list = list.filter((c) => matchesRosterQuery(c, query));

  if (filter === "unpaid") {
    list = list.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  } else if (filter === "active") {
    list = list.slice().sort(byName);
  } else {
    list = list.slice().sort((a, b) => {
      const rank = attentionRank(a, todayIso) - attentionRank(b, todayIso);
      if (rank !== 0) return rank;
      const aAt = a.lastAdminAt || "";
      const bAt = b.lastAdminAt || "";
      if (aAt !== bAt) {
        if (!aAt) return -1;
        if (!bAt) return 1;
        return aAt.localeCompare(bAt);
      }
      return byName(a, b);
    });
  }

  const showAdmins = (filter === "all" || filter === "active") && (!cohort || cohort === "all");
  const adminHits = showAdmins ? admins.filter((c) => matchesRosterQuery(c, query)) : [];
  return [...adminHits, ...list];
}

export function rosterFilterCounts(all, todayIso = localDateIso(), cohort = "all") {
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && matchesCohort(c, cohort));
  return {
    needsYou: clientsOnly.filter((c) => needsYou(c, todayIso)).length,
    digest: clientsOnly.filter((c) => isDigestItem(c, todayIso)).length,
    quiet: clientsOnly.filter((c) => isQuietActive(c, todayIso) && !needsYou(c, todayIso)).length,
    active: clientsOnly.filter((c) => c.stage === "active" || c.status === "active").length,
    awaitingApproval: clientsOnly.filter((c) => isReadyToApprove(c)).length,
    awaitingIntake: clientsOnly.filter((c) => isPaidAwaitingIntake(c)).length,
    unpaid: clientsOnly.filter((c) => c.stage === "signed_up").length,
    paid: clientsOnly.filter((c) => isStripeCollected(c)).length,
    refunded: clientsOnly.filter((c) => c.refunded || c.stage === "refunded").length,
    all: clientsOnly.length,
  };
}

export function rosterStats(all, cohort = "all") {
  const clientsOnly = (all || []).filter((c) => c.role !== "admin" && matchesCohort(c, cohort));
  return {
    signups: clientsOnly.length,
    paid: clientsOnly.filter((c) => isStripeCollected(c)).length,
    unpaid: clientsOnly.filter((c) => !c.paid && !c.refunded).length,
    awaitingIntake: clientsOnly.filter((c) => isPaidAwaitingIntake(c)).length,
    awaitingApproval: clientsOnly.filter((c) => isReadyToApprove(c)).length,
    active: clientsOnly.filter((c) => c.stage === "active" || c.status === "active").length,
    refunded: clientsOnly.filter((c) => c.refunded || c.stage === "refunded").length,
  };
}
