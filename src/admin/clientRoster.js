import { addDaysIso, localDateIso } from "../utils/dates";

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

export function needsYou(client, todayIso = localDateIso()) {
  if (!client || client.role === "admin") return false;
  if (Number(client.unreadFromMama) > 0) return true;
  if (client.stage === "awaiting_approval") return true;
  if (client.status === "pending" && client.hasIntake && client.paid) return true;
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
  if (client.stage === "awaiting_approval" || (client.status === "pending" && client.hasIntake && client.paid)) {
    return 1;
  }
  if (isQuietActive(client, todayIso)) return 2;
  if (client.stage === "active" && !client.lastAdminAt) return 3;
  return 4;
}

export function filterRoster(all, filter, { query = "", todayIso = localDateIso() } = {}) {
  const admins = (all || []).filter((c) => c.role === "admin").slice().sort(byName);
  const clientsOnly = (all || []).filter((c) => c.role !== "admin");
  let list = clientsOnly;
  if (filter === "needs_you") {
    list = clientsOnly.filter((c) => needsYou(c, todayIso));
  } else if (filter === "unpaid") {
    list = clientsOnly.filter((c) => c.stage === "signed_up");
  } else if (filter === "awaiting_intake") {
    list = clientsOnly.filter((c) => c.stage === "paid_awaiting_intake");
  } else if (filter === "awaiting_approval") {
    list = clientsOnly.filter(
      (c) => c.stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid),
    );
  } else if (filter === "active") {
    list = clientsOnly.filter((c) => c.stage === "active" || c.status === "active");
  } else if (filter === "refunded") {
    list = clientsOnly.filter((c) => c.refunded || c.stage === "refunded");
  }

  list = list.filter((c) => matchesRosterQuery(c, query));

  if (filter === "unpaid") {
    list = list.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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

  const showAdmins = filter === "all" || filter === "active";
  const adminHits = showAdmins ? admins.filter((c) => matchesRosterQuery(c, query)) : [];
  return [...adminHits, ...list];
}

export function rosterFilterCounts(all, todayIso = localDateIso()) {
  const clientsOnly = (all || []).filter((c) => c.role !== "admin");
  return {
    needsYou: clientsOnly.filter((c) => needsYou(c, todayIso)).length,
    active: clientsOnly.filter((c) => c.stage === "active" || c.status === "active").length,
    awaitingApproval: clientsOnly.filter(
      (c) => c.stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid),
    ).length,
    awaitingIntake: clientsOnly.filter((c) => c.stage === "paid_awaiting_intake").length,
    unpaid: clientsOnly.filter((c) => c.stage === "signed_up").length,
    refunded: clientsOnly.filter((c) => c.refunded || c.stage === "refunded").length,
    all: clientsOnly.length,
  };
}
