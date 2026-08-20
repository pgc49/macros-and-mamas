/**
 * Track B finish-joining copy. First-person Callie, warm, short, no hype.
 * Em dashes are banned (brand copy rule). $249 only when quiz unlock is true.
 */
import { APP_URL } from "./emailLayout.mjs";
import { safeDisplayName } from "./quizDripEmail.mjs";
import { COHORT_SHORT, DOORS_CLOSE, EARLY_PRICE } from "./rangesEmail.mjs";
import {
  FINISH_JOINING_1H,
  FINISH_JOINING_24H,
  FINISH_JOINING_CLOSE,
  finishJoiningEmailType,
} from "./finishJoining.mjs";

export const FINISH_JOINING_SUBJECT = "Your spot's waiting, mama";
export const FINISH_JOINING_CTA = "Finish signing up, lock in your spot";
export const FINISH_JOINING_FOOTNOTE =
  `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you started an account. Reply anytime.</p>`;

const QUIZ_RATE_LINE = `<p>Your quiz rate is $${EARLY_PRICE}.</p>`;

export function safeFirstName(raw) {
  const full = safeDisplayName(raw);
  if (full === "Mama") return "Mama";
  return full.split(/\s+/)[0] || "Mama";
}

export function finishJoinUrl(email) {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) return `${APP_URL}/join`;
  const params = new URLSearchParams({ email: trimmed });
  return `${APP_URL}/join?${params.toString()}`;
}

export function finishJoiningCloseSubject(name) {
  return `${safeFirstName(name)}, last note from me`;
}

export function finishJoiningSubject(variant, name) {
  if (variant === "close" || variant === FINISH_JOINING_CLOSE) {
    return finishJoiningCloseSubject(name);
  }
  return FINISH_JOINING_SUBJECT;
}

function quizRateLine(quizUnlock) {
  return quizUnlock ? `\n${QUIZ_RATE_LINE}` : "";
}

export function buildFinishJoining1hBody({ quizUnlock = false } = {}) {
  return `
<p>You started joining Macros and Mamas. I'm glad you're here.</p>
<p>When you're ready: macros I build myself, our group Mon through Fri, and a short Monday voice note to keep the week simple. We start ${COHORT_SHORT}. Doors close ${DOORS_CLOSE}.</p>
<p>Finish signing up below to lock in your spot.</p>
${quizRateLine(quizUnlock)}<p>Callie</p>
${FINISH_JOINING_FOOTNOTE}`;
}

export function buildFinishJoining24hBody({ quizUnlock = false } = {}) {
  return `
<p>Just checking in. I'd still love to have you in this group.</p>
<p>Inside: macros built by me, not a calculator. Our group Mon through Fri. A short Monday voice note to set the week.</p>
<p>We start ${COHORT_SHORT}. Doors close ${DOORS_CLOSE} so I can hand-build ranges before day one. Finish signing up when you're ready.</p>
${quizRateLine(quizUnlock)}<p>Callie</p>
${FINISH_JOINING_FOOTNOTE}`;
}

export function buildFinishJoiningCloseBody({ quizUnlock = false } = {}) {
  return `
<p>Last note from me. Doors close ${DOORS_CLOSE}. We start Monday.</p>
<p>If you still want in, finish signing up. If something's unclear, reply. I read everything.</p>
${quizRateLine(quizUnlock)}<p>Callie</p>
${FINISH_JOINING_FOOTNOTE}`;
}

export function buildFinishJoiningPayload({
  variant,
  name,
  email,
  quizUnlock = false,
} = {}) {
  const first = safeFirstName(name);
  const step = finishJoiningEmailType(variant);
  const resolvedVariant = step === FINISH_JOINING_CLOSE
    ? "close"
    : step === FINISH_JOINING_24H
      ? "24h"
      : "1h";

  let body = buildFinishJoining1hBody({ quizUnlock });
  if (resolvedVariant === "24h") body = buildFinishJoining24hBody({ quizUnlock });
  if (resolvedVariant === "close") body = buildFinishJoiningCloseBody({ quizUnlock });

  return {
    variant: resolvedVariant,
    emailType: step,
    subject: finishJoiningSubject(resolvedVariant, first),
    header: `Hi ${first},`,
    body,
    cta_text: FINISH_JOINING_CTA,
    cta_url: finishJoinUrl(email),
  };
}

export { FINISH_JOINING_1H, FINISH_JOINING_24H, FINISH_JOINING_CLOSE };
