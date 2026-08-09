/* Keep program dates in sync with functions/_shared/cohorts.js */

export const PROGRAM_LENGTH_DAYS = 56;
export const FREE_MONTH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    programStart: "2026-07-20T00:00:00.000Z",
  },
  {
    label: "2026-08",
    displayName: "August Group",
    programStart: "2026-08-31T00:00:00.000Z",
  },
];

function addDaysIso(iso, days) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * DAY_MS).toISOString();
}

export function cohortByLabel(label) {
  const key = String(label || "").trim();
  if (!key) return null;
  return COHORT_CALENDAR.find((c) => c.label === key) || null;
}

export function programEndAt(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programStart) return null;
  return addDaysIso(cohort.programStart, PROGRAM_LENGTH_DAYS);
}

export function freeMonthEndsAt(cohortOrLabel) {
  const end = programEndAt(cohortOrLabel);
  if (!end) return null;
  return addDaysIso(end, FREE_MONTH_DAYS);
}

export function isProgramComplete(cohortOrLabel, now = new Date()) {
  const endIso = programEndAt(cohortOrLabel);
  if (!endIso) return false;
  const end = Date.parse(endIso);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(end) && Number.isFinite(t) && t >= end;
}
