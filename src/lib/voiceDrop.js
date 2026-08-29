import { adminCohortName } from "./cohorts";

/** Short label for Callie's live-drop cards. */
export function voiceDropAudienceName(audience, cohortLabel) {
  const who = String(audience || "").toLowerCase();
  if (who === "admins") return "Admins only";
  if (who === "all_mamas") return "All mamas";
  if (who === "active") return `${adminCohortName(cohortLabel)} · active`;
  return who || "unknown";
}
