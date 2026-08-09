/* ==================================================================
   /functions/api/membership-cancel.js — In-app cancel + $19 save offer
   ==================================================================
   POST { action: "save_offer" } → cancel_at_period_end, tier=alumni_19,
     remove group chats, log cancel_saves, email admin (manual $19 Stripe).
   POST { action: "confirm_cancel" } → cancel_at_period_end only; access
     until period end, then webhook clears tier.
   ================================================================== */

import {
  fetchProfileForAccess,
  removeAllGroupChats,
  stripeCancelAtPeriodEnd,
  syncSubscriptionToProfile,
} from "../_shared/membership.js";
import {
  creditsPayloadForUi,
  listLedgerForUser,
} from "../_shared/credits.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    if (action !== "save_offer" && action !== "confirm_cancel") {
      return json({ error: "unknown action" }, 400);
    }

    const profile = await fetchProfileForAccess(env, user.id);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);
    if (profile.tier === "alumni_19") {
      return json({ error: "already on app-only plan" }, 409);
    }

    const status = String(profile.subscription_status || "");
    if (status !== "trialing" && status !== "active") {
      return json({ error: "no active membership to cancel" }, 409);
    }
    if (profile.subscription_cancel_at_period_end) {
      return json({ error: "cancellation already scheduled" }, 409);
    }
    if (!profile.stripe_subscription_id) {
      return json({ error: "no subscription on file" }, 404);
    }

    const sub = await stripeCancelAtPeriodEnd(env, profile.stripe_subscription_id);
    await syncSubscriptionToProfile(env, sub, { userId: user.id });

    let creditsNote = null;
    try {
      const ledger = await listLedgerForUser(env, user.id);
      const credits = creditsPayloadForUi(ledger);
      if (credits?.availableCents > 0) {
        const dollars = (credits.availableCents / 100).toFixed(2);
        creditsNote = `You have $${dollars} in credits — they'll be waiting if you come back.`;
      }
    } catch (e) {
      console.error("cancel credits lookup failed", e);
    }

    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : profile.subscription_current_period_end;

    if (action === "save_offer") {
      await applyAlumni19Save(env, profile);
      await insertCancelSave(env, user.id);
      await notifyCancelSave(env, {
        userId: user.id,
        email: user.email,
        name: profile.name || null,
        periodEnd,
      });
      return json({
        ok: true,
        action: "save_offer",
        tier: "alumni_19",
        endsAt: periodEnd,
        message:
          "You're on the $19 app-only plan request. Logging and tracking stay on — Callie chat and group chats are off. "
          + "Patrick will confirm the $19 charge in Stripe. "
          + (periodEnd ? `Your $49 period was set to end ${formatShort(periodEnd)}. ` : "")
          + (creditsNote || ""),
      });
    }

    // confirm_cancel — full cancel at period end; keep alumni_49 until then
    return json({
      ok: true,
      action: "confirm_cancel",
      endsAt: periodEnd,
      message:
        (periodEnd
          ? `Your membership stays active until ${formatShort(periodEnd)}. After that, you'll need to resubscribe to use the app. `
          : "Your membership will end at the close of this billing period. ")
        + (creditsNote || ""),
    });
  } catch (e) {
    console.error("membership-cancel failed", e);
    return json({ error: e?.message || "cancel unavailable" }, 500);
  }
}

async function applyAlumni19Save(env, profile) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ tier: "alumni_19" }),
  });
  await removeAllGroupChats(env, profile.id, profile.cohort_label);
}

async function insertCancelSave(env, userId) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const resp = await fetch(`${base}/rest/v1/cancel_saves`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId, resolved: false }),
  });
  if (!resp.ok) {
    console.error("cancel_saves insert failed", resp.status, await resp.text());
  }
}

async function notifyCancelSave(env, { userId, email, name, periodEnd }) {
  const key = env.RESEND_API_KEY;
  const to = String(env.CALLIE_NOTIFY_EMAIL || "").trim();
  // Also ping owner/tech if set — cancel saves need Patrick for Stripe $19.
  const owner = String(env.OWNER_NOTIFY_EMAIL || env.TECH_NOTIFY_EMAIL || "pgchammas@gmail.com").trim();
  const recipients = [...new Set([to, owner].filter(Boolean))];
  if (!key || !recipients.length) {
    console.warn("cancel save notify skipped — missing RESEND_API_KEY or notify email");
    return;
  }
  const safe = (s) => String(s || "").replace(/[\r\n\u0000]/g, " ").trim().slice(0, 120);
  const display = safe(name) || safe(email) || "Mama";
  const subject = `Cancel save: ${display} wants $19 app-only`;
  const text = [
    `${display} chose the $19 app-only save offer (no Callie / no group chats).`,
    email ? `Email: ${safe(email)}` : "",
    `Profile: ${userId}`,
    periodEnd ? `$49 period end: ${periodEnd}` : "",
    "",
    "Manual next steps:",
    "1. In Stripe, create/attach a $19/mo subscription (or invoice) for this customer.",
    "2. Confirm profiles.tier is alumni_19 (already set by the app).",
    "3. Mark cancel_saves.resolved = true when done.",
    "https://www.macrosandmamas.com/admin",
  ].filter(Boolean).join("\n");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "Macros and Mamas <calista@nourishwithcalista.com>",
        to: recipients,
        subject,
        text,
      }),
    });
    if (!resp.ok) {
      console.error("cancel save notify failed", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("cancel save notify error", e);
  }
}

function formatShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) return null;
  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
