/**
 * Send quiz_opening_week_1h via Resend and log email_events.
 * Idempotent: email_events status=sent + Resend Idempotency-Key.
 */

import { FROM_CALLIE, renderEmail } from "./emailLayout.mjs";
import {
  buildUnsubscribeUrl,
  isUnsubscribed,
  quizMailHeaders,
} from "./emailUnsubscribe.mjs";
import { hasEmailEventByEmail, logEmailEvent } from "./emailEvents.mjs";
import { sendResendEmail } from "./resendSend.mjs";
import {
  QUIZ_OPENING_WEEK_1H,
  openingWeekEntityId,
  openingWeekIdempotencyKey,
} from "./quizOpeningWeek1h.mjs";
import { buildOpeningWeek1hPayload } from "./quizOpeningWeek1hEmail.mjs";

export async function sendQuizOpeningWeek1hEmail(env, {
  email,
  firstName,
  lead,
  profile = null,
  source = "email-cron",
} = {}) {
  const to = String(email || "").trim().toLowerCase();
  if (!to || !env?.RESEND_API_KEY) return { ok: false, error: "missing" };

  if (await isUnsubscribed(env, to)) {
    return { ok: false, skipped: "unsubscribed" };
  }
  if (await hasEmailEventByEmail(env, to, QUIZ_OPENING_WEEK_1H, { sentOnly: true })) {
    return { ok: false, skipped: "already_sent" };
  }

  const hasProfile = Boolean(profile);
  const payload = buildOpeningWeek1hPayload({
    firstName: firstName || lead?.first_name,
    email: to,
    hasProfile,
  });
  const unsubscribeUrl = await buildUnsubscribeUrl(env, to);
  const html = renderEmail({
    header: payload.header,
    body: payload.body,
    cta_text: payload.cta_text,
    cta_url: payload.cta_url,
    unsubscribe_url: unsubscribeUrl || undefined,
  });

  const entityId = openingWeekEntityId({ lead, email: to });
  const idempotencyKey = openingWeekIdempotencyKey(entityId);
  const { data, error } = await sendResendEmail(env, {
    from: env.LEAD_FROM_EMAIL || FROM_CALLIE,
    to: [to],
    reply_to: "calista@nourishwithcalista.com",
    subject: payload.subject,
    html,
    ...(unsubscribeUrl ? { headers: quizMailHeaders(unsubscribeUrl) } : {}),
  }, { idempotencyKey });

  const meta = {
    source,
    segment: lead?.segment || null,
    cta: payload.ctaKind,
    has_profile: hasProfile,
    lead_id: lead?.id || null,
    attempt: source === "quiz-opening-week-1h-backfill" ? "backfill" : "auto",
    idempotency_key: idempotencyKey,
  };

  if (error) {
    console.error("quiz opening week Resend failed", QUIZ_OPENING_WEEK_1H, error.message);
    await logEmailEvent(env, {
      profileId: profile?.id || null,
      emailType: QUIZ_OPENING_WEEK_1H,
      toEmail: to,
      subject: payload.subject,
      resendId: data?.id || null,
      status: "failed",
      meta: { ...meta, error: String(error.message || "resend_error").slice(0, 200) },
    });
    return { ok: false, error: error.message, status: error.statusCode };
  }

  await logEmailEvent(env, {
    profileId: profile?.id || null,
    emailType: QUIZ_OPENING_WEEK_1H,
    toEmail: to,
    subject: payload.subject,
    resendId: data?.id || null,
    status: "sent",
    meta,
  });
  return { ok: true, resendId: data?.id || null, idempotencyKey };
}
