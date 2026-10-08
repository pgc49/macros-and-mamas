/**
 * Shape a mama's coach_messages for Callie's read-only admin view.
 * Newest first. Stuck / medical / other deflects are pinned so she can
 * skim before she reads the chat.
 */

import { COACH_DEFLECT } from "../content/coachVoice";
import { isClinicalUrgent } from "../../functions/_shared/coachGuardrails.js";
import { coachSummaryDateIso } from "../../functions/_shared/coachRefusalSummary.js";

export const COACH_MESSAGE_POLICIES = {
  select: "coach_messages_select_own_visible_or_admin",
  insert: "coach_messages_insert_own_mama",
  hide: "hide_coach_messages",
  clear: "clear_coach_messages",
};

export function priorMamaBody(messages, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row?.role === "mama" && row.body) return row.body;
  }
  return "";
}

/** Pair by request_id. Old rows without one fall back to arrival order. */
export function pairedMamaBody(messages, index) {
  const askId = messages[index]?.requestId;
  if (askId) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const row = messages[i];
      if (row?.role === "mama" && row.requestId === askId && row.body) return row.body;
    }
  }
  return priorMamaBody(messages, index);
}

export function isServerVerified(message) {
  return message?.role === "coach" && message?.source === "server";
}

export function coachFlag(message, asked = "") {
  if (!isServerVerified(message)) return null;
  const deflect = message?.payload?.deflect
    || (message?.kind === "deflect" ? "offTopic" : null);
  if (message?.kind !== "deflect" && !deflect) return null;
  if (deflect === "again") return "stuck";
  if (
    deflect === "emergency"
    || deflect === "medical"
    || (deflect === "care" && isClinicalUrgent(asked))
  ) {
    return "medical";
  }
  return "deflect";
}

/** Dated rows use local_date. A missing date follows created_at's Pacific day. */
export function coachDisplayDate(message) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(message?.localDate || ""))) {
    return message.localDate;
  }
  if (message?.createdAt) {
    const parsed = new Date(message.createdAt);
    if (!Number.isNaN(parsed.getTime())) return coachSummaryDateIso(parsed);
  }
  return "";
}

export function flagLabel(flag) {
  if (flag === "stuck") return "Stuck";
  if (flag === "medical") return "Medical";
  return "Deflect";
}

export function deflectLine(message) {
  const key = message?.payload?.deflect;
  return (COACH_DEFLECT[key] || COACH_DEFLECT.offTopic).line;
}

function asDisplayString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function plainCoachPlates(payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  return cards
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const name = asDisplayString(card.name).trim() || asDisplayString(card.title).trim();
      if (!name) return null;
      return {
        name,
        macros: [
          `${Math.round(Number(card.cal) || 0)} cal`,
          `P${Math.round(Number(card.p) || 0)}`,
          `C${Math.round(Number(card.c) || 0)}`,
          `F${Math.round(Number(card.f) || 0)}`,
        ].join(" · "),
        reason: asDisplayString(card.reason || card.shownReason).trim(),
      };
    })
    .filter(Boolean);
}

function byNewest(a, b) {
  const seq = (Number(b.seq) || 0) - (Number(a.seq) || 0);
  if (seq) return seq;
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}

function byOldest(a, b) {
  return -byNewest(a, b);
}

/** Pin flags newest-first; thread newest-first and still readable as a chat. */
export function buildAdminCoachView(messages = []) {
  const chronological = [...messages].sort(byOldest);
  const pinned = [];
  chronological.forEach((message, index) => {
    const asked = pairedMamaBody(chronological, index);
    const flag = coachFlag(message, asked);
    if (!flag) return;
    pinned.push({
      ...message,
      flag,
      asked,
      line: message.body || deflectLine(message),
    });
  });
  pinned.sort(byNewest);
  return {
    pinned,
    thread: [...messages].sort(byNewest),
  };
}
