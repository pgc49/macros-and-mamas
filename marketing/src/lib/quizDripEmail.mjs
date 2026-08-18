/**
 * Quiz-lead drip copy. Voice matches the immediate ranges email:
 * first-person Callie, warm, short, no hype, reply anytime.
 * Em dashes are banned (brand copy rule).
 */
import { escapeHtml } from "./emailLayout.mjs";
import {
  RANGES_EMAIL_BOTTOM_CTA,
  rangesOfferBlock,
} from "./rangesEmail.mjs";
import {
  QUIZ_DRIP_1D,
  QUIZ_DRIP_3D,
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

export function formatStoredBands(lead) {
  if (lead == null) return null;
  const proteinLow = Number(lead.protein_low_g);
  const proteinHigh = Number(lead.protein_high_g);
  if (!Number.isFinite(proteinLow) || !Number.isFinite(proteinHigh)) return null;
  const fmt = (n) => Number(n).toLocaleString("en-US");
  return {
    protein: `${lead.protein_low_g}–${lead.protein_high_g} g`,
    carbs: `${lead.carbs_low_g}–${lead.carbs_high_g} g`,
    fat: `${lead.fat_low_g}–${lead.fat_high_g} g`,
    calories: `${fmt(lead.calories_low)}–${fmt(lead.calories_high)}`,
  };
}

function bandsList(bands) {
  if (!bands) return "";
  return `<p>Here's a quick recap of your bands:</p>
<ul>
<li><strong>Protein:</strong> ${escapeHtml(bands.protein)}</li>
<li><strong>Carbs:</strong> ${escapeHtml(bands.carbs)}</li>
<li><strong>Fat:</strong> ${escapeHtml(bands.fat)}</li>
<li><strong>Calories land around:</strong> ${escapeHtml(bands.calories)}</li>
</ul>`;
}

const QUIZ_FOOTNOTE =
  `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime.</p>`;

export function quizDripSubject(step, name) {
  const who = safeDisplayName(name);
  if (step === QUIZ_DRIP_1D) return `${who}, your ranges are still here`;
  if (step === QUIZ_DRIP_3D) return `${who}, the numbers are the easy part`;
  if (step === QUIZ_DRIP_7D) return `${who}, still want in?`;
  if (step === QUIZ_PREGNANCY_NOTE) return `${who}, a light note like I promised`;
  return `Hi ${who}`;
}

export function buildQuizDrip1Body({ bands, joinUrl } = {}) {
  const recap = bands
    ? bandsList(bands)
    : `<p>Your ranges are still here when you're ready.</p>`;
  return `
${recap}
${rangesOfferBlock(joinUrl)}
<p>These are still bands, not one rigid number. Create your account and finish checkout to lock in your spot. Use this same email so your ranges stay attached.</p>
<p>Callie</p>
${QUIZ_FOOTNOTE}`;
}

export function buildQuizDrip3Body() {
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

export function buildQuizDripPayload({ step, firstName, email, lead, joinUrl }) {
  const name = safeDisplayName(firstName);
  const subject = quizDripSubject(step, name);
  const header = `Hi ${name},`;
  const bands = formatStoredBands(lead);
  const salesCta = {
    cta_text: RANGES_EMAIL_BOTTOM_CTA,
    cta_url: joinUrl,
  };

  if (step === QUIZ_DRIP_1D) {
    return {
      subject,
      header,
      body: buildQuizDrip1Body({ bands, joinUrl }),
      ...salesCta,
    };
  }
  if (step === QUIZ_DRIP_3D) {
    return {
      subject,
      header,
      body: buildQuizDrip3Body(),
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
