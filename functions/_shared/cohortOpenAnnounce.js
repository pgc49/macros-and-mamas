/**
 * Manual announcement: next group starts November 2.
 * Quiz leads who have not paid, plus accounts that signed up and have not paid.
 * Skips paid, comp, refunded, admin, QA plus-addresses, and unsubscribed.
 * Every quiz segment is included, including pregnancy and plant-based.
 */
import { FROM_CALLIE, renderEmail } from "./emailLayout.mjs";
import { quizJoinUrl } from "./rangesEmail.mjs";
import {
  firstNameFromLead,
  latestLeadByEmail,
  normalizeLeadEmail,
  prettyFirstName,
  profileFirstNamesByEmail,
} from "./unpaidLeadsBlast.js";
import {
  buildUnsubscribeUrl,
  fetchUnsubscribedEmails,
  quizMailHeaders,
} from "./emailUnsubscribe.mjs";
import { logEmailEvent } from "./emailEvents.mjs";

export const COHORT_OPEN_ANNOUNCE_TYPE = "cohort_3_open";
export const STORIES_URL = "https://www.macrosandmamas.com/#stories";

export function isQaBlastEmail(email) {
  const local = normalizeLeadEmail(email).split("@")[0] || "";
  return local.startsWith("pgchammas+");
}

/** Emails that must not get a sales note: paid, comp, refunded, admin. */
export function excludedBlastEmails(profiles) {
  const emails = new Set();
  for (const profile of profiles || []) {
    const email = normalizeLeadEmail(profile?.email);
    if (!email) continue;
    if (profile.role === "admin" || profile.paid || profile.comp || profile.refunded) {
      emails.add(email);
    }
  }
  return emails;
}

function unpaidProfile(profile) {
  if (!profile || profile.role === "admin") return false;
  if (profile.paid || profile.comp || profile.refunded) return false;
  return Boolean(normalizeLeadEmail(profile.email));
}

/**
 * One row per address. Every quiz lead who has not paid is included,
 * plus accounts that signed up and have not paid.
 * Automatic sends stop after 9:00 AM PT on Monday, October 20, 2026.
 */
export const COHORT_OPEN_ANNOUNCE_UNTIL = "2026-10-20T16:00:00.000Z";

export function cohortOpenAnnounceOpen(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(t) && t <= Date.parse(COHORT_OPEN_ANNOUNCE_UNTIL);
}

export function selectCohortOpenRecipients({
  leads,
  profiles,
  unsubscribed = new Set(),
  alreadySent = new Set(),
} = {}) {
  const skipped = {
    paid: 0,
    unsubscribed: 0,
    already_sent: 0,
    qa: 0,
  };
  const excluded = excludedBlastEmails(profiles);
  const names = profileFirstNamesByEmail(profiles);
  const seen = new Set();
  const recipients = [];

  const take = (email, row, { fromProfile }) => {
    if (!email || seen.has(email)) return;
    if (excluded.has(email)) {
      skipped.paid += 1;
      seen.add(email);
      return;
    }
    if (isQaBlastEmail(email)) {
      skipped.qa += 1;
      seen.add(email);
      return;
    }
    if (unsubscribed.has(email)) {
      skipped.unsubscribed += 1;
      seen.add(email);
      return;
    }
    if (alreadySent.has(email)) {
      skipped.already_sent += 1;
      seen.add(email);
      return;
    }
    seen.add(email);
    const firstName = fromProfile
      ? prettyFirstName(String(row?.name || "").trim().split(/\s+/)[0] || "")
      : firstNameFromLead(row, names);
    recipients.push({
      email,
      firstName,
      profileId: fromProfile ? row.id || null : row.profile_id || row.profileId || null,
      leadId: fromProfile ? null : row.id || null,
      hasAccount: fromProfile,
    });
  };

  for (const profile of profiles || []) {
    if (!unpaidProfile(profile)) continue;
    take(normalizeLeadEmail(profile.email), profile, { fromProfile: true });
  }
  for (const [email, lead] of latestLeadByEmail(leads)) {
    take(email, lead, { fromProfile: false });
  }

  return { recipients, skipped };
}

export function cohortOpenSubject(firstName) {
  const who = prettyFirstName(firstName);
  return `${who}, a new group starts November 2`;
}

