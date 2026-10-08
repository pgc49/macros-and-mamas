/* ==================================================================
   Service-role writes for coach_messages.

   A mama session may insert her own mama-role rows. Coach replies are
   written here with the service role from /api/coach so Callie can
   trust the role column. Ask/menu/kitchen persist the server's own
   output. Local templates are rebuilt when we can, otherwise marked
   source='client' and never pinned as Stuck/Medical.
   ================================================================== */

import { COACH_COPY } from "../../src/content/coachVoice.js";
import { teachBody } from "../../src/utils/coachTeach.js";
import { coachSummaryDateIso } from "./coachRefusalSummary.js";

const COACH_KINDS = new Set(["text", "cards", "deflect", "photo", "read"]);
const LOCAL_TEMPLATES = new Set([
  "local.cards",
  "local.read",
  "local.noneFit",
  "local.teach",
  "local.text",
]);
const MAX_CARDS = 4;
const CARD_SOURCES = new Set(["bank", "my", "pantry", "menu", "kitchen", "new"]);
const COACH_REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Client tickets: a uuid or 8–64 letters, digits, and hyphens. Anything else is minted here. */
export function isCoachRequestId(value) {
  return COACH_REQUEST_ID_RE.test(String(value || "").trim());
}

export function clampCoachRequestId(value) {
  const ticket = String(value || "").trim();
  return isCoachRequestId(ticket) ? ticket : crypto.randomUUID();
}

/** Note-bucket ticket. reserve_estimate_call refuses a seen id on any type. */
export function noteReserveRequestId(requestId) {
  const ticket = String(requestId || "").trim();
  if (!isCoachRequestId(ticket)) return "";
  const tagged = `${ticket}-note`;
  return isCoachRequestId(tagged) ? tagged : `${ticket.slice(0, 59)}-note`;
}

/** Exact mama insert body. Live 080000 only accepts payload null or {}. */
export function mamaCoachInsertRow({
  profileId,
  body = "",
  kind = "text",
  localDate = null,
  requestId = null,
} = {}) {
  return {
    profile_id: profileId,
    role: "mama",
    body: String(body || "").slice(0, 4000),
    kind: kind === "photo" ? "photo" : "text",
    payload: null,
    local_date: localDate,
    request_id: isCoachRequestId(requestId) ? String(requestId).trim() : null,
  };
}

/** Mirrors coach_messages_insert_own_mama + the insert trigger. */
export function mamaInsertPassesPolicy(row) {
  if (!row || row.role !== "mama") return false;
  if (row.kind !== "text" && row.kind !== "photo") return false;
  if (row.payload != null && !(
    typeof row.payload === "object"
    && !Array.isArray(row.payload)
    && Object.keys(row.payload).length === 0
  )) {
    return false;
  }
  if (row.request_id != null && !isCoachRequestId(row.request_id)) return false;
  return true;
}

function clipCardText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cardServings(value) {
  const n = Number(value);
  if (n === 0.5) return 0.5;
  if (Number.isFinite(n) && n > 0 && n <= 8) return Math.round(n * 4) / 4;
  return 1;
}

export function sanitizeCoachCards(cards) {
  if (!Array.isArray(cards)) return [];
  const out = [];
  for (const card of cards.slice(0, MAX_CARDS)) {
    if (!card || typeof card !== "object" || Array.isArray(card)) continue;
    const name = clipCardText(card.name, 120) || clipCardText(card.title, 120);
    if (!name) continue;
    const num = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : 0;
    };
    const reason = clipCardText(card.reason, 280) || clipCardText(card.shownReason, 280);
    const source = clipCardText(card.source, 32);
    const title = clipCardText(card.title, 160);
    const tag = clipCardText(card.tag, 40);
    const id = clipCardText(card.id, 80);
    const basedOn = clipCardText(card.basedOn, 120);
    out.push({
      name,
      title: title || name,
      source: CARD_SOURCES.has(source) ? source : (source || ""),
      tag,
      id,
      basedOn: basedOn || null,
      servings: cardServings(card.servings),
      cal: num(card.cal),
      p: num(card.p),
      c: num(card.c),
      f: num(card.f),
      reason,
    });
  }
  return out;
}

export function sanitizeCoachReply({
  body = "",
  kind = "text",
  payload = null,
  localDate = null,
  source = "server",
  requestId = null,
} = {}) {
  const nextKind = COACH_KINDS.has(kind) ? kind : "text";
  const nextSource = source === "client" ? "client" : "server";
  const ticket = isCoachRequestId(requestId)
    ? String(requestId).trim()
    : (isCoachRequestId(payload?.requestId) ? String(payload.requestId).trim() : null);
  let nextPayload = null;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const deflect = nextSource === "client"
      ? null
      : (payload.deflect ? String(payload.deflect).slice(0, 40) : null);
    nextPayload = {
      cards: sanitizeCoachCards(payload.cards),
      deflect,
      aside: payload.aside ? String(payload.aside).slice(0, 40) : null,
      teach: payload.teach ? String(payload.teach).slice(0, 40) : null,
      requestId: ticket,
    };
    if (
      !nextPayload.cards.length
      && !nextPayload.deflect
      && !nextPayload.aside
      && !nextPayload.teach
      && !nextPayload.requestId
    ) {
      nextPayload = null;
    }
  }
  const day = String(localDate || "").trim();
  return {
    role: "coach",
    source: nextSource,
    body: String(body || "").slice(0, 4000),
    kind: nextKind,
    payload: nextPayload,
    request_id: ticket,
    local_date: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
  };
}

