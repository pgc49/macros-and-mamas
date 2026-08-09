/* ==================================================================
   Cohort calendar — enrollment windows + program period dates
   ==================================================================
   windowStart/windowEnd: when paid checkouts stamp this cohort_label.
   programStart: first day of the 8-week coaching period.
   programEnd: always programStart + 56 days (do not hand-edit ends).
   Alumni free month starts at programEnd; freeMonthEnds = programEnd + 30d.
   ================================================================== */

/** 8 weeks in days. */
export const PROGRAM_LENGTH_DAYS = 56;

/** Free alumni month length after programEnd. */
export const FREE_MONTH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Canonical cohorts. Set programStart; end is derived. */
export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    windowStart: "2026-07-01T00:00:00.000Z",
    windowEnd: "2026-08-10T00:00:00.000Z",
    /** Program Mondays (UTC date anchors) */
    programStart: "2026-07-20T00:00:00.000Z",
  },
  {
    label: "2026-08",
    displayName: "August Group",
    windowStart: "2026-08-10T00:00:00.000Z",
    windowEnd: "2026-09-21T00:00:00.000Z",
    /** Week 1 Monday → end = Oct 26 */
    programStart: "2026-08-31T00:00:00.000Z",
  },
];

function addDaysIso(iso, days) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * DAY_MS).toISOString();
}

/** Currently enrolling cohort for new paid checkouts (C2). */
export function openEnrollmentCohort(env) {
  const fromEnv = String(env?.OPEN_COHORT_LABEL || "").trim();
  if (fromEnv) {
    const hit = COHORT_CALENDAR.find((c) => c.label === fromEnv);
    if (hit) return hit;
    return {
      label: fromEnv,
      displayName: fromEnv,
      windowStart: null,
      windowEnd: null,
      programStart: null,
    };
  }
  return COHORT_CALENDAR.find((c) => c.label === "2026-08") || COHORT_CALENDAR[COHORT_CALENDAR.length - 1];
}

/** Resolve cohort from a timestamp (activation or paid_at). */
export function cohortForDate(isoOrDate) {
  const t = new Date(isoOrDate || Date.now()).getTime();
  if (!Number.isFinite(t)) return openEnrollmentCohort({});
  for (const c of COHORT_CALENDAR) {
    const start = Date.parse(c.windowStart);
    const end = Date.parse(c.windowEnd);
    if (t >= start && t < end) return c;
  }
  if (t < Date.parse(COHORT_CALENDAR[0].windowStart)) return COHORT_CALENDAR[0];
  return COHORT_CALENDAR[COHORT_CALENDAR.length - 1];
}

export function cohortByLabel(label) {
  const key = String(label || "").trim();
  if (!key) return null;
  return COHORT_CALENDAR.find((c) => c.label === key) || null;
}

export function displayNameForCohortLabel(label) {
  const hit = cohortByLabel(label);
  return hit?.displayName || label || "Group";
}

/** programStart + 56 days, or null if programStart unset. */
export function programEndAt(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programStart) return null;
  return addDaysIso(cohort.programStart, PROGRAM_LENGTH_DAYS);
}

/** programEnd + FREE_MONTH_DAYS, or null if programStart unset. */
export function freeMonthEndsAt(cohortOrLabel) {
  const end = programEndAt(cohortOrLabel);
  if (!end) return null;
  return addDaysIso(end, FREE_MONTH_DAYS);
}

/**
 * Program week 1–8 from programStart.
 * week = min(floor((today − programStart)/7) + 1, 8)
 */
export function programWeekNumber(cohortOrLabel, now = new Date()) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programStart) return null;
  const start = Date.parse(cohort.programStart);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(t)) return null;
  if (t < start) return 1;
  const week = Math.floor((t - start) / (7 * DAY_MS)) + 1;
  return Math.min(Math.max(week, 1), 8);
}

export function isProgramComplete(cohortOrLabel, now = new Date()) {
  const endIso = programEndAt(cohortOrLabel);
  if (!endIso) return false;
  const end = Date.parse(endIso);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(end) && Number.isFinite(t) && t >= end;
}
