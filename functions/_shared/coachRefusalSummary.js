/* ==================================================================
   A refused coach ask lands on Callie's card as one factual line.

   client_summaries is one row per mama per day. The refusal is appended
   to whatever summary is already there. It never replaces that summary,
   and a later refresh keeps the refusal lines.
   ================================================================== */

const DOORS = {
  supply: "supply",
  weight: "scale",
  urgent: "medical",
  ranges: "ranges",
  admin: "admin",
  off_topic: "off topic",
};

/** Skip-the-log / eat-and-move-on. That handoff is not a card for Callie. */
const LOGGING_REFUSAL = /\b(?:won'?t|will not|not going to|don'?t|do not|cant|can't)\s+(?:want to\s+)?log\b|\bnot logging\b|\bskip(?:ping)?\s+(?:dinner|lunch|breakfast|snack|this meal|a meal|eating)\b/;

export function refusalDoor(scope) {
  return DOORS[scope] || null;
}

export function isLoggingRefusal(text) {
  return LOGGING_REFUSAL.test(String(text || "").toLowerCase());
}

/** One line. The question she asked, and which door refused it. No model prose. */
export function coachRefusalLine(asked, door) {
  const question = String(asked || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!question || !door) return "";
  return `Coach refused (${door}): ${question}`;
}

export function mergeRefusalSummary(existing, line) {
  const prior = String(existing || "").trim();
  const next = String(line || "").trim();
  if (!next) return prior;
  if (prior.includes(next)) return prior;
  if (!prior) return next;
  return `${prior}\n${next}`.slice(0, 4000);
}

/** A generated summary replaces the prose. Refusal lines from that day stay. */
export function preserveRefusalLines(existing, fresh) {
  const lines = String(existing || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Coach refused ("));
  let out = String(fresh || "").trim();
  for (const line of lines) {
    if (!out.includes(line)) out = out ? `${out}\n${line}` : line;
  }
  return out.slice(0, 4000);
}

/**
 * Read today's row with the service role, append the line, write it back.
 * A failed read does not write: an unread row must not be replaced.
 */
export async function appendCoachRefusal(env, userId, { asked, scope, now = new Date() } = {}) {
  const door = refusalDoor(scope);
  const line = coachRefusalLine(asked, door);
  if (!userId || !line || isLoggingRefusal(asked)) return { ok: false, skipped: true };

  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("coach refusal summary missing service role");
    return { ok: false, skipped: true };
  }

  const day = now.toISOString().slice(0, 10);
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const readUrl = `${base}/rest/v1/client_summaries?profile_id=eq.${encodeURIComponent(userId)}`
    + `&for_date=eq.${day}&select=summary,suggested_touch,model`;
  const read = await fetch(readUrl, { headers });
  if (!read.ok) {
    console.error("coach refusal summary read failed", read.status);
    return { ok: false };
  }
  const rows = await read.json().catch(() => null);
  if (!Array.isArray(rows)) return { ok: false };
  const existing = rows[0] || null;
  const summary = mergeRefusalSummary(existing?.summary, line);
  if (existing && summary === String(existing.summary || "").trim()) {
    return { ok: true, unchanged: true };
  }

  const write = await fetch(`${base}/rest/v1/client_summaries?on_conflict=profile_id,for_date`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      profile_id: userId,
      for_date: day,
      summary,
      suggested_touch: existing?.suggested_touch ?? null,
      model: existing?.model ?? null,
    }),
  });
  if (!write.ok) {
    console.error("coach refusal summary write failed", write.status);
    return { ok: false };
  }
  return { ok: true };
}
