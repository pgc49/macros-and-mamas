/**
 * Invoke Supabase Edge Functions that send Resend emails.
 * Uses SUPABASE_SERVICE_ROLE_KEY (already on Cloudflare for the Stripe webhook).
 * Also logs each client-facing send to public.email_events (admin-only read).
 */

import { loadReferredByAttribution } from "./referrals.js";
import { formatReferredBy } from "./referredBy.js";
import { buildUnsubscribeUrl, isUnsubscribed } from "./emailUnsubscribe.mjs";
import { buildFinishJoiningPayload } from "./finishJoiningEmail.mjs";
import { finishJoiningEmailType } from "./finishJoining.mjs";

export async function invokeEdgeFunction(env, slug, payload) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("invokeEdgeFunction missing SUPABASE_URL or SERVICE_ROLE_KEY", slug);
    return { ok: false, error: "missing supabase config" };
  }

  try {
    const resp = await fetch(`${base}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("edge function failed", slug, resp.status, data);
      return { ok: false, status: resp.status, data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error("edge function invoke error", slug, e);
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function logEmailEvent(env, {
  profileId,
  emailType,
  toEmail,
  subject,
  resendId = null,
  status = "sent",
  meta = {},
}) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !emailType) return;

  try {
    const resp = await fetch(`${base}/rest/v1/email_events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        profile_id: profileId || null,
        email_type: emailType,
        to_email: toEmail || null,
        subject: subject || null,
        resend_id: resendId || null,
        status,
        meta,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("email_events insert failed", resp.status, detail);
    }
  } catch (e) {
    console.error("email_events insert error", e);
  }
}

export { hasEmailEventByEmail } from "../../marketing/src/lib/emailEvents.mjs";

/** True if this profile already has a sent/logged email of this type (idempotency). */
export async function hasEmailEvent(env, profileId, emailType, { sentOnly = false } = {}) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !profileId || !emailType) return false;
  try {
    const url =
      `${base}/rest/v1/email_events`
      + `?profile_id=eq.${encodeURIComponent(profileId)}`
      + `&email_type=eq.${encodeURIComponent(emailType)}`
      + (sentOnly ? "&status=eq.sent" : "")
      + `&select=id&limit=1`;
    const resp = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return false;
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.warn("hasEmailEvent failed", e);
    return false;
  }
}

function resendIdFrom(result) {
  return result?.data?.data?.id || result?.data?.id || null;
}

/** Best-effort profile + auth email lookup via service role. */
export async function loadUserContact(env, userId, { strict = false } = {}) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId) return { email: null, name: null, profile: null };

  const [profileResp, userResp] = await Promise.all([
    fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } }
    ),
    fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    }),
  ]);

  if (strict && !profileResp.ok) {
    throw new Error(`profile contact lookup failed (${profileResp.status})`);
  }
  if (strict && !userResp.ok && userResp.status !== 404) {
    throw new Error(`auth contact lookup failed (${userResp.status})`);
  }
  const profiles = profileResp.ok
    ? await profileResp.json().catch((error) => {
      if (strict) throw error;
      return [];
    })
    : [];
  const profile = profiles[0] || null;
  const authUser = userResp.ok
    ? await userResp.json().catch((error) => {
      if (strict) throw error;
      return null;
    })
    : null;

  return {
    email: authUser?.email || null,
    name: profile?.name || null,
    profile,
  };
}

/**
 * Mama-facing welcome (#2). Idempotent via email_events.
 * Stripe checkout and admin complimentary both use this.
 * Does not notify Callie — payment pings stay on the Stripe path only.
 */
export async function sendWelcomeMamaEmail(env, { email, name, userId, source = "stripe" } = {}) {
  if (!email) return { ok: false, skipped: "no_email" };
  if (await hasEmailEvent(env, userId, "welcome")) {
    return { ok: false, skipped: "already_sent" };
  }

  const subject = "You're in, mama 🤍 (here's what happens next)";
  const result = await invokeEdgeFunction(env, "welcome-email", { email, name, userId });
  await logEmailEvent(env, {
    profileId: userId,
    emailType: "welcome",
    toEmail: email,
    subject,
    resendId: resendIdFrom(result),
    status: result.ok ? "sent" : "failed",
    meta: { slug: "welcome-email", source },
  });
  return result;
}

export async function sendWelcomeEmails(env, { email, name, userId, amountUsd, referralCode } = {}) {
  if (!email) return;

  const amountNum = Number(amountUsd);
  const amountLabel =
    Number.isFinite(amountNum) && amountNum > 0 ? Math.round(amountNum) : null;

  // Idempotent — Stripe may retry checkout.session.completed.
  await sendWelcomeMamaEmail(env, { email, name, userId, source: "stripe" });

  if (!(await hasEmailEvent(env, userId, "callie_payment"))) {
    let referredBy = "";
    try {
      const attribution = await loadReferredByAttribution(env, {
        userId,
        fallbackCode: referralCode,
      });
      referredBy = formatReferredBy(attribution);
    } catch (e) {
      console.warn("referred-by lookup for payment notify failed", e);
    }
    const callie = await invokeEdgeFunction(env, "notify-callie", {
      type: "payment",
      email,
      name: name || email,
      userId,
      amountUsd: amountLabel,
      referredBy: referredBy || undefined,
    });
    await logEmailEvent(env, {
      profileId: userId,
      emailType: "callie_payment",
      toEmail: "callie",
      subject: amountLabel != null
        ? `💰 New mama: ${name || email} — paid $${amountLabel}`
        : `💰 New mama: ${name || email} — paid`,
      resendId: resendIdFrom(callie),
      status: callie.ok ? "sent" : "failed",
      meta: {
        slug: "notify-callie",
        type: "payment",
        amount_usd: amountLabel,
        referred_by: referredBy || null,
      },
    });
  }
}

