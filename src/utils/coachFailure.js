/**
 * Text-free Coach failure beacon. No question, no meal names, no email.
 * Filter Issues by coach_failure.
 */
import * as Sentry from "@sentry/react";

export const COACH_FAILURE = "coach_failure";

export function captureCoachFailure({ kind = "unknown", status = null } = {}) {
  try {
    Sentry.captureMessage(COACH_FAILURE, {
      level: "warning",
      tags: {
        surface: "coach",
        kind: String(kind || "unknown").slice(0, 40),
      },
      extra: {
        status: status == null ? "" : String(status),
      },
      fingerprint: [COACH_FAILURE, String(kind || "unknown")],
    });
  } catch {
    /* Sentry must never take the coach down */
  }
}
