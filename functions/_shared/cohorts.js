/* ==================================================================
   Cohort calendar — enrollment windows + program period dates
   ==================================================================
   windowStart/windowEnd: when paid checkouts stamp this cohort_label.
   programStart: Monday of official Week 1 (8-week coaching period).
   programEnd: exclusive — day after the last program day.
   Founding only: alumni free month starts at programEnd (Sep 21 → ~Oct 21).
   August and later: no post-program free month; paywall at programEnd unless subscribed.
   Early payers may have a free “Week 0” before programStart (Jul 20–26).
   ================================================================== */

/** Canonical cohorts. Add a new row when doors open for the next group. */
export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    /** Inclusive start (UTC) for stamping this cohort on payment */
    windowStart: "2026-07-01T00:00:00.000Z",
    /** Exclusive end */
    windowEnd: "2026-08-10T00:00:00.000Z",
    /** Monday of official Week 1 */
    programStart: "2026-07-27T00:00:00.000Z",
    /** Exclusive end / founding free-month start (last program day = Sep 20) */
    programEnd: "2026-09-21T00:00:00.000Z",
  },
  {
    label: "2026-08",
    displayName: "August Group",
    windowStart: "2026-08-10T00:00:00.000Z",
    windowEnd: "2026-09-21T00:00:00.000Z",
    /** Monday of official Week 1 — matches join/marketing copy. */
    programStart: "2026-08-31T00:00:00.000Z",
    /** Exclusive end (last program day = Oct 25). No post-program free month. */
    programEnd: "2026-10-26T00:00:00.000Z",
  },
];

/** Founding Members only — post-program free month is not a later-cohort perk. */
export const FOUNDING_COHORT_LABEL = "2026-07";

/** Free alumni month length after programEnd (founding: Sep 21 → Oct 21). */
export const FREE_MONTH_DAYS = 30;

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
      programEnd: null,
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

/** True only for Founding (2026-07). August and later do not get a free month. */
export function hasFoundingFreeMonth(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  return cohort?.label === FOUNDING_COHORT_LABEL;
}

/** Founding: programEnd + FREE_MONTH_DAYS. Other cohorts: null. */
export function freeMonthEndsAt(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!hasFoundingFreeMonth(cohort) || !cohort?.programEnd) return null;
  const start = Date.parse(cohort.programEnd);
  if (!Number.isFinite(start)) return null;
  return new Date(start + FREE_MONTH_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Inclusive last calendar day of the 8-week program (day before exclusive programEnd). */
export function programLastDayIso(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programEnd) return null;
  const end = Date.parse(cohort.programEnd);
  if (!Number.isFinite(end)) return null;
  return new Date(end - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Program week from programStart.
 * 0 = early-access week(s) before official Week 1
 * 1–8 = in-program
 * week = floor((today − programStart)/7) + 1, clamped to 0…8
 */
export function programWeekNumber(cohortOrLabel, now = new Date()) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programStart) return null;
  const start = Date.parse(cohort.programStart);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(t)) return null;
  if (t < start) return 0;
  const week = Math.floor((t - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(week, 0), 8);
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
