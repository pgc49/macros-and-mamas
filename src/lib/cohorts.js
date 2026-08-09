/* Keep program dates in sync with functions/_shared/cohorts.js */

export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    programStart: "2026-07-20T00:00:00.000Z",
    programEnd: "2026-09-14T00:00:00.000Z",
  },
  {
    label: "2026-08",
    displayName: "August Group",
    programStart: null,
    programEnd: null,
  },
];

export const FREE_MONTH_DAYS = 30;

export function cohortByLabel(label) {
  const key = String(label || "").trim();
  if (!key) return null;
  return COHORT_CALENDAR.find((c) => c.label === key) || null;
}

export function freeMonthEndsAt(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programEnd) return null;
  const start = Date.parse(cohort.programEnd);
  if (!Number.isFinite(start)) return null;
  return new Date(start + FREE_MONTH_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isProgramComplete(cohortOrLabel, now = new Date()) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programEnd) return false;
  const end = Date.parse(cohort.programEnd);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(end) && Number.isFinite(t) && t >= end;
}
