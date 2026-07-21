/** Email #1 — abandoned checkout nudge (variants: 1h | 24h) */
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
    const isFollowUp = variant === "24h";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject: "Your spot's waiting, mama",
      html: renderEmail({
        header: `Hi ${first},`,
        body: isFollowUp
          ? `
          <p>Just checking in — your Macros and Mamas spot is still open, and I'd love to have you.</p>
          <p>Inside: macros built by me (not a calculator), our WhatsApp group Mon–Fri, and a short Monday voice note to set the week. Founding rate is $149 — it ends when this group fills.</p>
          <p>Whenever you're ready, finish joining below. No pressure either way.</p>
          <p>Callie</p>
          <p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you started an account. Reply and ask me to stop anytime.</p>
        `
          : `
          <p>You started joining Macros and Mamas — I'm glad you're here.</p>
          <p>When you're ready: personalized macros I build myself, our moms WhatsApp group, and a Monday voice note to keep it simple. One button and you're in.</p>
          <p>Callie</p>
          <p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you started an account. Reply and ask me to stop anytime.</p>
        `,
        cta_text: "Finish joining — $149",
        cta_url: `${APP_URL}/join`,
      }),
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
