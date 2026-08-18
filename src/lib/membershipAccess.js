import { cohortByLabel, freeMonthEndsAt, hasFoundingFreeMonth, isProgramComplete } from "./cohorts";

const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

export function hasActiveMembership(profile) {
  const status = String(profile?.subscription_status || "");
  if (ACTIVE_SUB_STATUSES.has(status)) return true;
  if (profile?.tier === "alumni_19") return true;
  return false;
}

/**
 * Client-side mirror of functions/_shared/membership.js membershipAccess.
 * Founding: gate after the free month. August+: gate at programEnd.
 */
export function membershipAccess(profile, now = new Date()) {
  if (!profile) return { allowed: false, reason: "no_profile", paywall: false };
  if (profile.role === "admin") return { allowed: true, reason: "admin", paywall: false };
  if (profile.refunded) return { allowed: false, reason: "refunded", paywall: false };
  if (!profile.paid) return { allowed: false, reason: "unpaid", paywall: false };

  const cohort = cohortByLabel(profile.cohort_label);
  const freeEndIso = freeMonthEndsAt(cohort);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);

  if (!cohort?.programEnd) {
    return { allowed: true, reason: "program_dates_unset", paywall: false };
  }

  if (hasActiveMembership(profile)) {
    return { allowed: true, reason: "subscribed", paywall: false, freeMonthEndsAt: freeEndIso };
  }

  if (!isProgramComplete(cohort, now)) {
    return { allowed: true, reason: "in_program", paywall: false, freeMonthEndsAt: freeEndIso };
  }

  if (freeEndIso) {
    const freeEnd = Date.parse(freeEndIso);
    if (Number.isFinite(freeEnd) && t < freeEnd) {
      return { allowed: true, reason: "free_month", paywall: false, freeMonthEndsAt: freeEndIso };
    }
  }

  return {
    allowed: false,
    reason: "membership_required",
    paywall: true,
    freeMonthEndsAt: freeEndIso,
  };
}

export function needsMembershipPaywall(profile, now = new Date()) {
  return membershipAccess(profile, now).paywall === true;
}

/** Membership gate body — founding mentions the ended free month; later cohorts do not. */
export function membershipGateMessage(profile) {
  if (hasFoundingFreeMonth(profile?.cohort_label)) {
    return "Your free month of Founding Mama membership has ended. Subscribe at $49/mo to keep logging meals, your ranges, progress history, and Alumni community access.";
  }
  return "Your 8-week program has ended. Subscribe at $49/mo to keep logging meals, your ranges, progress history, and Alumni community access.";
}

/** Payments opt-in CTA — do not promise a free month to August+. */
export function membershipOptInButtonLabel(subscription) {
  if (subscription?.status === "required") return "Subscribe to continue — $49/mo";
  if (subscription?.hasFreeMonth) return "Start free month — then $49/mo";
  return "Subscribe — $49/mo";
}
