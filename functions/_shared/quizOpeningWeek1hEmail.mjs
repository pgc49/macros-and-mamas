/**
 * Opening-week +1h quiz follow-up copy.
 * Distinct subject from "Your ranges" so Gmail does not thread.
 * Em dashes are banned (brand copy rule). No fake deadline.
 */
import { APP_URL } from "./emailLayout.mjs";
import { finishJoinUrl } from "./finishJoiningEmail.mjs";
import { quizJoinUrl, EARLY_PRICE, COHORT_SHORT } from "./rangesEmail.mjs";
import { safeDisplayName } from "./quizDripEmail.mjs";
import { QUIZ_OPENING_WEEK_1H } from "./quizOpeningWeek1h.mjs";

export const OPENING_WEEK_1H_JOIN_CTA = `Join for $${EARLY_PRICE} after your quiz`;
export const OPENING_WEEK_1H_CHECKOUT_CTA = "Finish checkout";

const QUIZ_FOOTNOTE =
  `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime.</p>`;

export function safeFirstName(raw) {
  const full = safeDisplayName(raw);
  if (full === "Mama") return "Mama";
  return full.split(/\s+/)[0] || "Mama";
}

export function openingWeek1hSubject(name) {
  return `${safeFirstName(name)}, the next group starts ${COHORT_SHORT}`;
}

export function withOpeningWeekAttribution(url) {
  const href = String(url || "").trim();
  if (!href) return `${APP_URL}/join`;
  try {
    const parsed = new URL(href);
    parsed.searchParams.set("utm_source", "email");
    parsed.searchParams.set("utm_medium", "lifecycle");
    parsed.searchParams.set("utm_campaign", QUIZ_OPENING_WEEK_1H);
    parsed.searchParams.set("utm_content", QUIZ_OPENING_WEEK_1H);
    return parsed.toString();
  } catch {
    return href;
  }
}

export function openingWeek1hCtaUrl(email, { hasProfile = false } = {}) {
  const base = hasProfile ? finishJoinUrl(email) : quizJoinUrl(email);
  return withOpeningWeekAttribution(base);
}

export function buildOpeningWeek1hBody() {
  return `
<p>You have your ranges. This group starts Monday, ${COHORT_SHORT}. Your quiz rate is still $${EARLY_PRICE}. Join when you're ready. If you come in during the first weeks of November, you're still in this group.</p>
<p>You'll have the mama community when you need it, plus me coaching you through the week.</p>
<p>Questions? Just reply. It comes to me.</p>
<p>Callie<br/>Macros and Mamas</p>
${QUIZ_FOOTNOTE}`;
}

export function buildOpeningWeek1hPayload({ firstName, email, hasProfile = false } = {}) {
  const name = safeFirstName(firstName);
  const ctaKind = hasProfile ? "checkout" : "join";
  return {
    emailType: QUIZ_OPENING_WEEK_1H,
    subject: openingWeek1hSubject(name),
    header: `Hi ${name},`,
    body: buildOpeningWeek1hBody(),
    cta_text: hasProfile ? OPENING_WEEK_1H_CHECKOUT_CTA : OPENING_WEEK_1H_JOIN_CTA,
    cta_url: openingWeek1hCtaUrl(email, { hasProfile }),
    ctaKind,
  };
}

export function openingWeek1hPreviewText(firstName = "Mama", { hasProfile = false } = {}) {
  const name = safeFirstName(firstName);
  const cta = hasProfile ? OPENING_WEEK_1H_CHECKOUT_CTA : OPENING_WEEK_1H_JOIN_CTA;
  return [
    `Hi ${name},`,
    "",
    `You have your ranges. This group starts Monday, ${COHORT_SHORT}. Your quiz rate is still $${EARLY_PRICE}. Join when you're ready. If you come in during the first weeks of November, you're still in this group.`,
    "",
    "You'll have the mama community when you need it, plus me coaching you through the week.",
    "",
    `[${cta}]`,
    "",
    "Questions? Just reply. It comes to me.",
    "",
    "Callie",
    "Macros and Mamas",
  ].join("\n");
}
