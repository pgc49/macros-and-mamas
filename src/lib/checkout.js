import { supabase } from "./supabase";
import { CONFIG } from "../config";
import {
  captureAttributionFromLocation,
  getStoredAttribution,
  newBrowserEventId,
  trackPixel,
} from "./attribution";
import { trackGoogleFromMeta } from "./googleTag";

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in again to complete enrollment.");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

/** Which tier/amount this unpaid user would pay (founding / waitlist / full). */
export async function fetchCheckoutQuote() {
  const headers = await authHeaders();
  const resp = await fetch(CONFIG.CHECKOUT_QUOTE_ENDPOINT, {
    method: "GET",
    headers,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `quote failed: ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

/**
 * Start Stripe Checkout; redirects the browser on success.
 * @param {{ labReview?: boolean, referralCode?: string }} [opts]
 */
export async function startCheckout(opts = {}) {
  const labReview = Boolean(opts.labReview);
  const referralCode = String(opts.referralCode || "").trim();
  const headers = await authHeaders();
  captureAttributionFromLocation();
  const attr = getStoredAttribution() || {};
  const eventId = newBrowserEventId("ic");
  const checkoutParams = {
    currency: "USD",
    content_name: labReview ? "enrollment_lab" : "enrollment",
  };
  trackPixel("InitiateCheckout", checkoutParams, eventId);
  trackGoogleFromMeta("InitiateCheckout", checkoutParams, eventId);
  const resp = await fetch(CONFIG.CHECKOUT_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_id: eventId,
      fbp: attr.fbp || "",
      fbc: attr.fbc || "",
      fbclid: attr.fbclid || "",
      utm_source: attr.utm_source || "",
      utm_medium: attr.utm_medium || "",
      utm_campaign: attr.utm_campaign || "",
      utm_content: attr.utm_content || "",
      utm_term: attr.utm_term || "",
      anon_id: attr.anon_id || "",
      landing_path: attr.landing_path || "",
      referrer_host: attr.referrer_host || "",
      lab_review: labReview,
      referral_code: referralCode || undefined,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.url) {
    const err = new Error(data.error || `checkout failed: ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  try {
    sessionStorage.setItem("mm_purchase_event_id", data.event_id || eventId);
  } catch {
    /* ignore */
  }
  window.location.href = data.url;
}

/** Flag eligibility gate for Callie — no Stripe refund. */
export async function requestEligibilityHold(reason, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in again.");
  }
  const resp = await fetch("/api/eligibility-hold", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason, ...extra }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `eligibility hold failed: ${resp.status}`);
  }
  return data;
}

/** @deprecated Auto-refunds disabled — Callie decides 1:1. Kept for safety; always fails. */
export async function requestEligibilityRefund(reason) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in again.");
  }
  const resp = await fetch("/api/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `refund failed: ${resp.status}`);
  }
  return data;
}