export function buildCohortOpenPayload({ firstName, email, hasAccount = false } = {}) {
  const name = prettyFirstName(firstName);
  const joinUrl = quizJoinUrl(email);
  const cta = hasAccount ? "Finish checkout" : "Lock my spot";
  return {
    emailType: COHORT_OPEN_ANNOUNCE_TYPE,
    subject: cohortOpenSubject(name),
    header: `Hi ${name},`,
    body: [
      "<p>I'm opening the next Macros and Mamas group. We start Monday, November 2. If you join in the first weeks of November, you're still in.</p>",
      "<p>The founding group has finished. Those mamas came in for a health reset and someone in their corner. You can <a href=\"https://www.macrosandmamas.com/#stories\">read some of their stories</a>.</p>",
      "<p>If you already finished the quiz, your rate is still $249, $50 off the $299 full rate.</p>",
      "<p>With love,<br/>Callie</p>",
      "<p style=\"font-size:12px;color:#6E5D66;margin-top:24px\">You're getting this because you took the quiz or started an account and haven't paid. Reply anytime. Unsubscribe in the footer.</p>",
    ].join(""),
    cta_text: cta,
    cta_url: joinUrl,
  };
}

export function cohortOpenPreviewText(firstName = "Mama", hasAccount = false) {
  const name = prettyFirstName(firstName);
  const cta = hasAccount ? "Finish checkout" : "Lock my spot";
  return [
    `Hi ${name},`,
    "",
    "I'm opening the next Macros and Mamas group. We start Monday, November 2. If you join in the first weeks of November, you're still in.",
    "",
    "The founding group has finished. Those mamas came in for a health reset and someone in their corner. You can read some of their stories: https://www.macrosandmamas.com/#stories",
    "",
    "If you already finished the quiz, your rate is still $249, $50 off the $299 full rate.",
    "",
    cta,
    "",
    "With love,",
    "Callie",
  ].join("\n");
}

