import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, notifyRecipients, CALLIE_NOTIFY_EMAIL, OWNER_NOTIFY_EMAIL } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { type, name, email, reason, stats, amountUsd } = body;
    if (!type) return jsonResponse({ error: "missing type" }, 400);

    const display = name || email || "Mama";
    let subject = `Macros and Mamas — ${type}`;
    let text = "";

    if (type === "payment") {
      const amountNum = Number(amountUsd);
      const paidLabel =
        Number.isFinite(amountNum) && amountNum > 0
          ? `$${Math.round(amountNum)}`
          : null;
      subject = paidLabel
        ? `💰 New mama: ${display} — paid ${paidLabel}`
        : `💰 New mama: ${display} — paid`;
      text = [
        paidLabel
          ? `${display} just paid ${paidLabel}.`
          : `${display} just paid.`,
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
        s.pregnant
          ? `⚠️ Pregnant — review 1:1 before approving or refunding (no auto-deny)`
          : "",
        s.breastfeeding
          ? `⚠️ Postpartum / nursing${s.monthsPP != null ? ` (${s.monthsPP} mo pp)` : ""} — review 1:1 (no auto-deny)`
          : "",
        s.diet && s.diet !== "none"
          ? `⚠️ Diet: ${s.diet} — connect before approving (no auto-refund)`
          : "",
        s.tastes ? `Tastes: ${s.tastes}` : "",
        s.seasonNote ? `Season note: ${s.seasonNote}` : "",
        s.phone ? `Phone: ${s.phone}` : "",
        "",
        `Review + approve: ${APP_URL}/admin`,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    } else if (type === "eligibility_hold") {
      const label = reason === "pregnant" ? "pregnant" : "early nursing (<3 mo)";
      subject = `⚠️ ${display} — ${label} (no auto-refund)`;
      const s = stats || {};
      text = [
        `${display} hit an eligibility gate during intake.`,
        email ? `Email: ${email}` : "",
        `Reason: ${label}`,
        s.monthsPP != null && s.monthsPP !== "" ? `Months postpartum: ${s.monthsPP}` : "",
        "",
        "No auto-refund was issued. Reach out 1:1 and decide whether to refund in Stripe.",
        `${APP_URL}/admin`,
      ]
        .filter(Boolean)
        .join("\n");
    } else if (type === "refund") {
      subject = `↩️ Refund: ${display} (${reason || "eligibility"}) — waitlisted`;
      text = [
        `Refund recorded for ${display}.`,
        email ? `Email: ${email}` : "",
        `Reason: ${reason || "eligibility"}`,
        "They should be on the waitlist if they left an email.",
      ]
        .filter(Boolean)
        .join("\n");
    } else if (type === "message") {
      const s = stats || {};
      subject = `💬 Message from ${display}`;
      text = [
        `${display} sent you a message in the app.`,
        email ? `Email: ${email}` : "",
        s.clientId ? `Client id: ${s.clientId}` : "",
        "",
        "Preview:",
        s.message || "(empty)",
        "",
        `Reply in admin → Messages: ${APP_URL}/admin?tab=messages`,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    } else if (type === "support") {
      // Tech/support fallback when GitHub issue create fails — owner only (not Callie).
      const s = stats || {};
      subject = `🛠️ Support (email fallback): ${display}`;
      text = [
        `${display} submitted a tech/support report.`,
        email ? `Email: ${email}` : "",
        s.route ? `Route: ${s.route}` : "",
        s.appVersion ? `App version: ${s.appVersion}` : "",
        s.userAgent ? `UA: ${s.userAgent}` : "",
        s.githubError ? `GitHub error: ${s.githubError}` : "",
        "",
        "Message:",
        s.message || "(empty)",
        "",
        s.screenshotSignedUrl ? `Screenshot (signed, ~7d): ${s.screenshotSignedUrl}` : "",
        "",
        "GitHub issue create failed — this is the fallback path. Fix GITHUB_TOKEN if needed.",
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    } else {
      return jsonResponse({ error: "unknown type" }, 400);
    }

    // Support fallback → owner only. Message alerts → Callie only (not Patrick).
    // Everything else → Callie + owner.
    const to = type === "support"
      ? [...new Set(
          String(OWNER_NOTIFY_EMAIL || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        )]
      : type === "message"
        ? [...new Set(
            String(CALLIE_NOTIFY_EMAIL || "")
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          )]
      : notifyRecipients();
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
