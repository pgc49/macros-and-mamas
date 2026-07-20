import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, name } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      subject: "Got it — I'm building your macros right now",
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>I have your intake — thank you. I'm reviewing your numbers personally and you'll usually have them within a day.</p>
          <p>When I approve, your dashboard unlocks and your WhatsApp group invite lands by text.</p>
          <p>If your before photos and first weigh-in are still on the list — now's the moment.</p>
          <p>Callie</p>
        `,
        cta_text: "See my pending status",
        cta_url: `${APP_URL}/pending`,
      }),
    });

    if (error) {
      console.error("intake-received resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("intake-received failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
