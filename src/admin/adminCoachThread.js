/**
 * Shape a mama's coach_messages for Callie's read-only admin view.
 * Newest first. Stuck / medical / other deflects are pinned so she can
 * skim before she reads the chat.
 */

import { COACH_DEFLECT } from "../content/coachVoice";
import { isClinicalUrgent } from "../../functions/_shared/coachGuardrails.js";

export const COACH_MESSAGE_POLICIES = {
  select: "coach_messages_select_own_visible_or_admin",
  insert: "coach_messages_insert_own_mama",
  update: "coach_messages_hide_own",
};

export function priorMamaBody(messages, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row?.role === "mama" && row.body) return row.body;
  }
  return "";
}

export function coachFlag(message, asked = "") {
  const deflect = message?.payload?.deflect
    || (message?.kind === "deflect" ? "offTopic" : null);
  if (message?.kind !== "deflect" && !deflect) return null;
  if (deflect === "again") return "stuck";
  if (deflect === "care" && isClinicalUrgent(asked)) return "medical";
  return "deflect";
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

export function plainCoachPlates(payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  return cards
    .filter((card) => card && (card.name || card.title))
    .map((card) => ({
      name: card.name || card.title,
      macros: [
        `${Math.round(Number(card.cal) || 0)} cal`,
        `P${Math.round(Number(card.p) || 0)}`,
        `C${Math.round(Number(card.c) || 0)}`,
        `F${Math.round(Number(card.f) || 0)}`,
      ].join(" · "),
      reason: String(card.reason || card.shownReason || "").trim(),
    }));
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
    const asked = priorMamaBody(chronological, index);
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
