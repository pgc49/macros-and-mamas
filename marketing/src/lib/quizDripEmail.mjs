/**
 * Track A quiz-lead drip copy. Voice matches the immediate ranges email:
 * first-person Callie, warm, short, no hype, reply anytime.
 * Em dashes are banned (brand copy rule).
 *
 * Subjects stay distinct from the first ranges email so Gmail does not thread.
 */
import {
  COHORT_SHORT,
  DOORS_CLOSE,
  EARLY_PRICE,
  RANGES_EMAIL_BOTTOM_CTA,
  SPLIT_AT_CHECKOUT,
  rangesOfferBlock,
} from "./rangesEmail.mjs";

export const COTI_NURSING_QUOTE =
  "I've never been able to lose weight while nursing — with any of my children — until now.";
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
<p>This group starts Monday, ${COHORT_SHORT}. Doors close ${DOORS_CLOSE} so I can build everyone's ranges first.</p>
<p>If you want that, finish signing up. Same email so your ranges stay attached. Your quiz rate is $${EARLY_PRICE}.</p>
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildQuizDrip7Body({ joinUrl } = {}) {
  return `
<p>The ranges I sent you are the easy part. The 8 weeks is me adjusting them when milk, sleep, and appetite change.</p>
<p>Coti, a nursing mama of three in this group, said it better than I can: "${COTI_NURSING_QUOTE}"</p>
<p>Doors close tomorrow night. We start Monday, ${COHORT_SHORT}.</p>
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
    cta_note: SPLIT_AT_CHECKOUT,
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
