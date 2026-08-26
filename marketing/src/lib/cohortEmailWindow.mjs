/**
 * Honest cohort dates for unpaid sales mail (PT).
 * Doors close Aug 27 so Callie can hand-build ranges before Mon Aug 31.
 * Last unpaid sales mail may send on Aug 26 PT, never on or after Aug 27 PT.
 * Track A last quiz email waits until 8:00 AM PT that morning (hourly cron is :15 UTC).
 */

export const PACIFIC_TZ = "America/Los_Angeles";
export const DOORS_CLOSE_YMD = "2026-08-27";
export const LAST_UNPAID_SALES_YMD = "2026-08-26";
/** First hour (0–23 PT) the last quiz sales email may send on Aug 26. */
export const LAST_QUIZ_SALES_HOUR_PT = 8;

export function pacificYmd(nowMs) {
  if (!Number.isFinite(nowMs)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function isOnOrAfterDoorsClosePt(nowMs) {
  const ymd = pacificYmd(nowMs);
  return Boolean(ymd) && ymd >= DOORS_CLOSE_YMD;
}

export function isLastUnpaidSalesDayPt(nowMs) {
  return pacificYmd(nowMs) === LAST_UNPAID_SALES_YMD;
}

/** First millisecond of a Pacific calendar day (DST-safe). */
export function firstInstantOfPacificYmd(ymd) {
  const target = String(ymd || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return NaN;
  const utcMidnight = Date.parse(`${target}T00:00:00.000Z`);
  if (!Number.isFinite(utcMidnight)) return NaN;
  let t = utcMidnight - 16 * 60 * 60 * 1000;
  const end = utcMidnight + 16 * 60 * 60 * 1000;
  while (t <= end && pacificYmd(t) !== target) t += 60 * 60 * 1000;
  if (pacificYmd(t) !== target) return NaN;
  while (pacificYmd(t - 1) === target) t -= 1;
  return t;
}

export function lastUnpaidSalesDayStartMs() {
  return firstInstantOfPacificYmd(LAST_UNPAID_SALES_YMD);
}

/** First millisecond the last Track A quiz email may send (Aug 26 8:00 AM PT). */
export function lastQuizSalesOpenMs() {
  const start = lastUnpaidSalesDayStartMs();
  if (!Number.isFinite(start)) return NaN;
  return start + LAST_QUIZ_SALES_HOUR_PT * 60 * 60 * 1000;
}

export function isLastQuizSalesWindowOpenPt(nowMs) {
  if (!Number.isFinite(nowMs)) return false;
  if (isOnOrAfterDoorsClosePt(nowMs)) return false;
  const open = lastQuizSalesOpenMs();
  return Number.isFinite(open) && nowMs >= open;
}
