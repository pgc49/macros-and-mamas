/* ==================================================================
   Cohort calendar — maps activation/payment windows → cohort_label
   ================================================================== */

/** Canonical cohorts. Add a new row when doors open for the next group. */
export const COHORT_CALENDAR = [
  {
    label: "2026-07",
    displayName: "Founding Members",
    /** Inclusive start (UTC) for stamping this cohort */
    windowStart: "2026-07-01T00:00:00.000Z",
    /** Exclusive end */
    windowEnd: "2026-08-10T00:00:00.000Z",
  },
  {
    label: "2026-08",
    displayName: "August Group",
    windowStart: "2026-08-10T00:00:00.000Z",
    windowEnd: "2026-09-21T00:00:00.000Z",
  },
];

/** Currently enrolling cohort for new paid checkouts (C2). */
export function openEnrollmentCohort(env) {
  const fromEnv = String(env.OPEN_COHORT_LABEL || "").trim();
  if (fromEnv) {
    const hit = COHORT_CALENDAR.find((c) => c.label === fromEnv);
    if (hit) return hit;
    return { label: fromEnv, displayName: fromEnv, windowStart: null, windowEnd: null };
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
  // After last window → latest cohort; before first → first.
  if (t < Date.parse(COHORT_CALENDAR[0].windowStart)) return COHORT_CALENDAR[0];
  return COHORT_CALENDAR[COHORT_CALENDAR.length - 1];
}

export function displayNameForCohortLabel(label) {
  const hit = COHORT_CALENDAR.find((c) => c.label === label);
  return hit?.displayName || label || "Group";
}
