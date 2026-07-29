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