/**
 * Local / teach persist. Rebuild from a template id when we can.
 * Otherwise mark source=client. Arbitrary coach content is rejected.
 */
export function buildLocalCoachRecord(body = {}) {
  const template = String(body.template || "");
  if (!LOCAL_TEMPLATES.has(template)) return null;

  if (template === "local.teach") {
    const topic = String(body.topic || body.payload?.teach || "").slice(0, 40);
    const notLogging = Boolean(body.payload?.notLogging || body.notLogging);
    const rebuilt = teachBody(topic, { notLogging });
    if (!rebuilt) return null;
    const cards = sanitizeCoachCards(body.payload?.cards || body.cards);
    return {
      body: rebuilt,
      kind: cards.length ? "cards" : "text",
      payload: {
        teach: topic,
        ...(cards.length ? { cards } : {}),
        ...(notLogging ? { notLogging: true } : {}),
      },
      // Client-chosen topic and day. Counting these as server writes
      // would let Record mint a Stuck pin.
      source: "client",
    };
  }

  if (template === "local.noneFit") {
    return {
      body: COACH_COPY.noneFit,
      kind: "text",
      payload: null,
      source: "server",
    };
  }

  if (template === "local.cards") {
    const cards = sanitizeCoachCards(body.payload?.cards || body.cards);
    if (!cards.length) return null;
    const aside = body.payload?.aside ? String(body.payload.aside).slice(0, 40) : null;
    return {
      body: String(body.body || "").slice(0, 400),
      kind: "cards",
      payload: { cards, aside },
      source: "client",
    };
  }

  const text = String(body.body || "").trim().slice(0, 4000);
  if (!text) return null;
  return {
    body: text,
    kind: template === "local.read" ? "read" : "text",
    payload: null,
    source: "client",
  };
}

export function replyLocalDate(body, now = new Date()) {
  const day = String(body?.localDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return coachSummaryDateIso(now);
}

export async function insertCoachReply(env, userId, message) {
  if (!userId) return { ok: false, skipped: true };
  const row = sanitizeCoachReply(message);
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("coach reply persist missing service role");
    return { ok: false };
  }

  const write = await fetch(`${base}/rest/v1/coach_messages`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      profile_id: userId,
      role: row.role,
      source: row.source,
      body: row.body,
      kind: row.kind,
      payload: row.payload,
      request_id: row.request_id,
      local_date: row.local_date || coachSummaryDateIso(),
    }),
  });
  if (!write.ok) {
    console.error("coach reply persist failed", write.status);
    return { ok: false };
  }
  const saved = await write.json().catch(() => null);
  const inserted = Array.isArray(saved) ? saved[0] : saved;
  return { ok: true, id: inserted?.id || null };
}

export function painTeachCounts(rows, topic) {
  const list = Array.isArray(rows) ? rows : [];
  const match = (row) => row?.payload?.teach === topic || row?.payload?.deflect === topic;
  const server = list.filter((row) => row?.source === "server" && match(row)).length;
  const client = list.filter((row) => row?.source === "client" && match(row)).length;
  return { server, client, total: server + client };
}

export function isStuckPainCount(counts) {
  return Boolean(counts && counts.server >= 2);
}

export async function countPainTeachToday(env, userId, topic, now = new Date()) {
  if (!userId || !topic) return { server: 0, client: 0, total: 0 };
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { server: 0, client: 0, total: 0 };
  const day = coachSummaryDateIso(now);
  const url = `${base}/rest/v1/coach_messages?profile_id=eq.${encodeURIComponent(userId)}`
    + `&local_date=eq.${encodeURIComponent(day)}&role=eq.coach&select=source,payload`;
  const read = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!read.ok) return { server: 0, client: 0, total: 0 };
  const rows = await read.json().catch(() => []);
  return painTeachCounts(rows, topic);
}

export async function persistServerCoach(env, userId, requestBody, message) {
  try {
    return await insertCoachReply(env, userId, {
      ...message,
      localDate: message.localDate || replyLocalDate(requestBody),
      source: "server",
      requestId: message.requestId || message.payload?.requestId || requestBody?.requestId,
    });
  } catch (error) {
    console.error("coach persist failed", error);
    return { ok: false };
  }
}
