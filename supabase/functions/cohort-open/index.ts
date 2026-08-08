/** Cohort waitlist open — bulk invite to create account + pay */
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
    const { email, name } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject: "Spots are open — your waitlist rate $249",
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>You asked to be first in line for the next Macros and Mamas group — and spots are open.</p>
          <p>Because you joined the waitlist early, your rate is <b>$249</b> (full price is $299). Create your account (or sign in), then lock in that waitlist price. Inside: macros I build myself, our moms WhatsApp group Mon–Fri, and a short Monday voice note to keep the week simple.</p>
          <p>Tap below when you're ready. I'd love to have you.</p>
          <p>Callie</p>
          <p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you joined the waitlist. Reply and ask me to stop anytime.</p>
        `,
        cta_text: "Create account & join — $249",
        // /signin defaults to create for cold visitors; unpaid users land on /join to pay.
        cta_url: `${APP_URL}/signin`,
      }),
    });

    if (error) {
      console.error("cohort-open resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("cohort-open failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
