/**
 * Send one quiz-lead drip step via Resend and log email_events.
 */

import { FROM_CALLIE, renderEmail } from "./emailLayout.mjs";
import { quizJoinUrl } from "./rangesEmail.mjs";
import {
  buildUnsubscribeUrl,
  isUnsubscribed,
  quizMailHeaders,
} from "./emailUnsubscribe.mjs";
import { hasEmailEventByEmail, logEmailEvent } from "./emailEvents.mjs";
import { buildQuizDripPayload } from "./quizDripEmail.mjs";

export async function sendQuizDripEmail(env, { email, firstName, lead, step }) {
  const to = String(email || "").trim().toLowerCase();
  if (!to || !env?.RESEND_API_KEY) return { ok: false, error: "missing" };

  if (await isUnsubscribed(env, to)) {
    return { ok: false, skipped: "unsubscribed" };
  }
  if (await hasEmailEventByEmail(env, to, step, { sentOnly: true })) {
    return { ok: false, skipped: "already_sent" };
  }

  const joinUrl = quizJoinUrl(to);
  const payload = buildQuizDripPayload({
    step,
    firstName: firstName || lead?.first_name,
    email: to,
    lead,
    joinUrl,
  });
  if (!payload) return { ok: false, error: "unknown_step" };

  const unsubscribeUrl = await buildUnsubscribeUrl(env, to);
  const html = renderEmail({
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
    cta_note: payload.cta_note,
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
    if (!resp.ok) {
      console.error("quiz drip Resend failed", step, resp.status, data);
      await logEmailEvent(env, {
        emailType: step,
        toEmail: to,
        subject: payload.subject,
        resendId: data?.id || null,
        status: "failed",
        meta: { source: "email-cron", segment: lead?.segment || null },
      });
      return { ok: false, status: resp.status };
    }
    await logEmailEvent(env, {
      emailType: step,
      toEmail: to,
      subject: payload.subject,
      resendId: data?.id || null,
      status: "sent",
      meta: { source: "email-cron", segment: lead?.segment || null },
    });
    return { ok: true, resendId: data?.id || null };
  } catch (e) {
    console.error("quiz drip Resend error", step, e);
    return { ok: false, error: String(e?.message || e) };
  }
}
