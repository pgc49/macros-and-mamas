import { supabase } from "./supabase";
import { CONFIG } from "../config";

/** Start Stripe Checkout; redirects the browser on success. */
export async function startCheckout() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in again to complete enrollment.");
  }
  const resp = await fetch(CONFIG.CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.url) {
    throw new Error(data.error || `checkout failed: ${resp.status}`);
  }
  window.location.href = data.url;
}

/** Full eligibility refund after pay-first intake decline. */
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
