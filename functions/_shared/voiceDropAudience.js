/**
 * Monday voice-drop notify targeting + which live drop a publish replaces.
 * `active` is one cohort's actives — never every status=active mama.
 * Publishing Cohort 2 must not take down Founding's live drop (and the reverse).
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

/**
 * PostgREST filters for superseding live drops.
 * Returns null when we must not touch any live row (active with no cohort).
 */
export function voiceDropSupersedeQuery({ audience, cohortLabel } = {}) {
  const incoming = String(audience || "").toLowerCase();
  const wanted = String(cohortLabel || "").trim();
  if (incoming === "admins") {
    return { status: "eq.published", audience: "eq.admins" };
  }
  if (incoming === "active") {
    if (!wanted) return null;
    return {
      status: "eq.published",
      audience: "eq.active",
      cohort_label: `eq.${wanted}`,
    };
  }
  if (incoming === "all_mamas") {
    return { status: "eq.published", audience: "neq.admins" };
  }
  return { status: "eq.published" };
}
