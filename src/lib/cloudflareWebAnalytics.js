import { CONFIG } from "../config";
import { isPublicTrackingPath } from "./attribution";

let injected = false;

/**
 * Cloudflare Web Analytics beacon on public routes only.
 * Aggregate pageviews in the CF dashboard — no visitor ids written to Supabase.
 * No-op without VITE_CF_WEB_ANALYTICS_TOKEN.
 */
export function ensureCloudflareWebAnalytics(pathname = window.location.pathname) {
  const token = CONFIG.CF_WEB_ANALYTICS_TOKEN;
  if (!token) return;
  if (!isPublicTrackingPath(pathname)) return;
  if (injected || typeof document === "undefined") return;
  if (document.querySelector("script[data-cf-beacon]")) {
    injected = true;
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
  document.head.appendChild(script);
  injected = true;
}
