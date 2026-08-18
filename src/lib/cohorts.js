/* Keep program dates in sync with functions/_shared/cohorts.js */

import { parseLocalDate, wkStartOf } from "../utils/dates";

export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    /** Monday of official Week 1 */
    programStart: "2026-07-27T00:00:00.000Z",
    /** Exclusive alumni start (last program day = Sep 20) */
    programEnd: "2026-09-21T00:00:00.000Z",
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

/** Short admin filter names — Founding vs the next group Callie is filling. */
export function adminCohortName(label) {
  const key = String(label || "").trim();
  if (!key) return "Unassigned";
  if (key === "2026-07") return "Founding";
  if (key === "2026-08") return "Cohort 2";
  return cohortByLabel(key)?.displayName || key;
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

/** Inclusive last calendar day of the 8-week program. */
export function programLastDayIso(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programEnd) return null;
  const end = Date.parse(cohort.programEnd);
  if (!Number.isFinite(end)) return null;
  return new Date(end - 24 * 60 * 60 * 1000).toISOString();
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

/**
 * Program week 0–8 from cohort programStart (live calendar math).
 * 0 = early-access week before official Week 1.
 * Keep in sync with functions/_shared/cohorts.js.
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

/** Monday YYYY-MM-DD of official Week 1 for a cohort label. */
export function programStartWeekIso(cohortOrLabel) {
  const cohort = typeof cohortOrLabel === "string"
    ? cohortByLabel(cohortOrLabel)
    : cohortOrLabel;
  if (!cohort?.programStart) return null;
  const day = String(cohort.programStart).slice(0, 10);
  return wkStartOf(parseLocalDate(day));
}

/**
 * Resolve Week-1 Monday for Today / Progress labels.
 * Prefer the mama's cohort; if missing (admin/test), use the in-flight
 * cohort that has locked program dates so Aug 10 reads as Week 3, not 4.
 */
export function resolveProgramStartWeekIso(cohortLabel = null, now = new Date()) {
  const fromProfile = programStartWeekIso(cohortLabel);
  if (fromProfile) return fromProfile;
  const live = COHORT_CALENDAR.find(
    (c) => c.programStart && !isProgramComplete(c, now),
  );
  if (live) return programStartWeekIso(live);
  const withDates = COHORT_CALENDAR.find((c) => c.programStart);
  return withDates ? programStartWeekIso(withDates) : null;
}

/**
 * Rhythm / Today week label number relative to official programStart.
 * Jul 20 (early) → 0, Jul 27 → 1, Aug 10 → 3.
 * Falls back to earliestWk-based numbering when no program anchor.
 */
export function programRelativeWeekNum(weekStart, programStartWeek, earliestWk = null) {
  if (programStartWeek && weekStart) {
    const a = parseLocalDate(weekStart).getTime();
    const b = parseLocalDate(programStartWeek).getTime();
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return Math.round((a - b) / (7 * 86400000)) + 1;
    }
  }
  if (!earliestWk || !weekStart) return 1;
  const a = parseLocalDate(weekStart).getTime();
  const b = parseLocalDate(earliestWk).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.round((a - b) / (7 * 86400000)) + 1;
}

export function programWeekLabel(weekStart, programStartWeek, earliestWk = null) {
  const n = programRelativeWeekNum(weekStart, programStartWeek, earliestWk);
  return `W${n}`;
}
