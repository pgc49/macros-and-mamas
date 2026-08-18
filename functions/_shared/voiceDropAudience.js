/**
 * Monday voice-drop notify targeting.
 * `active` is one cohort's actives — never every status=active mama.
 */

export function filterVoiceDropNotifyRows(rows, { audience, cohortLabel } = {}) {
  const wanted = String(cohortLabel || "").trim();
  return (rows || [])
    .filter((r) => {
      if (r.refunded) return false;
      const role = String(r.role || "").toLowerCase();
      if (audience === "admins") return role === "admin";
      if (role === "admin") return false;
      if (audience === "active") {
        if (String(r.status || "") !== "active") return false;
        if (!wanted) return false;
        return String(r.cohort_label || "") === wanted;
      }
      return true;
    })
    .map((r) => r.id)
    .filter(Boolean);
}
