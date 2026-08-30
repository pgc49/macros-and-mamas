/**
 * Daily board skip for Quiet clients Callie does not want to chase today.
 * Unread and waiting-approval always stay on the board. A reply after a pass
 * brings the mama back (skipIsBroken). Never auto-pass on send.
 */
import { daysSinceIso } from "./clientFlags";
import { isSnoozed } from "./personModel";
import { normalizeEmailLower } from "./personStage";

export function endOfLocalDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d;
}

export function skipUntilIso(now = Date.now()) {
  return endOfLocalDay(now).toISOString();
}

export function skipIsBroken(client) {
  if (Number(client?.unreadFromMama) > 0) return true;
  if (client?.stage === "awaiting_approval") return true;
  if (client?.status === "pending" && client?.hasIntake && client?.paid) return true;
  return false;
}

function lastLogIso(client) {
  return client?.lastActiveDate || client?.lastMealDate || null;
}

function isHealthClient(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (client.refunded || client.stage === "refunded") return false;
  if (!client.paid && client.stage === "signed_up") return false;
  return true;
}

export function isQuietForPass(client, todayIso) {
  if (!isHealthClient(client)) return false;
  const iso = lastLogIso(client);
  if (!iso) return true;
  const n = daysSinceIso(iso, todayIso);
  return n == null || n >= 3;
}

export function snoozedUntilOf(client) {
  return client?.snoozedUntil || client?.snoozed_until || null;
}

export function isPassedQuietToday(client, now = Date.now()) {
  if (!client || skipIsBroken(client)) return false;
  return isSnoozed({ snoozed_until: snoozedUntilOf(client) }, now);
}

export function canPassToday(client, todayIso, now = Date.now()) {
  if (!isQuietForPass(client, todayIso)) return false;
  if (skipIsBroken(client)) return false;
  if (isPassedQuietToday(client, now)) return false;
  return true;
}

export function boardReason(client, todayIso) {
  if (Number(client?.unreadFromMama) > 0) return "unread";
  if (client?.stage === "awaiting_approval") return "approve";
  if (client?.status === "pending" && client?.hasIntake && client?.paid) return "approve";
  if (isQuietForPass(client, todayIso)) return "quiet";
  return null;
}

export function stampRosterOverrides(roster, overrides) {
  const list = Array.isArray(overrides) ? overrides : [];
  return (roster || []).map((client) => {
    const key = normalizeEmailLower(client?.email);
    if (!key) return client;
    const override = list.find((row) => normalizeEmailLower(row.email_lower || row.email) === key);
    if (!override) return client;
    return {
      ...client,
      snoozedUntil: override.snoozed_until || null,
      snoozed: isSnoozed(override),
      lastTouchAt: override.last_touch_at || client.lastTouchAt || null,
    };
  });
}

export function listPassedToday(roster, { query = "", cohort = "all", nowMs = Date.now() } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return (roster || []).filter((client) => {
    if (String(client?.role || "").toLowerCase() === "admin") return false;
    if (cohort && cohort !== "all") {
      const label = String(client?.cohort_label || "").trim() || "unassigned";
      if (label !== cohort) return false;
    }
    if (!isPassedQuietToday(client, nowMs)) return false;
    if (!q) return true;
    const hay = [client?.name, client?.firstName, client?.email, client?.phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
