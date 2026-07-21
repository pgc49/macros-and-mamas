/** Email #3 — paid but intake incomplete (variants: 24h | 72h) */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const { email, name, variant } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";
    const isFollowUp = variant === "72h";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject: "I can't build your macros yet",
      html: renderEmail({
        header: `Hi ${first},`,
        body: isFollowUp
          ? `
          <p>Your spot is paid for, but your numbers are still waiting on you — about 3 minutes and I'll get to work.</p>
          <p>If anything's confusing, just reply to this email. I read everything, and I'd rather unblock you than lose you.</p>
          <p>Callie</p>
        `
          : `
          <p>Your spot is paid for, but your numbers are waiting on you — 3 minutes and I'll get to work.</p>
          <p>Finish your intake whenever you can; that's what I need before I build your ranges.</p>
          <p>Callie</p>
        `,
        cta_text: "Complete my intake",
        cta_url: `${APP_URL}/onboarding`,
      }),
    });

    if (error) {
      console.error("intake-reminder resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("intake-reminder failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
