import { supabase } from "./supabase";
import { CONFIG } from "../config";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    const err = new Error("Sign in to view payments.");
    err.status = 401;
    throw err;
  }
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

/** Stripe Customer Portal CTA — hide when this account has no customer id. */
export function canOpenBillingPortal(summary) {
  return Boolean(summary?.portalAvailable);
}

/** GET /api/billing — program summary, payment history, subscription shell. */
export async function fetchBillingSummary() {
  const headers = await authHeaders();
  const resp = await fetch(CONFIG.BILLING_ENDPOINT, { headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || "Couldn't load billing.");
    err.status = resp.status;
    throw err;
  }
  return data;
}

/** Open Stripe Customer Portal when configured. */
export async function openBillingPortal() {
  const headers = await authHeaders();
  const resp = await fetch(CONFIG.BILLING_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "portal" }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.detail || data.error || "Portal unavailable.");
    err.status = resp.status;
    throw err;
  }
  if (data.url) window.location.assign(data.url);
  return data;
}

/** Start alumni membership Checkout (subscription + free-month trial when eligible). */
export async function startMembershipCheckout() {
  const headers = await authHeaders();
  const resp = await fetch(CONFIG.MEMBERSHIP_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || "Couldn't start membership checkout.");
    err.status = resp.status;
    throw err;
  }
  if (data.url) window.location.assign(data.url);
  return data;
}
