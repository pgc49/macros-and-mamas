/* ==================================================================
   Alumni membership helpers (stage 4)
   ==================================================================
   Opt-in only — never create a Stripe subscription without a mama tap.
   Founding free month: programEnd → programEnd+30d access without a sub.
   August courtesy month: same window, framed as one free month of the $49 tier.
   After either window, the app requires trialing|active (or alumni_19).
   November and later: no post-program free month; paywall at programEnd.
   ================================================================== */

import {
  cohortByLabel,
  displayNameForCohortLabel,
  freeMonthEndsAt,
  hasPostProgramFreeMonth,
  isProgramComplete,
  postProgramFreeMonthKind,
  programLastDayIso,
  programWeekNumber,
} from "./cohorts.js";
import {
  ensureChannelMembership,
  getAlumniConversation,
} from "./channels.js";
import { alumniPriceId } from "./pricing.js";
import { reusableStripeCustomerId } from "./stripeCustomer.js";

/** Access-granting statuses (past_due keeps access while Stripe retries). */
const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

/** Stripe statuses that mean the monthly membership is over. */
const ENDED_SUB_STATUSES = new Set([
  "canceled",
  "cancelled",
  "unpaid",
  "incomplete_expired",
]);

function supabaseConfig(env) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { base, key };
}

