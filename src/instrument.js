/**
 * Sentry must load before the rest of the app so early render crashes report.
 * DSN is public (browser-safe). Override with VITE_SENTRY_DSN in Pages if needed.
 *
 * Privacy: no email on the Sentry user; Replay only on errors; mask inputs /
 * message & health surfaces so chat/weights aren't shipped to Sentry.
 *
 * Performance (lightweight): ~20% of page loads / navigations → Web Vitals
 * (LCP, CLS, INP, TTFB) in Sentry. Release tagged with VITE_APP_BUILD_ID.
 */
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

const dsn =
  (typeof import.meta.env.VITE_SENTRY_DSN === "string"
    && import.meta.env.VITE_SENTRY_DSN.trim())
  || "https://d82f9a85b2637fe37cc301f76e72d279@o4511802355023872.ingest.us.sentry.io/4511802371866624";

const isProd = import.meta.env.PROD;
const buildId = String(import.meta.env.VITE_APP_BUILD_ID || "").trim();

Sentry.init({
  dsn,
  environment: import.meta.env.MODE || "production",
  release: buildId || undefined,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
      // INP stacks on tracesSampleRate (0.5 × 0.2 ≈ 10% of interactions in prod).
      enableInp: true,
      interactionsSampleRate: isProd ? 0.5 : 1.0,
    }),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true,
    }),
  ],
  // Keep volume low — enough to spot a heavy release, not every mama tap.
  tracesSampleRate: isProd ? 0.2 : 1.0,
  // Error-only replay — avoid shipping routine session video of mama health UI.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Only attach distributed-trace headers on our own API (not Supabase / third parties).
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/(www\.)?macrosandmamas\.com\/api/,
    /^\//,
  ],
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    // Instagram / Facebook in-app browsers inject native-bridge JS that
    // crashes on window.webkit.messageHandlers — not our code.
    const exc = event.exception?.values?.[0];
    const msg = String(exc?.value || event.message || "");
    const frames = exc?.stacktrace?.frames || [];
    const bridgeNoise = /webkit\.messageHandlers/i.test(msg)
      || frames.some((f) => /sendDataToNative|sendPageHideMessage/i.test(String(f?.function || "")));
    if (bridgeNoise) return null;
    return event;
  },
  beforeSendTransaction(event) {
    // Drop auth-ish query crumbs if a redirect ever lands them in the URL.
    if (event.transaction) {
      event.transaction = String(event.transaction).split("?")[0];
    }
    if (event.request?.url) {
      try {
        const u = new URL(event.request.url, "https://www.macrosandmamas.com");
        u.searchParams.delete("access_token");
        u.searchParams.delete("refresh_token");
        u.searchParams.delete("code");
        event.request.url = u.pathname + (u.search || "");
      } catch {
        /* keep as-is */
      }
    }
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    return event;
  },
});
