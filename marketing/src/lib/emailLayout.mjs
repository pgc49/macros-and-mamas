/**
 * Branded HTML wrapper for Resend emails (quiz + lifecycle parity).
 * Keep visual styles aligned with supabase/functions/_shared/emailTemplates.ts.
 */

const LLC_FOOTER =
  "Macros and Mamas · 2108 N St, Ste N, Sacramento, CA 95816 · Reply to this email anytime.";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpsUrl(url) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/**
 * @param {{ header: string, body: string, cta_text?: string, cta_url?: string, unsubscribe_url?: string }} opts
 * header / cta_text are escaped; body is trusted markup (escape any user bits at call site).
 */
export function renderEmail({ header, body, cta_text, cta_url, unsubscribe_url }) {
  const safeHeader = escapeHtml(header);
  const safeCtaText = cta_text ? escapeHtml(cta_text) : "";
  const safeCtaUrl = safeHttpsUrl(cta_url);
  const safeUnsubUrl = safeHttpsUrl(unsubscribe_url);
  const cta =
    safeCtaText && safeCtaUrl
      ? `<p style="margin:28px 0 8px">
          <a href="${escapeHtml(safeCtaUrl)}"
             style="display:inline-block;background:#B4416B;color:#ffffff;text-decoration:none;
                    font-weight:700;font-size:15px;padding:14px 22px;border-radius:999px">
            ${safeCtaText}
          </a>
        </p>`
      : "";
  const unsub = safeUnsubUrl
    ? `<br/><a href="${escapeHtml(safeUnsubUrl)}" style="color:#6E5D66;text-decoration:underline">Unsubscribe from quiz emails</a>`
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF5F2;font-family:Georgia,'Times New Roman',serif;color:#33272E">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F53;font-family:Helvetica,Arial,sans-serif;margin-bottom:18px">
      Macros and Mamas
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #ECDEE2">
      <h1 style="font-size:26px;font-weight:400;line-height:1.25;margin:0 0 16px">${safeHeader}</h1>
      <div style="font-size:16px;line-height:1.65;font-family:Helvetica,Arial,sans-serif;color:#33272E">
        ${body}
      </div>
      ${cta}
    </div>
    <p style="font-size:12px;line-height:1.5;color:#6E5D66;font-family:Helvetica,Arial,sans-serif;margin:18px 8px 0">
      ${LLC_FOOTER}${unsub}
    </p>
  </div>
</body>
</html>`;
}

export const FROM_CALLIE =
  "Callie · Macros and Mamas <calista@nourishwithcalista.com>";
export const APP_URL = "https://www.macrosandmamas.com";
