/**
 * Client health bands for Home + Clients filters.
 * "Logged" is meals / water / weigh-ins (lastActiveDate), not an auth login.
 */
import { adminCohortName } from "../lib/cohorts";
import { daysSinceIso } from "./clientFlags";

function cohortKey(client) {
  return String(client?.cohort_label || "").trim() || "unassigned";
}

export function lastLogIso(client) {
  return client?.lastActiveDate || client?.lastMealDate || null;
}

export function daysSinceLastLog(client, todayIso) {
  const iso = lastLogIso(client);
  if (!iso) return Infinity;
  const n = daysSinceIso(iso, todayIso);
  return n == null ? Infinity : n;
}

export function formatLastLogged(client, todayIso) {
  const iso = lastLogIso(client);
  if (!iso) return { label: "Never logged", stale: true };
  const days = daysSinceLastLog(client, todayIso);
  if (days === 0) return { label: "Today", stale: false };
  if (days === 1) return { label: "Yesterday", stale: false };
  if (!Number.isFinite(days)) return { label: "Never logged", stale: true };
  if (days < 7) return { label: `${days}d ago`, stale: days >= 3 };
  try {
    return {
      label: new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      stale: true,
    };
  } catch {
    return { label: "Never logged", stale: true };
  }
}

export function isHealthClient(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (client.refunded || client.stage === "refunded") return false;
  if (!client.paid && client.stage === "signed_up") return false;
  return true;
}

export function isAwaitingApproval(client) {
  return client?.stage === "awaiting_approval"
    || (client?.status === "pending" && client?.hasIntake && client?.paid);
}

/**
 * Mutually exclusive: unread / approval / quiet 3d+ first,
 * then doing well (logged yesterday or today), else steady (logged in last 3 days).
 */
export function clientHealthBand(client, todayIso) {
  if (!isHealthClient(client)) return null;
  if (Number(client.unreadFromMama) > 0) return "needs_help";
  if (isAwaitingApproval(client)) return "needs_help";
  const days = daysSinceLastLog(client, todayIso);
  if (days >= 3) return "needs_help";
  if (days <= 1) return "doing_well";
  return "steady";
}

export function matchesClientHealthFilter(client, filter, todayIso) {
  if (filter === "unread") return Number(client?.unreadFromMama) > 0;
  if (filter === "quiet") {
    return isHealthClient(client) && daysSinceLastLog(client, todayIso) >= 3;
  }
  if (filter === "needs_help" || filter === "steady" || filter === "doing_well") {
    return clientHealthBand(client, todayIso) === filter;
  }
  return false;
}

export function clientHealthByCohort(roster, todayIso) {
  const counts = new Map();
  for (const client of roster || []) {
    const band = clientHealthBand(client, todayIso);
    if (!band) continue;
    const key = cohortKey(client);
    if (!counts.has(key)) {
      counts.set(key, { cohort: key, needs_help: 0, steady: 0, doing_well: 0 });
    }
    counts.get(key)[band] += 1;
  }
  const preferred = ["2026-07", "2026-08"];
  const rest = [...counts.keys()].filter((id) => !preferred.includes(id)).sort();
  return [...preferred, ...rest]
    .filter((id) => counts.has(id))
    .map((id) => ({
      ...counts.get(id),
      label: id === "unassigned" ? "Unassigned" : adminCohortName(id),
    }));
}
