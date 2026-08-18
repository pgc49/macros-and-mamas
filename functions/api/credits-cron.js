/* ==================================================================
   /functions/api/credits-cron.js — vest pending credits + mirror to Stripe
   ==================================================================
   Auth: Authorization: Bearer $CRON_SECRET
   Schedule: GitHub Actions hourly (same secret as email-cron).
   ================================================================== */

import { runCreditsCron } from "../_shared/credits.js";
import { backfillReferralCodes } from "../_shared/referrals.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);
    const stats = await runCreditsCron(env);
    let codes = null;
    try {
      codes = await backfillReferralCodes(env);
    } catch (codeErr) {
      console.error("ensure referral codes failed", codeErr);
    }
    return json({ ok: true, ...stats, codes }, 200);
  } catch (e) {
    console.error("credits-cron failed", e);
    return json({ error: "credits cron failed" }, 500);
  }
}

function authorize(request, env) {
  const secret = String(env.CRON_SECRET || "");
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  return timingSafeEqual(auth.slice(7), secret);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
