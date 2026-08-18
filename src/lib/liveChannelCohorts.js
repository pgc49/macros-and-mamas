/** Admin Messages pills — Founding + August are both live. */
export const DEFAULT_LIVE_CHANNEL_COHORTS = "2026-07,2026-08";

export function parseLiveChannelCohorts(raw) {
  const source = raw == null || String(raw).trim() === ""
    ? DEFAULT_LIVE_CHANNEL_COHORTS
    : raw;
  return new Set(
    String(source)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
