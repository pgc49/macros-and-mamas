/* ==================================================================
   An escalate lands on Callie's card as one factual line.

   Ordinary supply, care, and off-scope refusals stay in coach_messages.
   Only a stuck repeat (the same pain point a third time) or a clinical
   urgent ask is appended. client_summaries is one row per mama per day.
   The line is added to whatever summary is already there. It never
   replaces that summary, and a later refresh keeps the line.
   ================================================================== */

import { isClinicalUrgent, isCrisisUrgent } from "./coachGuardrails.js";
import { localCoachTeach } from "../../src/utils/coachTeach.js";
import { COACH_CLOCK_TZ, wallClockParts } from "../../src/utils/mealSlots.js";

/** Pain teaches that become a Callie brief the third time she asks. */
const STUCK_TOPICS = new Set(["neverSkip", "fasting"]);

const DOORS = {
  crisis: "crisis",
  urgent: "medical",
  medical: "medical",
  stuck: "stuck",
  again: "stuck",
  supply: "supply",
};

/** A supply drop is Callie's, not an ordinary "will this affect supply" aside. */
const SUPPLY_DROP = /\b(supply|milk)\b.{0,28}\b(drop(?:ped|ping)?|dipped|low|down|dry(?:ing)? up)\b/;

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
  // Symptoms first. "I'm skipping dinner because I feel dizzy" and
  // "I'm not logging because my chest hurts" must still reach Callie.
  if (isCrisisUrgent(question)) return "crisis";
  if (isClinicalUrgent(question)) return "medical";
  if (isWontLogRefusal(question)) return null;
  if (scope === "urgent" || scope === "medical") {
    return isClinicalUrgent(question) ? "medical" : null;
  }
  if (scope === "supply" && SUPPLY_DROP.test(question.toLowerCase())) return "supply";
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

/** Ordinary medical lines over the note cap. Crisis has its own ceiling. */
export const MAX_MEDICAL_ESCALATES_PER_DAY = 3;

export const MAX_SUMMARY_CHARS = 8000;
const MAX_LINE_CHARS = 300;
const REFUSAL_PREFIX = "Coach refused (";

export function clipRefusalLine(line) {
  return String(line || "").trim().slice(0, MAX_LINE_CHARS);
}

function isRefusalLine(line) {
  return String(line).startsWith(REFUSAL_PREFIX);
}

function joinedLength(lines) {
  if (!lines.length) return 0;
  return lines.reduce((n, line) => n + String(line).length, 0) + (lines.length - 1);
}

/**
 * Fit under 8000. Safety net only: drop summary prose from the front.
 * Never drop a Coach refused line. If the incoming line would be the
 * one dropped, or only refused lines remain, return full.
 */
export function fitRefusalSummary(lines, { incoming = null } = {}) {
  const next = [...lines];
  let trimmed = 0;
  while (joinedLength(next) > MAX_SUMMARY_CHARS) {
    const proseIdx = next.findIndex((line) => !isRefusalLine(line));
    if (proseIdx === -1) return { ok: false, reason: "full" };
    if (incoming != null && next[proseIdx] === incoming) {
      return { ok: false, reason: "full" };
    }
    next.splice(proseIdx, 1);
    trimmed += 1;
  }
  if (incoming != null && !next.includes(incoming)) {
    return { ok: false, reason: "full" };
  }
  return { ok: true, summary: next.join("\n"), trimmed };
}

/** Distinct crisis lines. Identical text the same Pacific day is a no-op. */
export const MAX_CRISIS_ESCALATES_PER_DAY = 10;

export function doorCap(door) {
  if (door === "crisis") return MAX_CRISIS_ESCALATES_PER_DAY;
  if (door === "medical") return MAX_MEDICAL_ESCALATES_PER_DAY;
  return MAX_SUMMARY_ESCALATES;
}

export function countRefusalDoorLines(summary, door) {
  const prefix = `Coach refused (${door}):`;
  return String(summary || "")
    .split("\n")
    .filter((line) => line.startsWith(prefix)).length;
}

export function mergeRefusalSummary(existing, line) {
  const next = clipRefusalLine(line);
  const prior = String(existing || "");
  if (!next) return { ok: true, summary: prior, unchanged: true };
  const lines = prior.length ? prior.split("\n") : [];
  if (lines.some((row) => row === next)) {
    return { ok: true, summary: prior, unchanged: true };
  }
  const fitted = fitRefusalSummary([...lines, next], { incoming: next });
  if (!fitted.ok) return { ok: false, reason: fitted.reason || "full", summary: prior };
  const result = { ok: true, summary: fitted.summary };
  if (fitted.trimmed > 0) result.trimmed = fitted.trimmed;
  return result;
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
  const refused = String(existing || "")
    .split("\n")
    .filter((line) => line.startsWith(REFUSAL_PREFIX));
  const prose = String(fresh || "").trim();
  const proseLines = prose ? prose.split("\n") : [];
  const combined = [...proseLines];
  for (const line of refused) {
    if (!combined.some((row) => row === line)) combined.push(line);
  }
  const fitted = fitRefusalSummary(combined);
  if (!fitted.ok) return { ok: false, reason: fitted.reason || "full" };
  const result = { ok: true, summary: fitted.summary };
  if (fitted.trimmed > 0) result.trimmed = fitted.trimmed;
  return result;
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
  const rpc = await fetch(`${base}/rest/v1/rpc/append_coach_refusal_line`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_profile_id: userId,
      p_for_date: day,
      p_line: line,
      p_door: door,
      p_max: doorCap(door),
    }),
  }).catch(() => null);
  if (rpc?.ok) {
    const result = await rpc.json().catch(() => null);
    if (result && typeof result === "object" && result.ok === true) return result;
    if (result && typeof result === "object" && result.ok === false) return result;
  }

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
  const merged = mergeRefusalSummary(existing?.summary, line);
  if (merged.unchanged) return { ok: true, unchanged: true };
  if (countRefusalDoorLines(existing?.summary, door) >= doorCap(door)) {
    return { ok: true, capped: true };
  }
  if (!merged.ok) return { ok: false, reason: merged.reason || "full" };

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
      summary: merged.summary,
      suggested_touch: existing?.suggested_touch ?? null,
      model: existing?.model ?? null,
    }),
  });
  if (!write.ok) {
    console.error("coach refusal summary write failed", write.status);
    return { ok: false };
  }
  if (merged.trimmed > 0) return { ok: true, trimmed: merged.trimmed };
  return { ok: true };
}
