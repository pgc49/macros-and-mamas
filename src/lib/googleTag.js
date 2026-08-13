import { CONFIG } from "../config";
import { isPublicTrackingPath } from "./attribution";

let gtmInjected = false;
let gaInjected = false;
let lastPagePath = "";

function isTagId(value) {
  return /^[A-Z0-9][A-Z0-9_-]{4,40}$/i.test(String(value || "").trim());
}

function dataLayerPush(obj) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(obj);
}

function ensureGtagFunction() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === "function") return;
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
}

function injectGtm(gtmId) {
  if (typeof document === "undefined") return;
  if (document.getElementById("mm-gtm-js")) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = "mm-gtm-js";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);

  if (!document.getElementById("mm-gtm-noscript")) {
    const noscript = document.createElement("noscript");
    noscript.id = "mm-gtm-noscript";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body?.insertBefore(noscript, document.body.firstChild);
  }
}

function injectGtag(measurementId) {
  if (typeof document === "undefined") return;
  if (document.getElementById("mm-gtag-js")) {
    ensureGtagFunction();
    return;
  }

  ensureGtagFunction();
  const script = document.createElement("script");
  script.id = "mm-gtag-js";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: true, anonymize_ip: true });
}

function sendSpaPageView(pathname) {
  const path = String(pathname || "/").replace(/\/$/, "") || "/";
  if (path === lastPagePath) return;
  lastPagePath = path;
  const payload = {
    page_path: path,
    page_location: typeof window !== "undefined" ? window.location.href : "",
    page_title: typeof document !== "undefined" ? document.title : "",
  };
  dataLayerPush({ event: "page_view", ...payload });
  if (typeof window.gtag === "function") {
    window.gtag("event", "page_view", payload);
  }
}

/**
 * Load Google Tag Manager and/or GA4 gtag on public routes only.
 * No-op without VITE_GTM_ID / VITE_GA_MEASUREMENT_ID.
 */
export function ensureGoogleTag(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  ids = {
    gtmId: CONFIG.GTM_ID,
    gaId: CONFIG.GA_MEASUREMENT_ID,
  },
) {
  if (typeof window === "undefined") return;
  if (!isPublicTrackingPath(pathname)) return;

  const gtmId = isTagId(ids.gtmId) ? String(ids.gtmId).trim() : "";
  const gaId = isTagId(ids.gaId) ? String(ids.gaId).trim() : "";
  if (!gtmId && !gaId) return;

  if (gtmId && !gtmInjected) {
    injectGtm(gtmId);
    gtmInjected = true;
    lastPagePath = String(pathname || "/").replace(/\/$/, "") || "/";
  }
  if (gaId && !gaInjected) {
    injectGtag(gaId);
    gaInjected = true;
    lastPagePath = String(pathname || "/").replace(/\/$/, "") || "/";
  } else if (gtmInjected || gaInjected) {
    sendSpaPageView(pathname);
  }
}

/**
 * Fire a GA4 / dataLayer event when tags are loaded. Safe no-op otherwise.
 */
export function trackGoogle(eventName, params = {}) {
  if (typeof window === "undefined") return;
  const name = String(eventName || "").trim();
  if (!name) return;
  const payload = { ...params };
  dataLayerPush({ event: name, ...payload });
  if (typeof window.gtag === "function") {
    window.gtag("event", name, payload);
  }
}

const META_TO_GA = {
  Lead: "generate_lead",
  InitiateCheckout: "begin_checkout",
  Purchase: "purchase",
};

/** Map Meta standard events onto GA4 recommended names. */
export function trackGoogleFromMeta(metaEvent, params = {}, eventId) {
  const name = META_TO_GA[metaEvent] || String(metaEvent || "").trim();
  if (!name) return;
  const payload = { ...params };
  if (eventId && !payload.transaction_id && metaEvent === "Purchase") {
    payload.transaction_id = eventId;
  }
  if (eventId) payload.event_id = eventId;
  trackGoogle(name, payload);
}

/** Test helper — not used in production. */
export function resetGoogleTagForTests() {
  gtmInjected = false;
  gaInjected = false;
  lastPagePath = "";
  if (typeof document !== "undefined") {
    document.getElementById("mm-gtm-js")?.remove();
    document.getElementById("mm-gtm-noscript")?.remove();
    document.getElementById("mm-gtag-js")?.remove();
  }
  if (typeof window !== "undefined") {
    delete window.gtag;
    delete window.dataLayer;
  }
}
