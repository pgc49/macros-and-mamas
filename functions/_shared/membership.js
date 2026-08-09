/* ==================================================================
   Alumni membership helpers (stage 4)
   ==================================================================
   Opt-in only — never create a Stripe subscription without a mama tap.
   Founding free month: programEnd → programEnd+30d access without a sub;
   after that, login/app requires trialing|active (or alumni_19 save tier).
   ================================================================== */

import {
  cohortByLabel,
  displayNameForCohortLabel,
  freeMonthEndsAt,
  isProgramComplete,
  programEndAt,
  programWeekNumber,
} from "./cohorts.js";
import {
  ensureChannelMembership,
  getAlumniConversation,
  getCohortConversation,
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
  const programEnd = programEndAt(cohort);
  const freeEndIso = freeMonthEndsAt(cohort);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);

  // No program dates yet — do not block.
  if (!programEnd || !freeEndIso) {
    return {
      allowed: true,
      reason: "program_dates_unset",
      paywall: false,
      cohortLabel: cohort?.label || profile.cohort_label || null,
      cohortName: displayNameForCohortLabel(profile.cohort_label),
      programStart: cohort?.programStart || null,
      programEnd: null,
      freeMonthEndsAt: null,
    };
  }

  const freeEnd = Date.parse(freeEndIso);
  const programEnded = isProgramComplete(cohort, now);

  if (hasActiveMembership(profile)) {
    return {
      allowed: true,
      reason: "subscribed",
      paywall: false,
      cohortLabel: cohort.label,
      cohortName: displayNameForCohortLabel(cohort.label),
      programStart: cohort.programStart,
      programEnd,
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
      programEnd,
      freeMonthEndsAt: freeEndIso,
      programComplete: false,
    };
  }

  // Free alumni month (opt-in optional).
  if (Number.isFinite(freeEnd) && t < freeEnd) {
    return {
      allowed: true,
      reason: "free_month",
      paywall: false,
      cohortLabel: cohort.label,
      cohortName: displayNameForCohortLabel(cohort.label),
      programStart: cohort.programStart,
      programEnd,
      freeMonthEndsAt: freeEndIso,
      programComplete: true,
    };
  }

  // Free month over — must pay.
  return {
    allowed: false,
    reason: "membership_required",
    paywall: true,
    cohortLabel: cohort.label,
    cohortName: displayNameForCohortLabel(cohort.label),
    programStart: cohort.programStart,
    programEnd,
    freeMonthEndsAt: freeEndIso,
    programComplete: true,
  };
}

/** Trial end unix for Checkout: pin to free-month end when still in the future. */
export function trialEndUnixForCheckout(profile, now = new Date()) {
  const cohort = cohortByLabel(profile?.cohort_label);
  const freeEndIso = freeMonthEndsAt(cohort);
  if (!freeEndIso) return null;
  const freeEnd = Date.parse(freeEndIso);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(freeEnd) || freeEnd <= t + 60_000) return null;
  return Math.floor(freeEnd / 1000);
}

export function buildProgramSummaryFromCohort(profile, payments = []) {
  const latest = payments.find((p) => p.status === "succeeded") || payments[0] || null;
  const paidAt = profile.paid_at || latest?.created || null;
  const cohort = cohortByLabel(profile.cohort_label);
  const week = programWeekNumber(cohort) ?? (Number(profile.week) || 0);
  const complete = isProgramComplete(cohort);
  let phase = "not_started";
  if (profile.paid) {
    phase = complete ? "program_complete" : "in_program";
  }
  return {
    paid: !!profile.paid,
    paidAt,
    week,
    phase,
    cohortLabel: profile.cohort_label || null,
    cohortName: displayNameForCohortLabel(profile.cohort_label),
    programStart: cohort?.programStart || null,
    programEnd: programEndAt(cohort),
    freeMonthEndsAt: freeMonthEndsAt(cohort),
    label: latest?.description || "8-week program",
    amount: latest?.amount ?? null,
    currency: latest?.currency || "usd",
    receiptUrl: latest?.receiptUrl || null,
  };
}

