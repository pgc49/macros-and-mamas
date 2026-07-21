const LLC_FOOTER =
  "Macros and Mamas · 2108 N St, Ste N, Sacramento, CA 95816 · Reply to this email anytime.";

export function renderEmail({
  header,
  body,
  cta_text,
  cta_url,
}: {
  header: string;
  body: string;
  cta_text?: string;
  cta_url?: string;
}) {
  const cta =
    cta_text && cta_url
      ? `<p style="margin:28px 0 8px">
          <a href="${cta_url}"
             style="display:inline-block;background:#B4416B;color:#ffffff;text-decoration:none;
                    font-weight:700;font-size:15px;padding:14px 22px;border-radius:999px">
            ${cta_text}
          </a>
        </p>`
      : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF5F2;font-family:Georgia,'Times New Roman',serif;color:#33272E">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F53;font-family:Helvetica,Arial,sans-serif;margin-bottom:18px">
      Macros and Mamas
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #ECDEE2">
      <h1 style="font-size:26px;font-weight:400;line-height:1.25;margin:0 0 16px">${header}</h1>
      <div style="font-size:16px;line-height:1.65;font-family:Helvetica,Arial,sans-serif;color:#33272E">
        ${body}
      </div>
      ${cta}
    </div>
    <p style="font-size:12px;line-height:1.5;color:#6E5D66;font-family:Helvetica,Arial,sans-serif;margin:18px 8px 0">
      ${LLC_FOOTER}
    </p>
  </div>
</body>
</html>`;
}

export const FROM_CALLIE = "Callie · Macros and Mamas <calista@nourishwithcalista.com>";
export const APP_URL = Deno.env.get("APP_URL") || "https://www.macrosandmamas.com";
export const CALLIE_NOTIFY_EMAIL =
  Deno.env.get("CALLIE_NOTIFY_EMAIL") || "calista@nourishwithcalista.com";
/** Co-owner ops alerts (payment / intake / refund). Comma-separated ok. */
export const OWNER_NOTIFY_EMAIL =
  Deno.env.get("OWNER_NOTIFY_EMAIL") || "pgchammas@gmail.com";

export function notifyRecipients(): string[] {
  const raw = [CALLIE_NOTIFY_EMAIL, OWNER_NOTIFY_EMAIL]
    .flatMap((s) => String(s || "").split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(raw)];
}
