/**
 * Quiz ranges delivery email — conversion surface, not just a receipt.
 * Em dashes are banned in this email (brand copy rule).
 */
import { escapeHtml, APP_URL } from "./emailLayout.mjs";

export const EARLY_PRICE = 249;
export const FULL_PRICE = 299;
export const DOORS_CLOSE = "Aug 27";
export const COHORT_SHORT = "Aug 31";

const CTA_BTN_STYLE =
  "display:inline-block;background:#B4416B;color:#ffffff;text-decoration:none;"
  + "font-weight:700;font-size:15px;padding:14px 22px;border-radius:999px";

export function quizJoinUrl(email) {
  const params = new URLSearchParams({ from: "quiz" });
  const trimmed = String(email || "").trim().toLowerCase();
  if (trimmed) params.set("email", trimmed);
  return `${APP_URL}/join?${params.toString()}`;
}

export function emailCtaButton(text, url) {
  if (!text || !url) return "";
  return `<p style="margin:28px 0 8px">
          <a href="${escapeHtml(url)}"
             style="${CTA_BTN_STYLE}">
            ${escapeHtml(text)}
          </a>
        </p>`;
}

export function rangesOfferBlock(joinUrl, {
  earlyPrice = EARLY_PRICE,
  fullPrice = FULL_PRICE,
  doorsClose = DOORS_CLOSE,
  cohortShort = COHORT_SHORT,
} = {}) {
  const save = Math.max(0, Number(fullPrice) - Number(earlyPrice));
  return `<p><strong>Your quiz also unlocked the $${earlyPrice} early rate</strong> ($${save} off $${fullPrice}). The ${cohortShort} group is capped at 50 mamas, and doors close ${doorsClose} so Callie can hand-build every set of ranges before day one.</p>
${emailCtaButton(`Lock my spot · $${earlyPrice}`, joinUrl)}`;
}

export function buildEligibleRangesEmailBody({
  earlyPp = false,
  needsReview = false,
  feedHtml = "",
  bands,
  joinUrl,
} = {}) {
  const early = earlyPp
    ? `<p><strong>Here's a preview based on your answers.</strong> Early postpartum is welcome. If you join, Callie builds your final ranges gently and supply-aware for this season.</p>`
    : "";
  const reviewNote = needsReview
    ? `<p><strong>Callie will still review your finals personally</strong>. A couple of your answers mean she wants eyes on them before day one. The bands below are a preview so you can see how the app works.</p>`
    : "";
  return `
${early}
${reviewNote}
<p>Here are your bands, built the same way Callie builds them for the program:</p>
<ul>
<li><strong>Protein:</strong> ${escapeHtml(bands.protein)}</li>
<li><strong>Carbs:</strong> ${escapeHtml(bands.carbs)}</li>
<li><strong>Fat:</strong> ${escapeHtml(bands.fat)}</li>
<li><strong>Calories land around:</strong> ${escapeHtml(bands.calories)}</li>
</ul>
${feedHtml}
${rangesOfferBlock(joinUrl)}
<p>These are bands, not one rigid number. Busier day, eat toward the top. Quieter day, the bottom. Both count as a win. Lead with protein; the rest gets easier.</p>
<p><strong>Your next step:</strong> create your account and finish checkout to lock in your spot. Use this same email so your ranges stay attached.</p>
<p>If you join, Callie builds and approves your final numbers before you start.</p>
<p>Callie</p>
<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime.</p>`;
}

export const RANGES_EMAIL_BOTTOM_CTA = "Finish signing up, lock in your spot";
