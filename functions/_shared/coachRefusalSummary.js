/* ==================================================================
   An escalate lands on Callie's card as one factual line.

   Ordinary supply, care, and off-scope refusals stay in coach_messages.
   Only a stuck repeat (the same pain point a third time) or a clinical
   urgent ask is appended. client_summaries is one row per mama per day.
   The line is added to whatever summary is already there. It never
   replaces that summary, and a later refresh keeps the line.
   ================================================================== */

import { isClinicalUrgent } from "./coachGuardrails.js";
import { localCoachTeach } from "../../src/utils/coachTeach.js";
import { COACH_CLOCK_TZ, wallClockParts } from "../../src/utils/mealSlots.js";

/** Pain teaches that become a Callie brief the third time she asks. */
const STUCK_TOPICS = new Set(["neverSkip", "fasting"]);

const DOORS = {
  urgent: "medical",
  medical: "medical",
  stuck: "stuck",
  again: "stuck",
};

/** Skip-the-log. Eat-and-move-on ("skip dinner") is a teach, not this. */
const WONT_LOG = /\b(?:won'?t|will not|not going to|don'?t|do not|cant|can't)\s+(?:want to\s+)?log\b|\bnot logging\b|\bhate tracking\b/;

/** She said she skipped a meal. Used for the skip note, not for a Callie card. */
const SAID_SKIPPED = /\bskip(?:ped|ping)?\s+(?:dinner|lunch|breakfast|snack|this meal|a meal|eating)\b/;

export function refusalDoor(scope) {
  return DOORS[scope] || null;
}

export function isWontLogRefusal(text) {
  return WONT_LOG.test(String(text || "").toLowerCase());
}

/** @deprecated use isWontLogRefusal — skip dinner is a teach, not a logging refusal. */
export function isLoggingRefusal(text) {
  return isWontLogRefusal(text);
}

export function saidSheSkipped(text) {
  return SAID_SKIPPED.test(String(text || "").toLowerCase());
}

/**
 * Stuck or medical, or nothing. Supply, care, scale, ranges, admin, and
 * off-scope are mama-facing refusals. They are not a Callie brief.
 */
export function escalateDoor(asked, { escalate = null, scope = null } = {}) {
  const question = String(asked || "").trim();
  if (!question) return null;
  if (escalate === "stuck" || scope === "stuck" || scope === "again") {
    const teach = localCoachTeach(question);
    return teach && STUCK_TOPICS.has(teach.topic) ? "stuck" : null;
  }
  if (isWontLogRefusal(question)) return null;
  if (scope === "urgent" || scope === "medical" || isClinicalUrgent(question)) {
    return isClinicalUrgent(question) ? "medical" : null;
  }
  return null;
}

/** One line. The question she asked, and which escalate it was. No thread, no model prose. */
export function coachRefusalLine(asked, door) {
  const question = String(asked || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!question || !door) return "";
  return `Coach refused (${door}): ${question}`;
}

/** One mama cannot flood Callie's card with the same door all day. */
export const MAX_SUMMARY_ESCALATES = 5;

export function countRefusalDoorLines(summary, door) {
  const prefix = `Coach refused (${door}):`;
  return String(summary || "")
    .split("\n")
    .filter((line) => line.startsWith(prefix)).length;
}

export function mergeRefusalSummary(existing, line) {
  const prior = String(existing || "").trim();
  const next = String(line || "").trim();
  if (!next) return prior;
  if (prior.includes(next)) return prior;
  if (!prior) return next;
  return `${prior}\n${next}`.slice(0, 4000);
}

/**
 * Calendar day for client_summaries.for_date.
 * Pacific wall date, same clock as the coach door. UTC `toISOString`
 * is already the next day at 6pm PT.
 */
export function coachSummaryDateIso(now = new Date(), timeZone = COACH_CLOCK_TZ) {
  const instant = now instanceof Date ? now : new Date(now);
  const { year, month, day } = wallClockParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
export async function appendCoachRefusal(env, userId, { asked, scope, escalate = null, now = new Date() } = {}) {
  const door = escalateDoor(asked, { escalate, scope });
  const line = coachRefusalLine(asked, door);
  if (!userId || !line) return { ok: false, skipped: true };

  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("coach refusal summary missing service role");
    return { ok: false, skipped: true };
  }

  const day = coachSummaryDateIso(now);
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
  if (countRefusalDoorLines(existing?.summary, door) >= MAX_SUMMARY_ESCALATES) {
    return { ok: true, capped: true };
  }
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
