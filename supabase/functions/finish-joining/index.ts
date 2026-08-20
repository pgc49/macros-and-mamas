/** Email #1 — abandoned checkout nudge (variants: 1h | 24h | close) */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const EARLY_PRICE = 249;
const DOORS_CLOSE = "Aug 27";
const COHORT_SHORT = "Aug 31";
const CTA = "Finish signing up, lock in your spot";
const FOOTNOTE =
  `<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you started an account. Reply anytime.</p>`;

function safeFirstName(raw: unknown) {
  const cleaned = String(raw || "")
    .replace(/[\r\n\0\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const first = (cleaned.split(/\s+/)[0] || "").trim();
  return first || "Mama";
}

function finishJoinUrl(email: string) {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) return `${APP_URL}/join`;
  return `${APP_URL}/join?email=${encodeURIComponent(trimmed)}`;
}

function quizRateLine(quizUnlock: boolean) {
  return quizUnlock ? `<p>Your quiz rate is $${EARLY_PRICE}.</p>` : "";
}

function fallbackBody(variant: string, quizUnlock: boolean) {
  const rate = quizRateLine(quizUnlock);
  if (variant === "close") {
    return `
          <p>Last note from me. Doors close ${DOORS_CLOSE}. We start Monday.</p>
          <p>If you still want in, finish signing up. If something's unclear, reply. I read everything.</p>
          ${rate}
          <p>Callie</p>
          ${FOOTNOTE}
        `;
  }
  if (variant === "24h") {
    return `
          <p>Just checking in. I'd still love to have you in this group.</p>
          <p>Inside: macros built by me, not a calculator. Our group Mon through Fri. A short Monday voice note to set the week.</p>
          <p>We start ${COHORT_SHORT}. Doors close ${DOORS_CLOSE} so I can hand-build ranges before day one. Finish signing up when you're ready.</p>
          ${rate}
          <p>Callie</p>
          ${FOOTNOTE}
        `;
  }
  return `
          <p>You started joining Macros and Mamas. I'm glad you're here.</p>
          <p>When you're ready: macros I build myself, our group Mon through Fri, and a short Monday voice note to keep the week simple. We start ${COHORT_SHORT}. Doors close ${DOORS_CLOSE}.</p>
          <p>Finish signing up below to lock in your spot.</p>
          ${rate}
          <p>Callie</p>
          ${FOOTNOTE}
        `;
}

function fallbackSubject(variant: string, first: string) {
  if (variant === "close") return `${first}, last note from me`;
  return "Your spot's waiting, mama";
}

function listUnsubscribeHeaders(unsubscribeUrl: string) {
  if (!unsubscribeUrl) return {};
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const payload = await req.json();
    const email = String(payload?.email || "").trim();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = safeFirstName(payload?.name);
    const variant = payload?.variant === "close"
      ? "close"
      : payload?.variant === "24h"
        ? "24h"
        : "1h";
    const quizUnlock = payload?.quizUnlock === true || payload?.quiz_unlock === true;
    const joinUrl = String(payload?.cta_url || finishJoinUrl(email));
    const unsubscribeUrl = String(payload?.unsubscribe_url || payload?.unsubscribeUrl || "");
    const subject = String(payload?.subject || fallbackSubject(variant, first));
    const header = String(payload?.header || `Hi ${first},`);
    const body = String(payload?.body || fallbackBody(variant, quizUnlock));
    const ctaText = String(payload?.cta_text || CTA);

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject,
      html: renderEmail({
        header,
        cta_text: ctaText,
        cta_url: joinUrl,
        unsubscribe_url: unsubscribeUrl || undefined,
        unsubscribe_label: "Unsubscribe from these emails",
      }),
      ...(unsubscribeUrl ? { headers: listUnsubscribeHeaders(unsubscribeUrl) } : {}),
    });

    if (error) {
      console.error("finish-joining resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("finish-joining failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
