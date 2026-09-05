import { localDateIso, parseLocalDate } from "../utils/dates";

function calendarDaysBetween(earlierIso, laterIso) {
  const a = parseLocalDate(earlierIso).getTime();
  const b = parseLocalDate(laterIso).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * iMessage-style inbox stamp for a last-message time.
 * Today → 10:51 AM; yesterday → Yesterday; last 6 days → Friday; older → 8/10/26.
 */
export function formatInboxTimestamp(iso, now = new Date()) {
  if (!iso) return "";
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "";

  const today = localDateIso(now);
  const thenDay = localDateIso(then);
  const daysAgo = calendarDaysBetween(thenDay, today);

  if (daysAgo <= 0) {
    return then.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 6) {
    return then.toLocaleDateString("en-US", { weekday: "long" });
  }
  return then.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

/** Newest usable last-activity ISO among inbox fields. */
export function latestInboxIso(...candidates) {
  let best = "";
  let bestMs = -Infinity;
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = Date.parse(String(raw));
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = String(raw);
  }
  return best;
}
