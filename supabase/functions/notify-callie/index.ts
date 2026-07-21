import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, notifyRecipients } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { type, name, email, reason, stats } = body;
    if (!type) return jsonResponse({ error: "missing type" }, 400);

    const display = name || email || "Mama";
    let subject = `Macros and Mamas — ${type}`;
    let text = "";

    if (type === "payment") {
      subject = `💰 New mama: ${display} — paid $149`;
      text = [
        `${display} just paid $149.`,
        email ? `Email: ${email}` : "",
        `If intake stalls, nudge her from admin.`,
        `${APP_URL}/admin`,
      ]
        .filter(Boolean)
        .join("\n");
    } else if (type === "intake") {
      subject = `✅ ${display} finished intake — review + approve`;
      const s = stats || {};
      text = [
        `${display} submitted intake.`,
        email ? `Email: ${email}` : "",
        s.age != null ? `Age: ${s.age}` : "",
        s.currentWeight != null || s.goalWeight != null
          ? `Weight: ${s.currentWeight ?? "?"} → ${s.goalWeight ?? "?"} lbs`
          : "",
        s.breastfeeding != null
          ? `Breastfeeding: ${s.breastfeeding ? "yes" : "no"}${s.monthsPP != null ? ` (${s.monthsPP} mo pp)` : ""}`
          : "",
        s.tastes ? `Tastes: ${s.tastes}` : "",
        s.seasonNote ? `Season note: ${s.seasonNote}` : "",
        s.phone ? `Phone: ${s.phone}` : "",
        "",
        `Review + approve: ${APP_URL}/admin`,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    } else if (type === "refund") {
      subject = `↩️ Refund: ${display} (${reason || "eligibility"}) — waitlisted`;
      text = [
        `Auto-refund issued for ${display}.`,
        email ? `Email: ${email}` : "",
        `Reason: ${reason || "eligibility"}`,
        "They should be on the waitlist if they left an email.",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      return jsonResponse({ error: "unknown type" }, 400);
    }

    const to = notifyRecipients();
    if (!to.length) return jsonResponse({ error: "no notify recipients" }, 500);

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to,
      subject,
      text,
    });

    if (error) {
      console.error("notify-callie resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("notify-callie failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