async function sbFetch(env, path, init = {}) {
  const { base, key } = supabaseConfig(env);
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    const err = new Error(`supabase ${resp.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function hasActiveMembership(profile) {
  const status = String(profile?.subscription_status || "");
  if (ACTIVE_SUB_STATUSES.has(status)) return true;
  // Manual $19 save tier keeps the app (no Alumni / Library).
  if (profile?.tier === "alumni_19") return true;
  return false;
}

/**
 * Whether the mama may use the app after the 8-week program.
 * During the free month they may defer opt-in; afterward they must subscribe.
 */
export function membershipAccess(profile, now = new Date()) {
  if (!profile) {
    return { allowed: false, reason: "no_profile", paywall: false };
  }
  if (profile.role === "admin") {
    return { allowed: true, reason: "admin", paywall: false };
  }
  if (profile.refunded) {
    return { allowed: false, reason: "refunded", paywall: false };
  }
  if (!profile.paid) {
    return { allowed: false, reason: "unpaid", paywall: false };
  }

  const cohort = cohortByLabel(profile.cohort_label);
  const freeEndIso = freeMonthEndsAt(cohort);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);

  // No program dates yet — do not block (admin / test / unstamped).
  if (!cohort?.programEnd) {
    return {
      allowed: true,
      reason: "program_dates_unset",
      paywall: false,
      cohortLabel: cohort?.label || profile.cohort_label || null,
      cohortName: displayNameForCohortLabel(profile.cohort_label),
      programStart: cohort?.programStart || null,
      programEnd: cohort?.programEnd || null,
      freeMonthEndsAt: null,
    };
  }

  const programEnded = isProgramComplete(cohort, now);

  if (hasActiveMembership(profile)) {
    return {
      allowed: true,
      reason: "subscribed",
      paywall: false,
      cohortLabel: cohort.label,
      cohortName: displayNameForCohortLabel(cohort.label),
      programStart: cohort.programStart,
      programEnd: cohort.programEnd,
      freeMonthEndsAt: freeEndIso,
      programComplete: programEnded,
    };
  }

  // Still in 8-week program — full access.
  if (!programEnded) {
    return {
      allowed: true,
      reason: "in_program",
      paywall: false,
      cohortLabel: cohort.label,
      cohortName: displayNameForCohortLabel(cohort.label),
      programStart: cohort.programStart,
      programEnd: cohort.programEnd,
      freeMonthEndsAt: freeEndIso,
      programComplete: false,
    };
  }

  // Founding free alumni month only (opt-in optional). August+ paywalls here.
  if (freeEndIso) {
    const freeEnd = Date.parse(freeEndIso);
    if (Number.isFinite(freeEnd) && t < freeEnd) {
      return {
        allowed: true,
        reason: "free_month",
        paywall: false,
        cohortLabel: cohort.label,
        cohortName: displayNameForCohortLabel(cohort.label),
        programStart: cohort.programStart,
        programEnd: cohort.programEnd,
        freeMonthEndsAt: freeEndIso,
        programComplete: true,
      };
    }
  }

  return {
    allowed: false,
    reason: "membership_required",
    paywall: true,
    cohortLabel: cohort.label,
    cohortName: displayNameForCohortLabel(cohort.label),
    programStart: cohort.programStart,
    programEnd: cohort.programEnd,
    freeMonthEndsAt: freeEndIso,
    programComplete: true,
  };
}

/**
 * Trial end unix for Checkout.
 * Founding and August: pin to free-month end so nothing charges during that month.
 * Later cohorts: pin to programEnd only (so they are not charged during the
 * 8 weeks they already paid for). After that date, no trial.
 */
export function trialEndUnixForCheckout(profile, now = new Date()) {
  const cohort = cohortByLabel(profile?.cohort_label);
  const endIso = hasPostProgramFreeMonth(cohort)
    ? freeMonthEndsAt(cohort)
    : (cohort?.programEnd || null);
  if (!endIso) return null;
  const end = Date.parse(endIso);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(end) || end <= t + 60_000) return null;
  return Math.floor(end / 1000);
}

export function buildProgramSummaryFromCohort(profile, payments = []) {
  const latest = payments.find((p) => p.status === "succeeded") || payments[0] || null;
  const paidAt = profile.paid_at || latest?.created || null;
  const cohort = cohortByLabel(profile.cohort_label);
  // Live calendar only — never fall back to stale profiles.week (often stuck at 1).
  const week = programWeekNumber(cohort);
  const complete = isProgramComplete(cohort);
  const lastDay = programLastDayIso(cohort);
  let phase = "not_started";
  if (profile.paid) {
    if (complete) phase = "program_complete";
    else if (cohort?.programStart) phase = "in_program";
    else phase = "paid_access"; // admin / test / missing cohort stamp
  }
  return {
    paid: !!profile.paid,
    paidAt,
    week,
    phase,
    cohortLabel: profile.cohort_label || null,
    cohortName: cohort
      ? displayNameForCohortLabel(profile.cohort_label)
      : (profile.cohort_label || null),
    programStart: cohort?.programStart || null,
    /** Exclusive alumni start (internal). */
    programEnd: cohort?.programEnd || null,
    /** Inclusive last day of the 8 weeks (for Payments display). */
    programLastDay: lastDay,
    freeMonthEndsAt: freeMonthEndsAt(cohort),
    label: latest?.description || "8-week program",
    amount: latest?.amount ?? null,
    currency: latest?.currency || "usd",
    receiptUrl: latest?.receiptUrl || null,
  };
}

/**
 * True when Stripe will end this subscription without another charge.
 * `cancel_at_period_end` is the usual flag. A future `cancel_at` counts too.
 */
export function stripeCancelScheduled(stripeSub) {
  if (!stripeSub || typeof stripeSub !== "object") return false;
  if (stripeSub.cancel_at_period_end === true) return true;
  const cancelAt = Number(stripeSub.cancel_at);
  if (!Number.isFinite(cancelAt) || cancelAt <= 0) return false;
  return ACTIVE_SUB_STATUSES.has(String(stripeSub.status || ""));
}

/**
 * What the Payments page may offer.
 * Without a live Stripe subscription, an active profile can still cancel;
 * resume only appears once Stripe says the cancel is scheduled.
 */
export function membershipManageState(profile, stripeSub = null) {
  const status = String(stripeSub?.status || profile?.subscription_status || "");
  const subId = String(stripeSub?.id || profile?.stripe_subscription_id || "").trim();
  const manageable = ACTIVE_SUB_STATUSES.has(status);
  const scheduled = manageable && stripeCancelScheduled(stripeSub);
  const endSeconds = scheduled
    ? (stripeSub.cancel_at || stripeSub.current_period_end)
    : null;
  return {
    canCancel: manageable && !!subId && !scheduled,
    canResume: manageable && !!subId && scheduled,
    cancelAtPeriodEnd: scheduled,
    endsAt: isoFromStripeSeconds(endSeconds),
  };
}

/** Overlay Stripe's subscription onto the profile fields the payload reads. */
export function profileWithLiveSubscription(profile, stripeSub) {
  if (!profile || !stripeSub) return profile;
  const status = String(stripeSub.status || "").trim();
  const periodEnd = isoFromStripeSeconds(stripeSub.current_period_end);
  const trialEnd = isoFromStripeSeconds(stripeSub.trial_end);
  return {
    ...profile,
    stripe_subscription_id: stripeSub.id || profile.stripe_subscription_id,
    subscription_status: status || profile.subscription_status,
    subscription_current_period_end: periodEnd || profile.subscription_current_period_end,
    subscription_trial_end: trialEnd || profile.subscription_trial_end,
  };
}

/**
 * The subscription on this profile belongs to this mama.
 * A stored Customer id must match. If we never stored one, Checkout metadata
 * (`supabase_user_id`) is enough.
 */
export function subscriptionOwnedByProfile(profile, stripeSub, userId) {
  if (!stripeSub?.id) return false;
  const subCustomer = typeof stripeSub.customer === "string"
    ? stripeSub.customer
    : stripeSub.customer?.id || "";
  const profileCustomer = reusableStripeCustomerId(profile?.stripe_customer_id);
  if (profileCustomer && subCustomer) return profileCustomer === subCustomer;
  const metaUser = String(stripeSub.metadata?.supabase_user_id || "");
  return !!(userId && metaUser && metaUser === userId);
}

/**
 * Block a second Checkout while a membership is still open.
 * A scheduled cancel should be turned back on, not replaced with a new sub.
 * A live canceled subscription does not block. No live object + an open
 * profile status blocks, so a Stripe outage cannot start a duplicate.
 */
export function openMembershipBlocksCheckout(profile, stripeSub) {
  if (stripeSub && stripeSub.status) {
    const live = String(stripeSub.status);
    if (!ACTIVE_SUB_STATUSES.has(live)) return null;
    if (stripeCancelScheduled(stripeSub)) return "resume_available";
    return "already_subscribed";
  }
  if (ACTIVE_SUB_STATUSES.has(String(profile?.subscription_status || ""))) {
    return "already_subscribed";
  }
  return null;
}

export async function buildSubscriptionPayload(env, profile, now = new Date(), stripeSub = null) {
  profile = profileWithLiveSubscription(profile, stripeSub) || profile;
  const access = membershipAccess(profile, now);
  const priceId = alumniPriceId(env);
  const status = String(profile.subscription_status || "");
  const active = hasActiveMembership(profile);
  const kind = postProgramFreeMonthKind(profile.cohort_label);
  const courtesy = kind === "courtesy";

  const benefits = courtesy
    ? [
      "Your ranges, meal logging, and progress history",
      "Alumni chat with Callie and other grads",
      "$49/mo after the courtesy month, while you stay subscribed",
      "Q&A Library (monthly audio + weekly notes) as it rolls out",
    ]
    : [
      "Keep your macros, meal logging, and full progress history",
      "Alumni community chat with Callie and other grads",
      "Founding Mama rate: $49/mo locked in while you stay subscribed",
      "Q&A Library (monthly audio + weekly notes) as it rolls out",
    ];

  if (active && (status === "trialing" || status === "active" || status === "past_due")) {
    const periodEnd = profile.subscription_current_period_end || profile.subscription_trial_end;
    const trialEnd = profile.subscription_trial_end;
    const displayStatus = status === "trialing"
      ? "trialing"
      : status === "past_due"
        ? "past_due"
        : "active";
    const manage = membershipManageState(profile, stripeSub);
    const endLabel = formatShortDate(manage.endsAt);
    let periodLabel = periodEnd
      ? (status === "trialing"
        ? (kind === "founding"
          ? `Free month through ${formatShortDate(trialEnd || periodEnd)} · first charge after that`
          : kind === "courtesy"
            ? `Courtesy month through ${formatShortDate(trialEnd || periodEnd)} · first charge after that`
            : `First charge after ${formatShortDate(trialEnd || periodEnd)}`)
        : `Current period through ${formatShortDate(periodEnd)}`)
      : null;
    let note = status === "trialing"
      ? (kind === "founding"
        ? "You're in your free month — nothing charges until the trial ends."
        : kind === "courtesy"
          ? "Callie's courtesy month is on this membership. Nothing charges until the trial ends."
          : "Nothing charges until the trial ends.")
      : status === "past_due"
        ? "Your latest membership payment didn’t go through. Update your card — access stays open while Stripe retries."
        : "Your monthly membership is active.";
    if (manage.cancelAtPeriodEnd) {
      periodLabel = endLabel ? `Access through ${endLabel}` : "Access through the end of this period";
      if (status === "trialing") {
        note = endLabel
          ? `This membership ends ${endLabel}. Nothing will charge. You can turn it back on before then.`
          : "This membership is set to end. Nothing will charge. You can turn it back on before then.";
      } else if (status === "past_due") {
        note = endLabel
          ? `This membership ends ${endLabel}. You won’t be charged again. You can turn it back on before then.`
          : "This membership is set to end. You won’t be charged again. You can turn it back on before then.";
      } else {
        note = endLabel
          ? `This membership ends ${endLabel}. You keep access until then, and you won’t be charged again. You can turn it back on before then.`
          : "This membership is set to end. You keep access until then, and you won’t be charged again. You can turn it back on before then.";
      }
    }
    return {
      status: displayStatus,
      priceLabel: courtesy ? "Monthly membership" : "Founding Mama membership",
      amount: 49,
      currency: "usd",
      renewsAt: periodEnd || null,
      trialEndsAt: status === "trialing" ? (trialEnd || null) : null,
      cancelAtPeriodEnd: manage.cancelAtPeriodEnd,
      canCancel: manage.canCancel,
      canResume: manage.canResume,
      endsAt: manage.endsAt,
      resubscribe: false,
      periodLabel,
      canSubscribe: false,
      benefits,
      note,
      access,
      priceConfigured: !!priceId,
      hasFreeMonth: kind != null,
      freeMonthKind: kind,
    };
  }

  if (profile.tier === "alumni_19") {
    return {
      status: "alumni_19",
      priceLabel: "App access ($19/mo)",
      amount: 19,
      currency: "usd",
      renewsAt: profile.subscription_current_period_end || null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      canCancel: false,
      canResume: false,
      endsAt: null,
      resubscribe: false,
      periodLabel: null,
      canSubscribe: false,
      benefits,
      note: "You're on the $19 app-access save rate. Alumni chat and Library stay off this plan.",
      access,
      priceConfigured: !!priceId,
      hasFreeMonth: kind != null,
      freeMonthKind: kind,
    };
  }

  // Eligible to opt in (during program, free month, or after — resubscribe).
  const freeEnd = access.freeMonthEndsAt;
  const founding = kind === "founding";
  const inFreeMonth = access.reason === "free_month";
  const beforeProgramEnd = access.reason === "in_program";
  const afterProgram = access.paywall;
  const programLastDay = programLastDayIso(access.cohortLabel) || access.programEnd;

  let note;
  if (founding && (beforeProgramEnd || inFreeMonth)) {
    note = `Founding Members get one month of monthly membership free starting ${formatShortDate(access.programEnd)} (through ${formatShortDate(freeEnd)}). Opt in below — nothing charges until that free month ends. You can subscribe early; the free period still applies.`;
  } else if (courtesy && inFreeMonth) {
    note = `You're in Callie's courtesy month, through ${formatShortDate(freeEnd)}. This is one month free of the $49 monthly membership — your ranges, meal log, progress, and Alumni chat. After that date, it is $49/mo if you keep it. Opt in below to continue; nothing charges until the courtesy month ends.`;
  } else if (courtesy && beforeProgramEnd) {
    note = `Callie is giving August Group one month of the monthly membership, free. That is the new tier after the 8 weeks: your ranges, meal log, progress, and Alumni chat. The courtesy month starts ${formatShortDate(access.programEnd)} and runs through ${formatShortDate(freeEnd)}. After that, it is $49/mo if you keep it. Opt in below to continue it — nothing charges until the courtesy month ends. The app stays open through that month either way.`;
  } else if (beforeProgramEnd) {
    note = `You can opt in to $49/mo anytime. If you subscribe during the 8 weeks, your first charge waits until the program ends${programLastDay ? ` (${formatShortDate(programLastDay)})` : ""}.`;
  } else if (afterProgram) {
    note = founding
      ? "Your free month has ended. Pay $49/mo to keep logging, your ranges, and Alumni chat. This does not include another free month."
      : courtesy
        ? "Your courtesy month has ended. Pay $49/mo to keep logging, your ranges, and Alumni chat. That was one month free of this membership."
        : "Your 8-week program has ended. Pay $49/mo to keep logging, your ranges, and Alumni chat.";
  } else {
    note = "Opt in to monthly membership when you're ready. Nothing charges until you do.";
  }

  const freeMonthStillAhead = (founding || courtesy) && (beforeProgramEnd || inFreeMonth);
  const ended = ENDED_SUB_STATUSES.has(String(profile.subscription_status || ""));
  if (ended && afterProgram) {
    note = "Your monthly membership has ended. Subscribe again to keep logging, your ranges, and Alumni chat.";
  } else if (ended) {
    note = `Your monthly membership has ended. You can subscribe again below. ${note}`;
  }

  return {
    status: afterProgram ? "required" : "available",
    priceLabel: founding ? "Founding Mama membership" : "Monthly membership",
    amount: 49,
    currency: "usd",
    renewsAt: null,
    trialEndsAt: freeMonthStillAhead ? freeEnd : (beforeProgramEnd ? access.programEnd : null),
    cancelAtPeriodEnd: false,
    canCancel: false,
    canResume: false,
    endsAt: null,
    resubscribe: ended,
    periodLabel: freeMonthStillAhead && freeEnd
      ? (courtesy
        ? `Courtesy month covers ${formatShortDate(access.programEnd)} – ${formatShortDate(freeEnd)}`
        : `Free month covers ${formatShortDate(access.programEnd)} – ${formatShortDate(freeEnd)}`)
      : null,
    canSubscribe: !!priceId && !!profile.paid && !profile.refunded,
    benefits,
    note,
    access,
    priceConfigured: !!priceId,
    hasFreeMonth: founding || courtesy,
    freeMonthKind: kind,
  };
}

const MEMBERSHIP_CANCEL_PATHS = new Set([
  "/dashboard",
  "/account/payments",
  "/membership",
]);

/** Allowlisted Checkout cancel return. Unknown values stay on Payments. */
export function membershipCheckoutCancelPath(body) {
  const requested = String(body?.cancelPath || "");
  if (MEMBERSHIP_CANCEL_PATHS.has(requested)) return requested;
  return "/account/payments";
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function isoFromStripeSeconds(sec) {
  if (sec == null || sec === "") return null;
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/** Apply Stripe subscription object → profiles + Alumni channel when active/trialing. */
export async function syncSubscriptionToProfile(env, subscription, { userId: hintUserId } = {}) {
  const subId = String(subscription?.id || "").trim();
  if (!subId) return { skipped: "no_subscription" };

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  let userId = hintUserId || subscription.metadata?.supabase_user_id || null;

  if (!userId && customerId) {
    const rows = await sbFetch(
      env,
      `/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,tier,cohort_label&limit=1`,
      { method: "GET" },
    );
    userId = Array.isArray(rows) ? rows[0]?.id : null;
  }
  if (!userId) {
    console.warn("syncSubscriptionToProfile: no profile", subId, customerId);
    return { skipped: "no_profile" };
  }

  const status = String(subscription.status || "").trim() || null;
  const patch = {
    stripe_subscription_id: subId,
    subscription_status: status,
    subscription_current_period_end: isoFromStripeSeconds(subscription.current_period_end),
    subscription_trial_end: isoFromStripeSeconds(subscription.trial_end),
  };
  const reusableCustomer = reusableStripeCustomerId(customerId);
  if (reusableCustomer) {
    patch.stripe_customer_id = reusableCustomer;
  }

  const active = ACTIVE_SUB_STATUSES.has(status);
  if (active) {
    patch.tier = "alumni_49";
  } else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    // Don't clobber manual alumni_19.
    const rows = await sbFetch(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
      { method: "GET" },
    );
    const tier = Array.isArray(rows) ? rows[0]?.tier : null;
    if (tier !== "alumni_19") {
      patch.tier = "none";
    }
  }

  await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
      prefer: "return=minimal",
    },
  );

  if (active) {
    await joinAlumniChannel(env, userId);
  } else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    await removeAlumniMembership(env, userId);
  }

  return { ok: true, userId, status, tier: patch.tier };
}

export async function joinAlumniChannel(env, userId) {
  const conv = await getAlumniConversation(env);
  if (!conv) {
    console.error("joinAlumniChannel: missing alumni conversation");
    return null;
  }
  return ensureChannelMembership(env, {
    conversationId: conv.id,
    userId,
    notifyLevel: "highlights",
  });
}

export async function removeAlumniMembership(env, userId) {
  const conv = await getAlumniConversation(env);
  if (!conv || !userId) return;
  const now = new Date().toISOString();
  try {
    await sbFetch(
      env,
      `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conv.id)}&user_id=eq.${encodeURIComponent(userId)}&removed_at=is.null`,
      {
        method: "PATCH",
        body: JSON.stringify({ removed_at: now }),
        prefer: "return=minimal",
      },
    );
  } catch (e) {
    console.error("removeAlumniMembership failed", userId, e);
  }
}

/**
 * Schedule or undo cancel-at-period-end.
 * Stripe treats `cancel_at` and `cancel_at_period_end` as mutually exclusive,
 * so a timestamp cancel is cleared with an empty `cancel_at`.
 */
export async function setSubscriptionCancelAtPeriodEnd(env, subscriptionId, cancelAtPeriodEnd, stripeSub) {
  const secret = env?.STRIPE_SECRET_KEY;
  if (!secret || !subscriptionId) return { ok: false, status: 503 };
  const params = new URLSearchParams();
  if (cancelAtPeriodEnd) {
    params.set("cancel_at_period_end", "true");
  } else if (stripeSub?.cancel_at && stripeSub?.cancel_at_period_end !== true) {
    params.set("cancel_at", "");
  } else {
    params.set("cancel_at_period_end", "false");
  }
  const resp = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("stripe subscription update failed", data?.error?.code || resp.status);
    return { ok: false, status: resp.status };
  }
  return { ok: true, subscription: data };
}

/** Fetch subscription from Stripe by id. */
export async function fetchStripeSubscription(env, subscriptionId) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !subscriptionId) return null;
  const resp = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { authorization: `Bearer ${secret}` } },
  );
  if (!resp.ok) {
    console.error("fetchStripeSubscription failed", resp.status, await resp.text());
    return null;
  }
  return resp.json().catch(() => null);
}
