/**
 * Outbox for optimistic send. Lives outside React so a remount — pill switch,
 * error boundary, Strict Mode — still shows the pending or failed bubble and
 * retries the same client_message_id.
 */

const attemptsByThread = new Map();

function bucket(threadKey) {
  const key = String(threadKey || "").trim();
  if (!key) return null;
  if (!attemptsByThread.has(key)) attemptsByThread.set(key, new Map());
  return attemptsByThread.get(key);
}

export function createClientMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

export function sendPayloadFingerprint(body, file, replyToId) {
  return [
    String(body || ""),
    String(replyToId || ""),
    String(file?.name || ""),
    String(file?.type || ""),
    Number(file?.size) || 0,
    Number(file?.lastModified) || 0,
  ].join("\u001f");
}

export function buildPendingRow({
  clientMessageId,
  selfId,
  body,
  file = null,
  previewUrl = null,
  replyTo = null,
  createdAt = null,
  width = null,
  height = null,
}) {
  const id = String(clientMessageId || "").trim();
  const mime = String(file?.type || "").toLowerCase().split(";")[0].trim();
  const hasFile = !!file;
  const mediaWidth = Number(width || file?.attachment_width) || null;
  const mediaHeight = Number(height || file?.attachment_height) || null;
  return {
    id,
    client_message_id: id,
    sender_id: selfId,
    body: String(body || ""),
    created_at: createdAt || new Date().toISOString(),
    kind: "chat",
    send_status: "pending",
    attachment_path: hasFile ? `pending:${id}` : "",
    attachment_name: hasFile ? String(file.name || "attachment").slice(0, 120) : "",
    attachment_mime: mime,
    attachment_bytes: hasFile ? (Number(file.size) || null) : null,
    attachment_width: mediaWidth,
    attachment_height: mediaHeight,
    attachmentUrl: previewUrl || null,
    reply_to_id: replyTo?.id || null,
    reply_to: replyTo
      ? {
        id: replyTo.id,
        body: replyTo.deleted_at ? "" : (replyTo.body || ""),
        deleted_at: replyTo.deleted_at || null,
        sender_id: replyTo.sender_id || null,
        sender_profile: replyTo.sender_profile || null,
        attachment_name: replyTo.deleted_at ? null : (replyTo.attachment_name || null),
        missing: false,
      }
      : null,
    reactions: [],
    reaction_rows: [],
  };
}

export function upsertPendingAttempt(threadKey, attempt) {
  const map = bucket(threadKey);
  if (!map || !attempt?.id) return attempt;
  const previous = map.get(attempt.id) || {};
  const next = { ...previous, ...attempt };
  map.set(attempt.id, next);
  return next;
}

export function getPendingAttempt(threadKey, clientMessageId) {
  const map = bucket(threadKey);
  if (!map) return null;
  return map.get(String(clientMessageId || "").trim()) || null;
}

export function findPendingByFingerprint(threadKey, fingerprint) {
  const map = bucket(threadKey);
  if (!map || !fingerprint) return null;
  for (const attempt of map.values()) {
    if (attempt.fingerprint === fingerprint) return attempt;
  }
  return null;
}

export function listPendingRows(threadKey) {
  const map = bucket(threadKey);
  if (!map) return [];
  return [...map.values()]
    .filter((attempt) => attempt?.row && attempt.status !== "cleared")
    .map((attempt) => attempt.row);
}

export function markPendingStatus(threadKey, clientMessageId, status, extra = {}) {
  const map = bucket(threadKey);
  if (!map) return null;
  const id = String(clientMessageId || "").trim();
  const previous = map.get(id);
  if (!previous) return null;
  const row = previous.row
    ? { ...previous.row, send_status: status, ...extra.row }
    : previous.row;
  const next = { ...previous, ...extra, status, row };
  map.set(id, next);
  return next;
}

export function clearPendingAttempt(threadKey, clientMessageId) {
  const map = bucket(threadKey);
  if (!map) return;
  const attempt = map.get(String(clientMessageId || "").trim());
  revokePendingPreview(attempt);
  map.delete(String(clientMessageId || "").trim());
  if (map.size === 0) attemptsByThread.delete(String(threadKey || "").trim());
}

/** Drop confirmed pending rows once the server copy is in the thread. */
export function reconcilePendingWithMessages(threadKey, messages) {
  const map = bucket(threadKey);
  if (!map) return;
  const confirmed = new Map();
  for (const row of Array.isArray(messages) ? messages : []) {
    const clientId = String(row?.client_message_id || "").trim();
    if (!clientId || row.send_status) continue;
    confirmed.set(clientId, row);
  }
  for (const [id, row] of confirmed) {
    const attempt = map.get(id);
    const stillUsed = attempt?.row?.attachmentUrl
      && row?.attachmentUrl
      && attempt.row.attachmentUrl === row.attachmentUrl;
    if (!stillUsed) revokePendingPreview(attempt);
    map.delete(id);
  }
}

function revokePendingPreview(attempt) {
  const url = attempt?.row?.attachmentUrl;
  if (url && String(url).startsWith("blob:")) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

export function clearAllPendingSends() {
  for (const map of attemptsByThread.values()) {
    for (const attempt of map.values()) revokePendingPreview(attempt);
  }
  attemptsByThread.clear();
}
