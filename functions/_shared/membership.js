/* ==================================================================
   Alumni membership helpers (stage 4)
   ==================================================================
   Opt-in only — never create a Stripe subscription without a mama tap.
   Founding free month: programEnd → programEnd+30d access without a sub;
   after that, login/app requires trialing|active (or alumni_19 save tier).
   August and later: no post-program free month; paywall at programEnd.
   ================================================================== */

import {
  cohortByLabel,
  displayNameForCohortLabel,
  freeMonthEndsAt,
  hasFoundingFreeMonth,
  isProgramComplete,
  programLastDayIso,
  programWeekNumber,
} from "./cohorts.js";
import {
  ensureChannelMembership,
  getAlumniConversation,
} from "./channels.js";
import { alumniPriceId } from "./pricing.js";

/** Access-granting statuses (past_due keeps access while Stripe retries). */
const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

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
 * Founding: pin to free-month end (~Oct 21) so nothing charges during the perk.
 * Later cohorts: pin to programEnd only (so they are not charged during the
 * 8 weeks they already paid for). After programEnd, no trial.
 */
export function trialEndUnixForCheckout(profile, now = new Date()) {
  const cohort = cohortByLabel(profile?.cohort_label);
  const endIso = hasFoundingFreeMonth(cohort)
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

export async function buildSubscriptionPayload(env, profile, now = new Date()) {
  const access = membershipAccess(profile, now);
  const priceId = alumniPriceId(env);
  const status = String(profile.subscription_status || "");
  const active = hasActiveMembership(profile);

  const benefits = [
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
    return {
      status: displayStatus,
      priceLabel: "Founding Mama membership",
      amount: 49,
      currency: "usd",
      renewsAt: periodEnd || null,
      trialEndsAt: status === "trialing" ? (trialEnd || null) : null,
      cancelAtPeriodEnd: false,
      periodLabel: periodEnd
        ? (status === "trialing"
          ? (hasFoundingFreeMonth(profile.cohort_label)
            ? `Free month through ${formatShortDate(trialEnd || periodEnd)} · first charge after that`
            : `First charge after ${formatShortDate(trialEnd || periodEnd)}`)
          : `Current period through ${formatShortDate(periodEnd)}`)
        : null,
      canSubscribe: false,
      benefits,
      note: status === "trialing"
        ? (hasFoundingFreeMonth(profile.cohort_label)
          ? "You're in your free month — nothing charges until the trial ends."
          : "Nothing charges until the trial ends.")
        : status === "past_due"
          ? "Your latest membership payment didn’t go through. Update your card — access stays open while Stripe retries."
          : "Your monthly membership is active.",
      access,
      priceConfigured: !!priceId,
      hasFreeMonth: hasFoundingFreeMonth(profile.cohort_label),
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
      periodLabel: null,
      canSubscribe: false,
      benefits,
      note: "You're on the $19 app-access save rate. Alumni chat and Library stay off this plan.",
      access,
      priceConfigured: !!priceId,
      hasFreeMonth: hasFoundingFreeMonth(profile.cohort_label),
    };
  }

  // Eligible to opt in (during program, founding free month, or after — resubscribe).
  const freeEnd = access.freeMonthEndsAt;
  const founding = hasFoundingFreeMonth(access.cohortLabel);
  const inFreeMonth = access.reason === "free_month";
  const beforeProgramEnd = access.reason === "in_program";
  const afterProgram = access.paywall;
  const programLastDay = programLastDayIso(access.cohortLabel) || access.programEnd;

  let note;
  if (founding && (beforeProgramEnd || inFreeMonth)) {
    note = `Founding Members get one month of monthly membership free starting ${formatShortDate(access.programEnd)} (through ${formatShortDate(freeEnd)}). Opt in below — nothing charges until that free month ends. You can subscribe early; the free period still applies.`;
  } else if (beforeProgramEnd) {
    note = `You can opt in to $49/mo anytime. If you subscribe during the 8 weeks, your first charge waits until the program ends${programLastDay ? ` (${formatShortDate(programLastDay)})` : ""}.`;
  } else if (afterProgram) {
    note = founding
      ? "Your free month has ended. Subscribe to keep using the app — resubscribing does not include another free trial."
      : "Your 8-week program has ended. Subscribe to keep using the app.";
  } else {
    note = "Opt in to monthly membership when you're ready. Nothing charges until you do.";
  }

  return {
    status: afterProgram ? "required" : "available",
    priceLabel: "Founding Mama membership",
    amount: 49,
    currency: "usd",
    renewsAt: null,
    trialEndsAt: founding ? freeEnd : (beforeProgramEnd ? access.programEnd : null),
    cancelAtPeriodEnd: false,
    periodLabel: founding && freeEnd
      ? `Free month covers ${formatShortDate(access.programEnd)} – ${formatShortDate(freeEnd)}`
      : null,
    canSubscribe: !!priceId && !!profile.paid && !profile.refunded,
    benefits,
    note,
    access,
    priceConfigured: !!priceId,
    hasFreeMonth: founding,
  };
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
  if (customerId) {
    patch.stripe_customer_id = customerId;
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
