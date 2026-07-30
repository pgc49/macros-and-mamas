/**
 * Sentry must load before the rest of the app so early render crashes report.
 * DSN is public (browser-safe). Override with VITE_SENTRY_DSN in Pages if needed.
 *
 * Privacy: no email on the Sentry user; Replay only on errors; mask inputs /
 * message & health surfaces so chat/weights aren't shipped to Sentry.
 */
import * as Sentry from "@sentry/react";

const dsn =
  (typeof import.meta.env.VITE_SENTRY_DSN === "string"
    && import.meta.env.VITE_SENTRY_DSN.trim())
  || "https://d82f9a85b2637fe37cc301f76e72d279@o4511802355023872.ingest.us.sentry.io/4511802371866624";

Sentry.init({
  dsn,
  environment: import.meta.env.MODE || "production",
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true,
    }),
  ],
  // Error-only replay — avoid shipping routine session video of mama health UI.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    return event;
  },
});