export async function buildSubscriptionPayload(env, profile) {
  const access = membershipAccess(profile);
  const priceId = alumniPriceId(env);
  const status = String(profile.subscription_status || "");
  const active = hasActiveMembership(profile);

  const benefits = [
    "Keep your macros, meal logging, and full progress history",
    "Alumni community chat with Callie and other grads",
    "Founding Mama rate: $49/mo locked in while you stay subscribed",
    "Q&A Library (monthly audio + weekly notes) as it rolls out",
  ];

  const cancelAtPeriodEnd = !!profile.subscription_cancel_at_period_end;

  if (profile.tier === "alumni_19") {
    return {
      status: "alumni_19",
      priceLabel: "App-only plan",
      amount: 19,
      currency: "usd",
      renewsAt: profile.subscription_current_period_end || null,
      trialEndsAt: null,
      cancelAtPeriodEnd,
      periodLabel: null,
      canSubscribe: false,
      canCancel: false,
      benefits: [
        "Keep logging meals, ranges, and progress history",
        "App-only — no Callie 1:1 and no group chats",
        "$19/mo (manual plan — Patrick confirms in Stripe)",
      ],
      note: "You're on the $19 app-only plan: logging and tracking stay on. Callie chat, cohort chat, and Alumni are off.",
      access,
      priceConfigured: !!priceId,
    };
  }

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
      cancelAtPeriodEnd,
      periodLabel: periodEnd
        ? (status === "trialing"
          ? `Free month through ${formatShortDate(trialEnd || periodEnd)} · first charge after that`
          : `Current period through ${formatShortDate(periodEnd)}`)
        : null,
      canSubscribe: false,
      canCancel: (status === "trialing" || status === "active") && !cancelAtPeriodEnd,
      benefits,
      note: cancelAtPeriodEnd
        ? `Membership ends ${formatShortDate(periodEnd)}. You won’t be charged again unless you resubscribe.`
        : status === "trialing"
          ? "You're in your free month — nothing charges until the trial ends."
          : status === "past_due"
            ? "Your latest membership payment didn’t go through. Update your card — access stays open while Stripe retries."
            : "Your monthly membership is active.",
      access,
      priceConfigured: !!priceId,
    };
  }

  // Eligible to opt in (during program, free month, or after — resubscribe).
  const freeEnd = access.freeMonthEndsAt;
  const inFreeMonth = access.reason === "free_month";
  const beforeProgramEnd = access.reason === "in_program";
  const afterFree = access.paywall;

  let note;
  if (beforeProgramEnd || inFreeMonth) {
    note = access.cohortLabel === "2026-07"
      ? `Founding Members get one month of monthly membership free starting ${formatShortDate(access.programEnd)} (through ${formatShortDate(freeEnd)}). Opt in below — nothing charges until that free month ends. You can subscribe early; the free period still applies.`
      : `When your 8 weeks end${access.programEnd ? ` (${formatShortDate(access.programEnd)})` : ""}, you get one free month of membership. Opt in anytime — nothing charges until the free month ends.`;
  } else if (afterFree) {
    note = "Your free month has ended. Subscribe to keep using the app — resubscribing does not include another free trial.";
  } else {
    note = "Opt in to monthly membership when you're ready. Nothing charges until you do.";
  }

  return {
    status: afterFree ? "required" : "available",
    priceLabel: "Founding Mama membership",
    amount: 49,
    currency: "usd",
    renewsAt: null,
    trialEndsAt: freeEnd,
    cancelAtPeriodEnd: false,
    periodLabel: freeEnd
      ? `Free month covers ${formatShortDate(access.programEnd)} – ${formatShortDate(freeEnd)}`
      : null,
    canSubscribe: !!priceId && !!profile.paid && !profile.refunded,
    canCancel: false,
    benefits,
    note,
    access,
    priceConfigured: !!priceId,
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

  const existingRows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
    { method: "GET" },
  );
  const existingTier = Array.isArray(existingRows) ? existingRows[0]?.tier : null;

  const status = String(subscription.status || "").trim() || null;
  const patch = {
    stripe_subscription_id: subId,
    subscription_status: status,
    subscription_current_period_end: isoFromStripeSeconds(subscription.current_period_end),
    subscription_trial_end: isoFromStripeSeconds(subscription.trial_end),
    subscription_cancel_at_period_end: !!subscription.cancel_at_period_end,
  };
  if (customerId) {
    patch.stripe_customer_id = customerId;
  }

  const active = ACTIVE_SUB_STATUSES.has(status);
  // Preserve manual $19 app-only tier — never auto-promote back to alumni_49.
  if (existingTier === "alumni_19") {
    patch.tier = "alumni_19";
  } else if (active) {
    patch.tier = "alumni_49";
  } else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    patch.tier = "none";
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

  if (patch.tier === "alumni_49" && active) {
    await joinAlumniChannel(env, userId);
  } else if (
    patch.tier === "alumni_19"
    || status === "canceled"
    || status === "unpaid"
    || status === "incomplete_expired"
  ) {
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
  await softRemoveMembership(env, conv.id, userId);
}

/** Remove mama from Alumni + their cohort room (app-only $19 path). */
export async function removeAllGroupChats(env, userId, cohortLabel) {
  await removeAlumniMembership(env, userId);
  if (cohortLabel) {
    try {
      const cohortConv = await getCohortConversation(env, cohortLabel);
      if (cohortConv) await softRemoveMembership(env, cohortConv.id, userId);
    } catch (e) {
      console.error("remove cohort membership failed", userId, e);
    }
  }
}

async function softRemoveMembership(env, conversationId, userId) {
  const now = new Date().toISOString();
  try {
    await sbFetch(
      env,
      `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&removed_at=is.null`,
      {
        method: "PATCH",
        body: JSON.stringify({ removed_at: now }),
        prefer: "return=minimal",
      },
    );
  } catch (e) {
    console.error("softRemoveMembership failed", conversationId, userId, e);
  }
}

/** Stripe: set cancel_at_period_end on a subscription. */
export async function stripeCancelAtPeriodEnd(env, subscriptionId) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !subscriptionId) throw new Error("missing stripe config");
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", "true");
  const resp = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || "stripe cancel failed");
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Profile fields needed for membershipAccess — service role.
 * Used by meal APIs so the paywall isn’t UI-only.
 */
export async function fetchProfileForAccess(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`
      + `&select=id,name,role,paid,refunded,cohort_label,tier,subscription_status,subscription_current_period_end,subscription_trial_end,subscription_cancel_at_period_end,stripe_subscription_id&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function appAccessDeniedResponse(profile) {
  const access = membershipAccess(profile);
  if (access.allowed) return null;
  if (access.paywall) {
    return { error: "membership required", status: 403, access };
  }
  if (access.reason === "refunded") {
    return { error: "enrollment refunded", status: 403, access };
  }
  return { error: "payment required", status: 403, access };
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
