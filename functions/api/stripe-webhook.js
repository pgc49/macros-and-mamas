/* ==================================================================
   /functions/api/stripe-webhook.js — Stripe event router + idempotency
   ==================================================================
   Secrets (Cloudflare Pages / .dev.vars — never commit real values):
     STRIPE_WEBHOOK_SECRET
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   (server-side only)

   Stage 0: signature verify → claim event_id in stripe_events → route.
   Handlers for credits/referrals/subscriptions arrive in later stages.
   Subscribe (Dashboard / CLI): checkout.session.completed,
     checkout.session.async_payment_succeeded, charge.refunded,
     invoice.paid, invoice.payment_failed, customer.subscription.deleted
   ================================================================== */

import {
  loadUserContact,
  sendWelcomeEmails,
} from "../_shared/supabaseEmail.js";
import { sendMetaCapiEvent } from "../_shared/metaCapi.js";
import { handleInvoicePaidCredits } from "../_shared/credits.js";

/** Event types we expect to receive; handlers land in later stages. */
const KNOWN_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
]);

export async function onRequestPost({ request, env }) {
  try {
    const rawBody = await request.text();
    const sig = request.headers.get("stripe-signature");
    if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    const event = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!event) return json({ error: "invalid signature" }, 400);

    const eventId = String(event.id || "").trim();
    const eventType = String(event.type || "").trim();
    if (!eventId || !eventType) {
      return json({ error: "invalid event" }, 400);
    }

    // Idempotency: claim event_id first. Conflict → already processed → 200.
    const claimed = await claimStripeEvent(env, eventId, eventType);
    if (claimed === "duplicate") {
      return json({ received: true, duplicate: true }, 200);
    }
    if (claimed === "error") {
      // Fail closed so Stripe retries; do not mark paid twice without a row.
      return json({ error: "idempotency unavailable" }, 500);
    }

    try {
      if (
        eventType === "checkout.session.completed"
        || eventType === "checkout.session.async_payment_succeeded"
      ) {
        // Card: completed is paid. Klarna/Affirm/etc: completed may be unpaid,
        // then async_payment_succeeded fires when funds clear — same mark-paid path.
        await handleCheckoutSessionCompleted(env, event);
      } else if (eventType === "invoice.paid") {
        const invoice = event.data?.object || {};
        const result = await handleInvoicePaidCredits(env, invoice);
        console.log("invoice.paid credits", eventId, result);
      } else if (KNOWN_EVENT_TYPES.has(eventType)) {
        // Shell only — real handlers in later stages.
        console.log("stripe webhook unhandled (registered)", eventType, eventId);
      } else {
        console.log("stripe webhook unhandled", eventType, eventId);
      }
    } catch (handlerErr) {
      // Release claim so Stripe retries can re-process after a transient failure.
      console.error("stripe webhook handler failed", eventType, eventId, handlerErr);
      await releaseStripeEvent(env, eventId);
      const msg = String(handlerErr?.message || "");
      if (msg === "missing user" || msg === "not paid") {
        return json({ error: msg }, 400);
      }
      return json({ error: "webhook failed" }, 500);
    }

    return json({ received: true }, 200);
  } catch (e) {
    console.error("stripe webhook failed", e);
    return json({ error: "webhook failed" }, 500);
  }
}

async function handleCheckoutSessionCompleted(env, event) {
  const session = event.data?.object || {};
  const userId =
    session.metadata?.supabase_user_id ||
    session.client_reference_id;

  if (!userId) {
    console.error("checkout.session.completed missing user id", session.id);
    throw new Error("missing user");
  }

  // Defense-in-depth: only unlock paid when Stripe says the session is paid.
  const payStatus = String(session.payment_status || "");
  if (payStatus && payStatus !== "paid" && payStatus !== "no_payment_required") {
    console.error("checkout.session.completed not paid", session.id, payStatus);
    throw new Error("not paid");
  }

  const wasPaid = await profileAlreadyPaid(env, userId);
  await markPaid(env, userId, session);

  // Skip side effects if this session already unlocked paid (e.g. completed then
  // async_payment_succeeded both succeed — avoid double welcome email).
  if (wasPaid) {
    console.log("checkout already paid; skipped welcome/CAPI", userId, session.id);
    return;
  }

  // Purchase CAPI — idempotent event_id = Stripe session.id (dedupe with browser)
  try {
    const contact = await loadUserContact(env, userId);
    const email =
      contact.email ||
      session.customer_email ||
      session.customer_details?.email ||
      "";
    const amount =
      Number(session.metadata?.amount_usd) ||
      (session.amount_total != null ? Number(session.amount_total) / 100 : 0);
    const purchaseEventId = String(session.metadata?.event_id || session.id);
    await sendMetaCapiEvent(env, {
      eventName: "Purchase",
      eventId: purchaseEventId,
      email,
      fbp: session.metadata?.fbp || "",
      fbc: session.metadata?.fbc || "",
      clientIp: session.metadata?.client_ip || "",
      clientUa: session.metadata?.client_ua || "",
      eventSourceUrl: "https://www.macrosandmamas.com/welcome",
      customData: {
        currency: "USD",
        value: amount,
        content_name: `purchase_${session.metadata?.price_tier || "unknown"}`,
        order_id: String(session.id),
      },
    });
  } catch (metaErr) {
    console.error("Purchase CAPI failed", metaErr);
  }

  // Email #2 + Callie A — best-effort (don't fail the webhook)
  try {
    const contact = await loadUserContact(env, userId);
    const email = contact.email || session.customer_email || session.customer_details?.email;
    const name = contact.name || session.customer_details?.name || null;
    const amountUsd =
      Number(session.metadata?.amount_usd) ||
      (session.amount_total != null ? Number(session.amount_total) / 100 : null);
    await sendWelcomeEmails(env, { email, name, userId, amountUsd });
  } catch (mailErr) {
    console.error("welcome email failed", mailErr);
  }
}

