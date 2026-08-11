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
    const { email, name, preview, adminConversationId } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";
    const snippet = String(preview || "").trim().slice(0, 160);
    const adminBase = String(
      Deno.env.get("ADMIN_APP_URL") || APP_URL,
    ).replace(/\/$/, "");
    const destination = adminConversationId
      ? `${adminBase}/admin?tab=messages&dm=${encodeURIComponent(String(adminConversationId))}`
      : `${APP_URL}/dashboard?tab=messages`;

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject: "Callie sent you a message",
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>Callie left you a message in Macros and Mamas.</p>
          ${snippet ? `<p style="background:#FAF5F2;border-radius:12px;padding:12px 14px;color:#33272E"><i>${escapeHtml(snippet)}</i></p>` : ""}
          <p>Open the app → <b>Messages</b> to read and reply.</p>
        `,
        cta_text: "Open Messages",
        cta_url: destination,
      }),
    });

    if (error) {
      console.error("message-email resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("message-email failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
