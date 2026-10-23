import {
  cohortByLabel,
  freeMonthEndsAt,
  isProgramComplete,
  postProgramFreeMonthKind,
  programLastDayIso,
} from "./cohorts";

const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

export function hasActiveMembership(profile) {
  const status = String(profile?.subscription_status || "");
  if (ACTIVE_SUB_STATUSES.has(status)) return true;
  if (profile?.tier === "alumni_19") return true;
  return false;
}

/**
 * Client-side mirror of functions/_shared/membership.js membershipAccess.
 * Founding and August: gate after the free / courtesy month.
 * November+: gate at programEnd.
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
 * Home-dashboard pay card, shown once the free or courtesy month is over.
 * Founding names their perk. August names Callie's courtesy month.
 */
export function membershipPayPromptCopy(profile) {
  const kind = postProgramFreeMonthKind(profile?.cohort_label);
  const price = `$${ALUMNI_MONTHLY_AMOUNT}`;
  const button = `Pay ${price}/mo`;
  if (kind === "founding") {
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
  if (kind === "courtesy") {
    return {
      eyebrow: "Monthly membership",
      price,
      period: "per month",
      title: "Your courtesy month has ended",
      body: `Callie's courtesy month was one month free of this membership. Pay ${price} a month to keep logging meals, your ranges, progress, and Alumni chat.`,
      button,
      fine: "Opens Stripe checkout. It starts today. Cancel anytime from Payments.",
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

function formatUtcLong(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

const COURTESY_INCLUDES = [
  "Your ranges, meal logging, and progress history",
  "Alumni chat with Callie and the other grads",
];

/**
 * Today note for August Group before and during Callie's courtesy month.
 * Null once she is already paying, or once the month is over (the pay card takes over).
 */
export function courtesyMonthCopy(profile, now = new Date()) {
  if (postProgramFreeMonthKind(profile?.cohort_label) !== "courtesy") return null;
  const status = String(profile?.subscription_status || "");
  if (status === "active" || status === "past_due" || profile?.tier === "alumni_19") return null;

  const access = membershipAccess(profile, now);
  const cohort = cohortByLabel(profile?.cohort_label);
  const endLabel = formatUtcLong(access.freeMonthEndsAt || freeMonthEndsAt(cohort));
  const includes = COURTESY_INCLUDES;

  if (status === "trialing") {
    const until = formatUtcLong(profile?.subscription_trial_end) || endLabel;
    return {
      phase: "trialing",
      eyebrow: "From Callie",
      title: "Your courtesy month is set",
      lead: `Your card is saved. This is the $49 monthly membership, and the first charge waits until ${until}.`,
      expectation: "That first month is the courtesy month Callie is giving August Group — one month free of this tier.",
      includes,
      button: null,
      fine: "Cancel anytime from Payments before the charge.",
    };
  }

  if (access.reason !== "in_program" && access.reason !== "free_month") return null;

  const inFreeMonth = access.reason === "free_month";
  const startLabel = formatUtcLong(cohort?.programEnd);
  const lastDayLabel = formatUtcLong(programLastDayIso(cohort));
  return {
    phase: inFreeMonth ? "free_month" : "in_program",
    eyebrow: "From Callie",
    title: inFreeMonth ? "You're in your courtesy month" : "A courtesy month of the new membership",
    lead: inFreeMonth
      ? `You're in the courtesy month Callie is giving August Group. It runs through ${endLabel}.`
      : `Callie is giving August Group one month of the monthly membership, free. Your 8 weeks wrap up ${lastDayLabel}. The courtesy month starts ${startLabel} and runs through ${endLabel}.`,
    expectation: `This is one month free of the new tier — the monthly membership that follows the 8 weeks. After ${endLabel}, it is $49 a month if you keep it.`,
    includes,
    button: "Add my membership",
    fine: `The app stays open through ${endLabel} either way. Adding membership now means the first charge waits until then.`,
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
    if (subscription?.freeMonthKind === "courtesy") {
      return `You'll confirm ${price} in Stripe. The courtesy month has ended, so membership starts when you pay.`;
    }
    return `You'll confirm ${price} in Stripe. Membership starts when you pay.`;
  }
  if (subscription?.freeMonthKind === "courtesy") {
    return "You'll confirm in Stripe. Nothing charges until you opt in — and the first charge waits until Callie's courtesy month ends.";
  }
  if (subscription?.hasFreeMonth) {
    return "You'll confirm in Stripe. Nothing charges until you opt in — and the first charge waits until your free month ends.";
  }
  if (subscription?.trialEndsAt) {
    return "You'll confirm in Stripe. Nothing charges until you opt in — the first charge waits until the program ends.";
  }
  return "You'll confirm in Stripe. Nothing charges until you opt in.";
}

/** Payments opt-in CTA. August's courtesy month is named; November is not offered one. */
export function membershipOptInButtonLabel(subscription) {
  if (subscription?.status === "required") return `Pay $${ALUMNI_MONTHLY_AMOUNT}/mo`;
  if (subscription?.freeMonthKind === "courtesy") {
    return `Add membership — courtesy month, then $${ALUMNI_MONTHLY_AMOUNT}/mo`;
  }
  if (subscription?.hasFreeMonth) return `Start free month — then $${ALUMNI_MONTHLY_AMOUNT}/mo`;
  return `Subscribe — $${ALUMNI_MONTHLY_AMOUNT}/mo`;
}
