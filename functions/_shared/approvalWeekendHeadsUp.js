/**
 * One-shot weekend heads-up to Cohort 2 mamas waiting on Callie's approval.
 * Not cron. Not in the standing email catalog.
 */
import { APP_URL, FROM_CALLIE, renderEmail } from "./emailLayout.mjs";
import { safeDisplayName } from "./quizDripEmail.mjs";
import { logEmailEvent } from "./emailEvents.mjs";

export const APPROVAL_WEEKEND_TYPE = "approval_weekend_heads_up";
export const APPROVAL_WEEKEND_COHORT = "2026-08";
export const APPROVAL_WEEKEND_SUBJECT = "I'm going through every intake this weekend!!";
export const APPROVAL_WEEKEND_PREVIEW =
  "Monday we start!! I'm reviewing every form myself, one mama at a time.";
export const APPROVAL_WEEKEND_CTA = "See my pending status";
export const APPROVAL_WEEKEND_FROM = FROM_CALLIE;
export const APPROVAL_WEEKEND_REPLY_TO = "calista@nourishwithcalista.com";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function prettyFirstName(raw) {
  const cleaned = safeDisplayName(raw);
  if (cleaned === "Mama") return cleaned;
  return cleaned.replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

export function firstNameFromProfile(profile) {
  const first = String(profile?.name || "").trim().split(/\s+/)[0] || "";
  return prettyFirstName(first);
}

export function isPaidOrComp(profile) {
  return Boolean(profile?.paid || profile?.comp);
}

export function isApproved({ profile, macros }) {
  return Boolean(macros?.approved || profile?.status === "active");
}

/** Same stage rules as admin Need approval, scoped to Cohort 2. */
export function isCohort2AwaitingApproval(profile, macros) {
  if (!profile) return false;
  if (String(profile.role || "").toLowerCase() === "admin") return false;
  if (profile.refunded) return false;
  if (String(profile.cohort_label || "") !== APPROVAL_WEEKEND_COHORT) return false;
  if (!isPaidOrComp(profile)) return false;
  if (!macros) return false;
  if (isApproved({ profile, macros })) return false;
  return true;
}

export function selectApprovalWeekendRecipients({
  profiles,
  macrosByProfileId = {},
  alreadySent = new Set(),
} = {}) {
  const recipients = [];
  const skipped = {
    unpaid: 0,
    refunded: 0,
    admin: 0,
    wrong_cohort: 0,
    paid_no_intake: 0,
    already_approved: 0,
    already_sent: 0,
    no_email: 0,
  };

  for (const profile of profiles || []) {
    const email = normalizeEmail(profile?.email);
    const role = String(profile?.role || "").toLowerCase();
    const macros = profile?.id ? macrosByProfileId[profile.id] : null;

    if (role === "admin") {
      skipped.admin += 1;
      continue;
    }
    if (String(profile?.cohort_label || "") !== APPROVAL_WEEKEND_COHORT) {
      skipped.wrong_cohort += 1;
      continue;
    }
    if (profile?.refunded) {
      skipped.refunded += 1;
      continue;
    }
    if (!isPaidOrComp(profile)) {
      skipped.unpaid += 1;
      continue;
    }
    if (!macros) {
      skipped.paid_no_intake += 1;
      continue;
    }
    if (isApproved({ profile, macros })) {
      skipped.already_approved += 1;
      continue;
    }
    if (!email) {
      skipped.no_email += 1;
      continue;
    }
    if (alreadySent.has(email)) {
      skipped.already_sent += 1;
      continue;
    }

    recipients.push({
      profileId: profile.id,
      email,
      firstName: firstNameFromProfile(profile),
    });
  }

  return { recipients, skipped };
}

export function alreadySentSet(events) {
  const emails = new Set();
  for (const row of events || []) {
    if (String(row?.email_type || "") !== APPROVAL_WEEKEND_TYPE) continue;
    if (String(row?.status || "") !== "sent") continue;
    const email = normalizeEmail(row.to_email);
    if (email) emails.add(email);
  }
  return emails;
}

export function idempotencyKey(profileId) {
  return `${APPROVAL_WEEKEND_TYPE}/${profileId}`;
}

export function buildApprovalWeekendPayload({ firstName } = {}) {
  const name = prettyFirstName(firstName);
  return {
    emailType: APPROVAL_WEEKEND_TYPE,
    subject: APPROVAL_WEEKEND_SUBJECT,
    preview: APPROVAL_WEEKEND_PREVIEW,
    header: `Hi ${name},`,
    body: [
      `<p style="display:none;max-height:0;overflow:hidden">${APPROVAL_WEEKEND_PREVIEW}</p>`,
      "<p>We are locked in, mama!! I am so excited I can hardly stand it!!</p>",
      "<p>Official start is Monday, and this weekend I am sitting down with every single intake, yours included, one mama at a time. I go through each one myself. No calculator. Just me, your form, and your numbers!!</p>",
      "<p>Be on the lookout for your official approval email!! That's the one that gives you full access to the app: your dashboard, your ranges, Messages, the whole group. I'll send it the moment I finish yours.</p>",
      "<p>Nothing you need to do right now. Your spot is paid, your intake is in, and I cannot wait to get started with you!! We're going to do this together!!</p>",
      "<p>Callie</p>",
    ].join(""),
    cta_text: APPROVAL_WEEKEND_CTA,
    cta_url: `${APP_URL}/pending`,
  };
}

export function approvalWeekendPreviewText(firstName = "Mama") {
  const name = prettyFirstName(firstName);
  return [
    `Hi ${name},`,
    "",
    APPROVAL_WEEKEND_PREVIEW,
    "",
    "We are locked in, mama!! I am so excited I can hardly stand it!!",
    "",
    "Official start is Monday, and this weekend I am sitting down with every single intake, yours included, one mama at a time. I go through each one myself. No calculator. Just me, your form, and your numbers!!",
    "",
    "Be on the lookout for your official approval email!! That's the one that gives you full access to the app: your dashboard, your ranges, Messages, the whole group. I'll send it the moment I finish yours.",
    "",
    "Nothing you need to do right now. Your spot is paid, your intake is in, and I cannot wait to get started with you!! We're going to do this together!!",
    "",
    "Callie",
  ].join("\n");
}

export function renderApprovalWeekendHtml(firstName) {
  const payload = buildApprovalWeekendPayload({ firstName });
  return renderEmail({
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
  });
}

export async function sendApprovalWeekendEmail(env, { email, firstName, profileId }) {
  const to = normalizeEmail(email);
  if (!to || !env?.RESEND_API_KEY) return { ok: false, error: "missing" };

  const payload = buildApprovalWeekendPayload({ firstName });
  const html = renderApprovalWeekendHtml(firstName);
  const text = approvalWeekendPreviewText(firstName);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(profileId),
      },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL || APPROVAL_WEEKEND_FROM,
        to: [to],
        reply_to: APPROVAL_WEEKEND_REPLY_TO,
        subject: payload.subject,
        html,
        text,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    const resendId = data?.id || null;
    await logEmailEvent(env, {
      profileId: profileId || null,
      emailType: APPROVAL_WEEKEND_TYPE,
      toEmail: to,
      subject: payload.subject,
      resendId,
      status: resp.ok ? "sent" : "failed",
      meta: { source: "approval-weekend-heads-up" },
    });
    if (!resp.ok) {
      console.error("approval weekend heads-up Resend failed", resp.status, data);
      return { ok: false, status: resp.status, error: data };
    }
    return { ok: true, resendId };
  } catch (e) {
    console.error("approval weekend heads-up Resend error", e);
    return { ok: false, error: String(e?.message || e) };
  }
}