async function profileAlreadyPaid(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId) return false;
  try {
    const resp = await fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    );
    if (!resp.ok) return false;
    const rows = await resp.json().catch(() => []);
    return !!rows?.[0]?.paid;
  } catch {
    return false;
  }
}

/**
 * Insert event_id. Returns "claimed" | "duplicate" | "error".
 */
async function claimStripeEvent(env, eventId, eventType) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("claimStripeEvent missing SUPABASE_URL or service role");
    return "error";
  }

  const resp = await fetch(`${base}/rest/v1/stripe_events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_id: eventId,
      type: eventType,
      processed_at: new Date().toISOString(),
    }),
  });

  if (resp.ok || resp.status === 201) return "claimed";

  // Unique violation → already processed
  const detail = await resp.text().catch(() => "");
  if (resp.status === 409 || /duplicate|unique|23505/i.test(detail)) {
    return "duplicate";
  }

  console.error("claimStripeEvent failed", resp.status, detail);
  return "error";
}

async function releaseStripeEvent(env, eventId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !eventId) return;
  try {
    const resp = await fetch(
      `${base}/rest/v1/stripe_events?event_id=eq.${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          prefer: "return=minimal",
        },
      },
    );
    if (!resp.ok) {
      console.error("releaseStripeEvent failed", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("releaseStripeEvent error", e);
  }
}

async function markPaid(env, userId, session) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error("missing SUPABASE_URL or server key");
  }

  // Do NOT set status=active here — that means Callie approved.
  // Payment only flips paid + stores Stripe ids for refunds.
  const paidAt = new Date().toISOString();
  const patch = {
    paid: true,
    refunded: false,
    paid_at: paidAt,
  };
  if (session.customer) patch.stripe_customer_id = String(session.customer);
  const pi = session.payment_intent;
  if (pi) patch.stripe_payment_intent = String(pi);

  const labReview =
    String(session.metadata?.lab_review || "").toLowerCase() === "true";
  if (labReview) {
    patch.lab_review_purchased = true;
    patch.lab_review_purchased_at = paidAt;
  }

  // First-touch backfill from Checkout metadata if the client stamp missed.
  Object.assign(patch, await attributionBackfill(env, userId, session.metadata || {}));

  const resp = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`supabase update failed: ${resp.status} ${detail}`);
  }
}

/** Fill empty profile attribution columns from Stripe session metadata. */
async function attributionBackfill(env, userId, metadata) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "anon_id",
    "landing_path",
    "referrer_host",
  ];
  const fromMeta = {};
  for (const k of keys) {
    const v = String(metadata[k] || "").trim();
    if (v) fromMeta[k] = v.slice(0, k === "anon_id" ? 64 : 200);
  }
  if (!Object.keys(fromMeta).length) return {};

  try {
    const sel = ["attributed_at", ...keys].join(",");
    const resp = await fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(sel)}`,
      {
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
        },
      },
    );
    if (!resp.ok) return {};
    const rows = await resp.json();
    const existing = rows?.[0] || {};
    const patch = {};
    for (const [k, v] of Object.entries(fromMeta)) {
      if (!existing[k]) patch[k] = v;
    }
    if (Object.keys(patch).length && !existing.attributed_at) {
      patch.attributed_at = new Date().toISOString();
    }
    return patch;
  } catch (e) {
    console.error("attribution backfill skipped", e);
    return {};
  }
}

/** Verify Stripe-Signature header (t=,v1=) with Web Crypto HMAC-SHA256. */
async function verifyStripeSignature(rawBody, header, secret) {
  const pairs = header.split(",").map((p) => {
    const [k, ...rest] = p.split("=");
    return [k.trim(), rest.join("=")];
  });
  const timestamp = pairs.find(([k]) => k === "t")?.[1];
  // Stripe may send multiple v1 signatures during secret rotation — accept any match.
  const v1List = pairs.filter(([k]) => k === "v1").map(([, v]) => v).filter(Boolean);
  if (!timestamp || !v1List.length) return null;

  // Reject timestamps older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || age > 300 || age < -30) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`)
  );
  const expected = [...new Uint8Array(signed)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!v1List.some((v1) => timingSafeEqual(expected, v1))) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
