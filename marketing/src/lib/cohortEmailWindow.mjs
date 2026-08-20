/**
 * Honest cohort dates for unpaid sales mail (PT).
 * Doors close Aug 27 so Callie can hand-build ranges before Mon Aug 31.
 * Last unpaid sales mail may send on Aug 26 PT, never on or after Aug 27 PT.
 */

export const PACIFIC_TZ = "America/Los_Angeles";
export const DOORS_CLOSE_YMD = "2026-08-27";
export const LAST_UNPAID_SALES_YMD = "2026-08-26";

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
