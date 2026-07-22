/**
 * Email #5 — Your macros are live (Callie taps Approve).
 * Slug kept as application-approved for the already-deployed function.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, WHATSAPP_GROUP_URL, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const { email, name } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      subject: "Your ranges are ready 🤍",
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>I just finished your numbers — they're live in your dashboard right now, built from everything you told me. Remember: these are ranges, not rules. Active day, eat the top. Slow day, the bottom. Both count.</p>
          <p><b>Join the mamas group chat</b> — I'm in there Monday through Friday answering in voice notes. Come say hi so I can welcome you properly:</p>
          <p><a href="${WHATSAPP_GROUP_URL}" style="color:#B4416B;font-weight:700">Tap here to join WhatsApp</a></p>
          <p><b>Your first 48 hours, and this is the whole assignment:</b></p>
          <ol>
            <li><b>Today:</b> log one meal. Tap it from your plan, snap it, or type it. Just one.</li>
            <li><b>Tomorrow morning:</b> log your weigh-in.</li>
            <li><b>In the group:</b> say hi. That's it.</li>
          </ol>
          <p><b>One phone tip that makes this feel like an app:</b> open macrosandmamas.com in Safari (iPhone) or Chrome (Android), tap Share, then <b>Add to Home Screen</b>. You'll get an icon on your phone — tap it anytime and you're right back in your dashboard. No App Store needed.</p>
          <p>Small on purpose. Mamas who do these three in the first two days are the ones standing in their week-8 photos amazed. Let's go.</p>
          <p>Callie</p>
        `,
        cta_text: "Open my dashboard",
        cta_url: `${APP_URL}/dashboard`,
      }),
    });

    if (error) {
      console.error("application-approved resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("application-approved failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
