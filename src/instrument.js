/**
 * Sentry must load before the rest of the app so early render crashes report.
 * DSN is public (browser-safe). Override with VITE_SENTRY_DSN in Pages if needed.
 */
import * as Sentry from "@sentry/react";

const dsn =
  (typeof import.meta.env.VITE_SENTRY_DSN === "string"
    && import.meta.env.VITE_SENTRY_DSN.trim())
  || "https://d82f9a85b2637fe37cc301f76e72d279@o4511802355023872.ingest.us.sentry.io/4511802371866624";

Sentry.init({
  dsn,
  environment: import.meta.env.MODE || "production",
  integrations: [Sentry.replayIntegration()],
  // 10% of normal sessions; 100% of sessions that hit an error (Mikayla-class).
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
