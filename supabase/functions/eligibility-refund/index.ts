import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { FROM_CALLIE, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const { email, name, reason } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";
    const r = String(reason || "");

    let subject = "Your refund is on its way";
    let lead = "";
    if (r === "pregnant") {
      subject = "Congratulations — and your refund is on its way";
      lead =
        "This program isn't recommended during pregnancy — your body needs abundance right now, not a deficit. Come back after baby arrives; we'd love to have you then.";
    } else if (r === "early" || r === "early_nursing") {
      subject = "Not yet, on purpose — refund confirmed";
      lead =
        "You're under three months postpartum while nursing, and we won't risk your milk supply while it's still establishing. Circle back once you pass the three-month mark; the program will be here.";
    } else if (r === "diet") {
      subject = "Not the right fit — refund confirmed";
      lead =
        "The program is built around animal protein, and I'd rather point you toward a coach who specializes in plant-based macros than give you a plan that fights you.";
    } else {
      lead = "This cohort isn't the right fit for you right now — and that's okay.";
    }

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      subject,
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>${lead}</p>
          <p><b>Your $149 has been fully refunded</b> — it'll land back on your card in a few days.</p>
          <p>If you left your email for the waitlist, I'll personally check in when the time is right.</p>
          <p>Take care of yourself, mama.<br/>Callie</p>
        `,
      }),
    });

    if (error) {
      console.error("eligibility-refund resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("eligibility-refund failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
