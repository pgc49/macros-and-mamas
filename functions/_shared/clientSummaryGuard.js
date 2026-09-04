/** Shared by the admin card builder and /api/client-summary. No DM bodies. */
export function assertNoMessageBodies(payload) {
  const blob = JSON.stringify(payload || {});
  return !/"body"\s*:/.test(blob) && !/"messages"\s*:/.test(blob);
}

export const CLIENT_SUMMARY_HINT = `Respond with ONLY a JSON object:
{"summary":"2-3 sentences, descriptive only, facts from the payload","suggested_touch":"one sentence message idea: celebrate, nudge, or check in"}
Do not give medical advice or diagnoses. Do not invent weigh-ins, meals, or habits that are not in the payload.
If week is null or started is false she has not started — Callie has not approved her ranges yet. Do not invent a program week.`;
