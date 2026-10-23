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

/** Public alumni rate. Manual alumni_19 is a save tier, not this price. */
export const ALUMNI_MONTHLY_AMOUNT = 49;

/**
 * Home-dashboard pay card.
 * Founding copy names the ended free month. Later cohorts do not.
 */
export function membershipPayPromptCopy(profile) {
  const founding = hasFoundingFreeMonth(profile?.cohort_label);
  const price = `$${ALUMNI_MONTHLY_AMOUNT}`;
  const button = `Pay ${price}/mo`;
  if (founding) {
    return {
      eyebrow: "Founding Mama membership",
      price,
      period: "per month",
      title: "Your free month has ended",
      body: `Pay ${price} a month to keep logging meals, your ranges, progress, and Alumni chat. This Founding rate stays while you stay subscribed.`,
      button,
      fine: "Opens Stripe checkout. It starts today — no second free month. Cancel anytime from Payments.",
    };
  }
  return {
    eyebrow: "Monthly membership",
    price,
    period: "per month",
    title: "Your 8 weeks have ended",
    body: `Pay ${price} a month to keep logging meals, your ranges, progress, and Alumni chat.`,
    button,
    fine: "Opens Stripe checkout. Cancel anytime from Payments.",
  };
}

/** Membership gate body — same sentences as the home pay card. */
export function membershipGateMessage(profile) {
  return membershipPayPromptCopy(profile).body;
}

/**
 * Stripe footnote on Payments.
 * After the free month (or program end), do not say the first charge is still waiting.
 */
export function membershipCheckoutFinePrint(subscription) {
  const price = `$${ALUMNI_MONTHLY_AMOUNT}/mo`;
  if (subscription?.status === "required") {
    return `You'll confirm ${price} in Stripe. Membership starts when you pay.`;
  }
  if (subscription?.hasFreeMonth) {
    return "You'll confirm in Stripe. Nothing charges until you opt in — and the first charge waits until your free month ends.";
  }
  if (subscription?.trialEndsAt) {
    return "You'll confirm in Stripe. Nothing charges until you opt in — the first charge waits until the program ends.";
  }
  return "You'll confirm in Stripe. Nothing charges until you opt in.";
}

/** Payments opt-in CTA — do not promise a free month to August+. */
export function membershipOptInButtonLabel(subscription) {
  if (subscription?.status === "required") return `Pay $${ALUMNI_MONTHLY_AMOUNT}/mo`;
  if (subscription?.hasFreeMonth) return `Start free month — then $${ALUMNI_MONTHLY_AMOUNT}/mo`;
  return `Subscribe — $${ALUMNI_MONTHLY_AMOUNT}/mo`;
}