export async function sendIntakeEmails(env, { email, name, userId, stats }) {
  if (email) {
    const subject = "Got it. I'm building your macros right now";
    const result = await invokeEdgeFunction(env, "intake-received", { email, name, userId });
    await logEmailEvent(env, {
      profileId: userId,
      emailType: "intake_received",
      toEmail: email,
      subject,
      resendId: resendIdFrom(result),
      status: result.ok ? "sent" : "failed",
      meta: { slug: "intake-received" },
    });
  }
  const callie = await invokeEdgeFunction(env, "notify-callie", {
    type: "intake",
    email,
    name: name || email,
    userId,
    stats,
  });
  await logEmailEvent(env, {
    profileId: userId,
    emailType: "callie_intake",
    toEmail: "callie",
    subject: `✅ ${name || email} finished intake — review + approve`,
    resendId: resendIdFrom(callie),
    status: callie.ok ? "sent" : "failed",
    meta: { slug: "notify-callie", type: "intake" },
  });
}

export async function sendApprovedEmail(env, { email, name, userId }) {
  if (!email) return;
  const subject = "Your ranges are ready 🤍";
  const result = await invokeEdgeFunction(env, "application-approved", { email, name, userId });
  await logEmailEvent(env, {
    profileId: userId,
    emailType: "macros_live",
    toEmail: email,
    subject,
    resendId: resendIdFrom(result),
    status: result.ok ? "sent" : "failed",
    meta: { slug: "application-approved" },
  });
}

export async function sendCohortOpenEmail(env, { email, name, waitlistId = null, profileId = null }) {
  if (!email) return { ok: false };
  const subject = "Spots are open. Lock in your spot";
  const result = await invokeEdgeFunction(env, "cohort-open", { email, name });
  await logEmailEvent(env, {
    profileId: profileId || null,
    emailType: "cohort_open",
    toEmail: email,
    subject,
    resendId: resendIdFrom(result),
    status: result.ok ? "sent" : "failed",
    meta: { slug: "cohort-open", cohort_waitlist_id: waitlistId || null },
  });
  return result;
}

export async function sendFinishJoiningEmail(env, {
  email,
  name,
  userId,
  variant,
  quizUnlock = false,
} = {}) {
  if (!email) return { ok: false };
  const emailType = finishJoiningEmailType(variant);
  if (await isUnsubscribed(env, email)) {
    return { ok: false, skipped: "unsubscribed" };
  }
  if (await hasEmailEvent(env, userId, emailType, { sentOnly: true })) {
    return { ok: false, skipped: "already_sent" };
  }

  const unsubscribeUrl = await buildUnsubscribeUrl(env, email);
  const payload = buildFinishJoiningPayload({
    variant,
    name,
    email,
    quizUnlock,
  });
  const result = await invokeEdgeFunction(env, "finish-joining", {
    email,
    name,
    userId,
    variant: payload.variant,
    subject: payload.subject,
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
    cta_note: payload.cta_note,
    unsubscribe_url: unsubscribeUrl || undefined,
    quizUnlock: Boolean(quizUnlock),
  });
  await logEmailEvent(env, {
    profileId: userId,
    emailType,
    toEmail: email,
    subject: payload.subject,
    resendId: resendIdFrom(result),
    status: result.ok ? "sent" : "failed",
    meta: {
      slug: "finish-joining",
      variant: payload.variant,
      quiz_unlock: Boolean(quizUnlock),
    },
  });
  return result;
}

export async function sendIntakeReminderEmail(env, { email, name, userId, variant }) {
  if (!email) return { ok: false };
  const subject = "I can't build your macros yet";
  const emailType = variant === "72h" ? "intake_reminder_72h" : "intake_reminder_24h";
  const result = await invokeEdgeFunction(env, "intake-reminder", {
    email, name, userId, variant: variant === "72h" ? "72h" : "24h",
  });
  await logEmailEvent(env, {
    profileId: userId,
    emailType,
    toEmail: email,
    subject,
    resendId: resendIdFrom(result),
    status: result.ok ? "sent" : "failed",
    meta: { slug: "intake-reminder", variant },
  });
  return result;
}

export async function sendRefundEmails(env, { email, name, userId, reason }) {
  if (email) {
    const subject = "Refund confirmation";
    const result = await invokeEdgeFunction(env, "eligibility-refund", {
      email, name, reason, userId,
    });
    await logEmailEvent(env, {
      profileId: userId,
      emailType: "eligibility_refund",
      toEmail: email,
      subject,
      resendId: resendIdFrom(result),
      status: result.ok ? "sent" : "failed",
      meta: { slug: "eligibility-refund", reason },
    });
  }
  const callie = await invokeEdgeFunction(env, "notify-callie", {
    type: "refund",
    email,
    name: name || email,
    userId,
    reason,
  });
  await logEmailEvent(env, {
    profileId: userId,
    emailType: "callie_refund",
    toEmail: "callie",
    subject: `↩️ Refund: ${name || email} (${reason || "eligibility"}) — waitlisted`,
    resendId: resendIdFrom(callie),
    status: callie.ok ? "sent" : "failed",
    meta: { slug: "notify-callie", type: "refund", reason },
  });
}
