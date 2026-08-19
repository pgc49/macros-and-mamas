/* ==================================================================
   GET|POST /api/unsubscribe — quiz / marketing email opt-out
   ==================================================================
   Signed link: /api/unsubscribe?e=<email>&t=<hmac>
   POST also accepts Gmail one-click (List-Unsubscribe=One-Click).
   ================================================================== */

import {
  normalizeEmail,
  recordUnsubscribe,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "../_shared/emailUnsubscribe.mjs";

export async function onRequestGet(context) {
  return handleUnsubscribe(context);
}

export async function onRequestPost(context) {
  return handleUnsubscribe(context);
}

async function handleUnsubscribe({ request, env }) {
  const url = new URL(request.url);
  let email = normalizeEmail(url.searchParams.get("e") || url.searchParams.get("email"));
  let token = String(url.searchParams.get("t") || url.searchParams.get("token") || "").trim();

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      email = normalizeEmail(body.email || body.e || email);
      token = String(body.token || body.t || token).trim();
    }
  }

  if (!email || !token) {
    return htmlPage(400, "This unsubscribe link is missing information.");
  }

  const secret = unsubscribeSecret(env);
  if (!secret || !(await verifyUnsubscribeToken(secret, email, token))) {
    return htmlPage(400, "This unsubscribe link isn't valid.");
  }

  const result = await recordUnsubscribe(env, email, request.method === "POST" ? "one_click" : "link");
  if (!result.ok) {
    return htmlPage(502, "We couldn't save that just now. Reply to Callie and she'll take you off.");
  }

  return htmlPage(200, "You're unsubscribed from quiz emails. You can still reply to Callie if you have a question.");
}

function htmlPage(status, message) {
  const safe = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribe · Macros and Mamas</title>
</head>
<body style="margin:0;padding:0;background:#FAF5F2;font-family:Georgia,'Times New Roman',serif;color:#33272E">
  <div style="max-width:560px;margin:0 auto;padding:48px 20px">
    <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F53;font-family:Helvetica,Arial,sans-serif;margin-bottom:18px">
      Macros and Mamas
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #ECDEE2">
      <p style="font-size:18px;line-height:1.55;font-family:Helvetica,Arial,sans-serif;margin:0">${safe}</p>
    </div>
  </div>
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
