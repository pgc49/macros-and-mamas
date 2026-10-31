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

export function overrideEmailKey(row) {
  return normalizeEmailLower(row?.email_lower || row?.email);
}

/**
 * Keep a just-pressed skip when the server reload is empty or mid-write.
 * Local active snoozes win over a missing/expired server row.
 */
export function mergeOverrideRows(serverRows = [], localRows = [], now = Date.now()) {
  const map = new Map();
  for (const row of serverRows || []) {
    const key = overrideEmailKey(row);
    if (!key) continue;
    map.set(key, { ...row, email_lower: key });
  }
  for (const row of localRows || []) {
    const key = overrideEmailKey(row);
    if (!key) continue;
    const server = map.get(key);
    const localActive = isSnoozed(row, now);
    const serverActive = isSnoozed(server, now);
    if (localActive && !serverActive) {
      map.set(key, {
        ...server,
        email_lower: key,
        snoozed_until: row.snoozed_until,
        last_touch_at: row.last_touch_at || server?.last_touch_at || null,
      });
    } else if (!server && (localActive || row.marked_cold || row.last_touch_at)) {
      map.set(key, { ...row, email_lower: key });
    }
  }
  return [...map.values()];
}

const LOCAL_SKIP_KEY = "mm_admin_daily_skip_v1";

function readLocalSkipStore() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_SKIP_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocalSkipStore(rows) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SKIP_KEY, JSON.stringify(rows));
  } catch {
    /* private mode / quota — skip still lives in React state */
  }
}

export function loadLocalSkips(now = Date.now()) {
  const kept = readLocalSkipStore().filter((row) => isSnoozed(row, now));
  writeLocalSkipStore(kept);
  return kept;
}

export function writeLocalSkip(email, patch, now = Date.now()) {
  const key = normalizeEmailLower(email);
  if (!key) return;
  const rest = loadLocalSkips(now).filter((row) => overrideEmailKey(row) !== key);
  writeLocalSkipStore([...rest, { email_lower: key, ...patch }]);
}

export function clearLocalSkip(email, now = Date.now()) {
  const key = normalizeEmailLower(email);
  if (!key) return;
  writeLocalSkipStore(loadLocalSkips(now).filter((row) => overrideEmailKey(row) !== key));
}

export function stampRosterOverrides(roster, overrides) {
  const list = Array.isArray(overrides) ? overrides : [];
  return (roster || []).map((client) => {
    const key = normalizeEmailLower(client?.email);
    if (!key) return client;
    const override = list.find((row) => overrideEmailKey(row) === key);
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
