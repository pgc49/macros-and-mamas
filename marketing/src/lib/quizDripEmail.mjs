/**
 * Track A quiz-lead drip copy. Voice matches the immediate ranges email:
 * first-person Callie, warm, short, no hype, reply anytime.
 * Em dashes are banned (brand copy rule).
 *
 * Subjects stay distinct from the first ranges email so Gmail does not thread.
 */
import {
  RANGES_EMAIL_BOTTOM_CTA,
  rangesOfferBlock,
} from "./rangesEmail.mjs";
import {
  QUIZ_DRIP_2D,
  QUIZ_DRIP_7D,
  QUIZ_PREGNANCY_NOTE,
} from "./quizDrip.mjs";

export function safeDisplayName(raw) {
  const cleaned = String(raw || "")
    .replace(/[\r\n\0\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "Mama";
}

const QUIZ_FOOTNOTE =
  `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime.</p>`;

export function quizDripSubject(step, name) {
  const who = safeDisplayName(name);
  if (step === QUIZ_DRIP_2D) return `${who}, the numbers are the easy part`;
  if (step === QUIZ_DRIP_7D) return `${who}, still want in?`;
  if (step === QUIZ_PREGNANCY_NOTE) return `${who}, whenever you're ready`;
  return `Hi ${who}`;
}

export function buildQuizDrip2Body() {
  return `
<p>The ranges I sent you are a starting point. They're not the whole program.</p>
<p>What we actually do together is the weekly check-in. Milk changes, sleep falls apart, appetite swings. That's when the numbers need a person, not a calculator.</p>
<p>If you want that, finish signing up and lock in your spot. Same email so your ranges stay attached.</p>
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildQuizDrip7Body({ joinUrl } = {}) {
  return `
<p>Last note from me on this. If you still want in, finish signing up and lock in your spot. If you have a question, reply. I read everything.</p>
${rangesOfferBlock(joinUrl)}
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildPregnancyNoteBody() {
  return `
<p>Just a light note, like I promised. Pregnancy is still an abundance season, not a cut. We're not sending ranges or a signup push.</p>
<p>When you're postpartum and ready, come back for your numbers. Until then, eat enough and rest when you can.</p>
<p>Reply anytime if you want to talk. No rush.</p>
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildQuizDripPayload({ step, firstName, joinUrl }) {
  const name = safeDisplayName(firstName);
  const subject = quizDripSubject(step, name);
  const header = `Hi ${name},`;
  const salesCta = {
    cta_text: RANGES_EMAIL_BOTTOM_CTA,
    cta_url: joinUrl,
  };

  if (step === QUIZ_DRIP_2D) {
    return {
      subject,
      header,
      body: buildQuizDrip2Body(),
      ...salesCta,
    };
  }
  if (step === QUIZ_DRIP_7D) {
    return {
      subject,
      header,
      body: buildQuizDrip7Body({ joinUrl }),
      ...salesCta,
    };
  }
  if (step === QUIZ_PREGNANCY_NOTE) {
    return {
      subject,
      header,
      body: buildPregnancyNoteBody(),
    };
  }
  return null;
}

export { RANGES_EMAIL_BOTTOM_CTA };
