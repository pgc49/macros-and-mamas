/**
 * One more sales note to quiz leads who got ranges and still have not paid.
 * Manual admin send. Not part of the cron drip.
 */
import { FROM_CALLIE, renderEmail } from "./emailLayout.mjs";
import { quizJoinUrl } from "./rangesEmail.mjs";
import { QUIZ_NO_SALES_SEGMENTS } from "./quizDrip.mjs";
import { safeDisplayName } from "./quizDripEmail.mjs";
import {
  buildUnsubscribeUrl,
  fetchUnsubscribedEmails,
  quizMailHeaders,
} from "./emailUnsubscribe.mjs";
import { logEmailEvent } from "./emailEvents.mjs";

export const UNPAID_ONE_MORE_TYPE = "quiz_one_more";
export const UNPAID_ONE_MORE_CTA = "Lock my spot";

export function normalizeLeadEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isPaidClient(profile) {
  if (!profile || profile.role === "admin") return false;
  return Boolean(profile.paid || profile.comp);
}

export function isSalesEligibleSegment(segment) {
  return !QUIZ_NO_SALES_SEGMENTS.has(String(segment || ""));
}

/** Latest marketing_leads row per email (created_at desc). */
export function latestLeadByEmail(leads) {
  const byEmail = new Map();
  const list = Array.isArray(leads) ? [...leads] : [];
  list.sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
  for (const lead of list) {
    const email = normalizeLeadEmail(lead?.email);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, lead);
  }
  return byEmail;
}

export function paidClientEmails(profiles) {
  const emails = new Set();
  for (const profile of profiles || []) {
    if (!isPaidClient(profile)) continue;
    const email = normalizeLeadEmail(profile.email);
    if (email) emails.add(email);
  }
  return emails;
}

/**
 * Unique quiz emails that submitted ranges and have not paid.
 * Pregnancy / plant-based stay in this list (true leads) but are not emailed.
 */
export function selectUnpaidRangeLeads(leads, profiles) {
  const paid = paidClientEmails(profiles);
  const latest = latestLeadByEmail(leads);
  const names = profileFirstNamesByEmail(profiles);
  const out = [];
  for (const [email, lead] of latest) {
    if (paid.has(email)) continue;
    out.push({
      email,
      firstName: recipientFirstName(lead, names),
      segment: lead?.segment || "",
      profileId: lead?.profileId || lead?.profile_id || null,
      leadId: lead?.id || null,
    });
  }
  return out;
}

export function selectEmailableUnpaidLeads({
  leads,
  profiles,
  unsubscribed = new Set(),
  alreadySent = new Set(),
} = {}) {
  const skipped = {
    paid: 0,
    unsubscribed: 0,
    not_sales: 0,
    already_sent: 0,
  };
  const paid = paidClientEmails(profiles);
  const latest = latestLeadByEmail(leads);
  const names = profileFirstNamesByEmail(profiles);
  const recipients = [];

  for (const [email, lead] of latest) {
    if (paid.has(email)) {
      skipped.paid += 1;
      continue;
    }
    if (unsubscribed.has(email)) {
      skipped.unsubscribed += 1;
      continue;
    }
    if (!isSalesEligibleSegment(lead?.segment)) {
      skipped.not_sales += 1;
      continue;
    }
    if (alreadySent.has(email)) {
      skipped.already_sent += 1;
      continue;
    }
    recipients.push({
      email,
      firstName: recipientFirstName(lead, names),
      segment: lead?.segment || "",
      profileId: lead?.profileId || lead?.profile_id || null,
      leadId: lead?.id || null,
    });
  }

  return { recipients, skipped, unpaidLeads: recipients.length + skipped.unsubscribed + skipped.not_sales + skipped.already_sent };
}

/** Greeting name from the quiz first_name, else the profile first token. */
export function prettyFirstName(raw) {
  const cleaned = safeDisplayName(raw);
  if (cleaned === "Mama") return cleaned;
  return cleaned.replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

export function firstNameFromLead(lead, profileNames = new Map()) {
  const fromLead = String(lead?.first_name || "").trim();
  if (fromLead) return prettyFirstName(fromLead);
  const email = normalizeLeadEmail(lead?.email);
  if (email && profileNames.has(email)) return prettyFirstName(profileNames.get(email));
  return "Mama";
}

export function profileFirstNamesByEmail(profiles) {
  const map = new Map();
  for (const profile of profiles || []) {
    const email = normalizeLeadEmail(profile?.email);
    const first = String(profile?.name || "").trim().split(/\s+/)[0] || "";
    if (email && first) map.set(email, first);
  }
  return map;
}

function recipientFirstName(lead, profileNames) {
  return firstNameFromLead(lead, profileNames);
}

export function unpaidOneMoreSubject(firstName) {
  const who = prettyFirstName(firstName);
  return `One last time, ${who}`;
}

export function buildUnpaidOneMorePayload({ firstName, email } = {}) {
  const name = prettyFirstName(firstName);
  const joinUrl = quizJoinUrl(email);
  return {
    emailType: UNPAID_ONE_MORE_TYPE,
    subject: unpaidOneMoreSubject(name),
    header: `Hi, ${name}!`,
    body: [
      "<p>One last time: you matter. Your health matters. I'd love to support you in making it a priority!</p>",
      "<p>DMs are open, but course registration will close tonight.</p>",
      "<p>With gratitude,<br/>Callie</p>",
      `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime. Unsubscribe in the footer.</p>`,
    ].join(""),
    cta_text: UNPAID_ONE_MORE_CTA,
    cta_url: joinUrl,
  };
}

export function unpaidOneMorePreviewText(firstName = "Mama") {
  const name = prettyFirstName(firstName);
  return [
    `Hi, ${name}!`,
    "",
    "One last time: you matter. Your health matters. I'd love to support you in making it a priority!",
    "",
    "DMs are open, but course registration will close tonight.",
    "",
    "www.macrosandmamas.com/join",
    "",
    "With gratitude,",
    "Callie",
  ].join("\n");
}

export async function sendUnpaidOneMoreEmail(env, { email, firstName, profileId, leadId }) {
  const to = normalizeLeadEmail(email);
  if (!to || !env?.RESEND_API_KEY) return { ok: false, error: "missing" };

  const payload = buildUnpaidOneMorePayload({ firstName, email: to });
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
      emailType: UNPAID_ONE_MORE_TYPE,
      toEmail: to,
      subject: payload.subject,
      resendId,
      status: resp.ok ? "sent" : "failed",
      meta: {
        source: "unpaid-leads-blast",
        lead_id: leadId || null,
      },
    });
    if (!resp.ok) {
      console.error("unpaid one-more Resend failed", resp.status, data);
      return { ok: false, status: resp.status };
    }
    return { ok: true, resendId };
  } catch (e) {
    console.error("unpaid one-more Resend error", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function loadUnsubscribedSet(env) {
  const result = await fetchUnsubscribedEmails(env);
  return result;
}

export function alreadySentSet(events) {
  const emails = new Set();
  for (const row of events || []) {
    if (String(row?.email_type || "") !== UNPAID_ONE_MORE_TYPE) continue;
    if (String(row?.status || "") !== "sent") continue;
    const email = normalizeLeadEmail(row.to_email);
    if (email) emails.add(email);
  }
  return emails;
}
