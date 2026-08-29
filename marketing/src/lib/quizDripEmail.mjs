/**
 * Track A quiz-lead drip copy. Voice matches the immediate ranges email:
 * first-person Callie, warm, short, no hype, reply anytime.
 * Em dashes are banned (brand copy rule).
 *
 * Subjects stay distinct from the first ranges email so Gmail does not thread.
 */
import {
  COHORT_SHORT,
  EARLY_PRICE,
  RANGES_EMAIL_BOTTOM_CTA,
  SPLIT_AT_CHECKOUT,
  emailCtaButton,
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
<p>This group starts Monday, ${COHORT_SHORT}.</p>
<p>If you want that, finish signing up. Same email so your ranges stay attached. Your quiz rate is $${EARLY_PRICE}.</p>
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildQuizDrip7Body({ joinUrl } = {}) {
  return `
<p>A few days ago you took 90 seconds to answer some questions and got your macros back. Maybe you're still nursing and running on fumes. Maybe you're years past that stage, but somehow still last on your own list. Either way, I've looked at a lot of these questionnaires this week, and I keep seeing the same story: women who show up for everyone else, every single day, and quietly keep telling themselves "I'll get to me later."</p>
<p>I want to gently say something to you: later keeps not coming. And you deserve better than that.</p>
<p>Here's what I know after doing this work for years: timing is never going to feel perfect. There will always be a reason to wait: a sleep regression, a busy season at work, a kid who needs you at 2am. But your health isn't a reward you get after everything else is handled. It's the thing that lets you handle everything else.</p>
<p>Your macros were just the starting point. The real transformation happens inside Macros and Mamas, where you're not figuring this out alone at 11pm with fifteen browser tabs open. You'll have me in your corner, plus a whole cohort of women who get it, for accountability, for troubleshooting the hard weeks, for celebrating the wins that feel small but aren't.</p>
<p>The group starts Monday, ${COHORT_SHORT}. Because you took the quiz, your spot is $${EARLY_PRICE} (that's $50 off, already applied).</p>
<p>If you've been waiting for a sign that it's your turn, this is it.</p>
${emailCtaButton(`Lock my spot · $${EARLY_PRICE}`, joinUrl)}
<p>I'd be so honored to walk this with you.</p>
<p>With love,<br/>Callie</p>
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