export async function sendCohortOpenEmail(env, { email, firstName, profileId, leadId, hasAccount }) {
  const to = normalizeLeadEmail(email);
  if (!to || !env?.RESEND_API_KEY) return { ok: false, error: "missing" };

  const payload = buildCohortOpenPayload({ firstName, email: to, hasAccount });
  const unsubscribeUrl = await buildUnsubscribeUrl(env, to);
  const html = renderEmail({
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
    unsubscribe_url: unsubscribeUrl || undefined,
  });

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL || FROM_CALLIE,
        to: [to],
        reply_to: "calista@nourishwithcalista.com",
        subject: payload.subject,
        html,
        ...(unsubscribeUrl ? { headers: quizMailHeaders(unsubscribeUrl) } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    const resendId = data?.id || null;
    await logEmailEvent(env, {
      profileId: profileId || null,
      emailType: COHORT_OPEN_ANNOUNCE_TYPE,
      toEmail: to,
      subject: payload.subject,
      resendId,
      status: resp.ok ? "sent" : "failed",
      meta: {
        source: "cohort-open-announce",
        lead_id: leadId || null,
        has_account: Boolean(hasAccount),
      },
    });
    if (!resp.ok) {
      console.error("cohort open announce Resend failed", resp.status, data);
      return { ok: false, status: resp.status };
    }
    return { ok: true, resendId };
  } catch (e) {
    console.error("cohort open announce Resend error", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

const BATCH_LIMIT = 100;

async function cohortOpenMessage(env, row) {
  const to = normalizeLeadEmail(row?.email);
  if (!to) return null;
  const payload = buildCohortOpenPayload({
    firstName: row.firstName,
    email: to,
    hasAccount: row.hasAccount,
  });
  const unsubscribeUrl = await buildUnsubscribeUrl(env, to);
  const html = renderEmail({
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
    unsubscribe_url: unsubscribeUrl || undefined,
  });
  return {
    to,
    subject: payload.subject,
    profileId: row.profileId || null,
    leadId: row.leadId || null,
    hasAccount: Boolean(row.hasAccount),
    resend: {
      from: env.LEAD_FROM_EMAIL || FROM_CALLIE,
      to: [to],
      reply_to: "calista@nourishwithcalista.com",
      subject: payload.subject,
      html,
      ...(unsubscribeUrl ? { headers: quizMailHeaders(unsubscribeUrl) } : {}),
    },
  };
}

async function logCohortOpenEvents(env, rows) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key || !rows?.length) return false;
  const body = rows.map((row) => ({
    profile_id: row.profileId || null,
    email_type: COHORT_OPEN_ANNOUNCE_TYPE,
    to_email: normalizeLeadEmail(row.to),
    subject: row.subject || null,
    resend_id: row.resendId || null,
    status: row.status || "sent",
    meta: {
      source: "cohort-open-announce",
      lead_id: row.leadId || null,
      has_account: Boolean(row.hasAccount),
    },
  }));
  try {
    const resp = await fetch(`${base}/rest/v1/email_events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error("cohort open announce log failed", resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("cohort open announce log error", e);
    return false;
  }
}

/**
 * One Resend batch for the whole list. A per-address send burns the worker's
 * outbound request budget after the first handful, which is what stopped the
 * 1:10 AM run at 10 sent.
 */
export async function sendCohortOpenBatch(env, recipients) {
  if (!env?.RESEND_API_KEY) return { sent: 0, errors: (recipients || []).length };
  const messages = [];
  for (const row of recipients || []) {
    const message = await cohortOpenMessage(env, row);
    if (message) messages.push(message);
  }
  let sent = 0;
  let errors = 0;
  for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
    const result = await postCohortOpenBatch(env, messages.slice(i, i + BATCH_LIMIT));
    sent += result.sent;
    errors += result.errors;
  }
  return { sent, errors };
}

async function postCohortOpenBatch(env, messages) {
  if (!messages.length) return { sent: 0, errors: 0 };
  let resp;
  let data = {};
  try {
    resp = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages.map((message) => message.resend)),
    });
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    console.error("cohort open announce batch error", e);
    return { sent: 0, errors: messages.length };
  }

  if (resp.ok) {
    const ids = Array.isArray(data?.data) ? data.data : [];
    await logCohortOpenEvents(env, messages.map((message, index) => ({
      ...message,
      resendId: ids[index]?.id || null,
      status: "sent",
    })));
    return { sent: messages.length, errors: 0 };
  }

  console.error("cohort open announce batch failed", resp.status, data);
  if ((resp.status === 400 || resp.status === 422) && messages.length > 1) {
    const mid = Math.ceil(messages.length / 2);
    const left = await postCohortOpenBatch(env, messages.slice(0, mid));
    const right = await postCohortOpenBatch(env, messages.slice(mid));
    return { sent: left.sent + right.sent, errors: left.errors + right.errors };
  }

  if (messages.length === 1 && (resp.status === 400 || resp.status === 422)) {
    await logCohortOpenEvents(env, [{ ...messages[0], status: "failed" }]);
  }
  return { sent: 0, errors: messages.length };
}

/**
 * One-shot send for the hourly cron. Stops after COHORT_OPEN_ANNOUNCE_UNTIL.
 * Pass force to send from the admin button after that window.
 * Idempotent: an address with email_events status=sent for this type is skipped.
 */
export async function runCohortOpenAnnounce(env, { now = new Date(), force = false } = {}) {
  const closed = {
    open: false,
    sent: 0,
    errors: 0,
    candidates: 0,
    skipped: { paid: 0, unsubscribed: 0, already_sent: 0, qa: 0 },
  };
  if (!force && !cohortOpenAnnounceOpen(now)) return closed;

  const unsub = await fetchUnsubscribedEmails(env);
  if (!unsub.ok) {
    console.error("cohort open announce skipped: unsubscribe list unavailable");
    return { ...closed, open: true, errors: 1 };
  }

  let leads;
  let profiles;
  let events;
  try {
    [leads, profiles, events] = await Promise.all([
      sbGet(env, "/rest/v1/marketing_leads?select=id,email,first_name,segment,created_at&order=created_at.desc&limit=5000"),
      sbGet(env, "/rest/v1/profiles?select=id,email,name,paid,comp,refunded,role&limit=5000"),
      sbGet(
        env,
        `/rest/v1/email_events?email_type=eq.${encodeURIComponent(COHORT_OPEN_ANNOUNCE_TYPE)}&status=eq.sent&select=to_email&limit=5000`,
      ),
    ]);
  } catch (e) {
    console.error("cohort open announce load failed", e);
    return { ...closed, open: true, errors: 1 };
  }

  const alreadySent = new Set(
    (events || []).map((row) => normalizeLeadEmail(row.to_email)).filter(Boolean),
  );
  const { recipients, skipped } = selectCohortOpenRecipients({
    leads,
    profiles,
    unsubscribed: unsub.emails,
    alreadySent,
  });

  const batch = await sendCohortOpenBatch(env, recipients);
  return {
    open: true,
    sent: batch.sent,
    errors: batch.errors,
    candidates: recipients.length,
    skipped,
  };
}

async function sbGet(env, path) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`supabase ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}
