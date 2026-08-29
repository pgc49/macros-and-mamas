import { AUGUST_COHORT_LABEL } from "./cohorts";

export const NOTIFICATIONS_TIP_COHORT = AUGUST_COHORT_LABEL;
export const NOTIFICATIONS_TIP_STORAGE_KEY = "mm_notifications_tip_dismissed";

export function queryFlag(name) {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

/** Today-page notify tip is Cohort 2 only — Founding already saw the first-week cards. */
export function shouldShowNotificationsTip({
  cohortLabel,
  permission,
  dismissedLocally,
  demo = false,
} = {}) {
  if (demo) return permission !== "granted" && !dismissedLocally;
  if (String(cohortLabel || "").trim() !== NOTIFICATIONS_TIP_COHORT) return false;
  if (dismissedLocally) return false;
  if (permission === "granted") return false;
  return true;
}
