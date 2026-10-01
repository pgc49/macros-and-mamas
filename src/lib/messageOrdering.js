function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function messageClientId(row) {
  return String(row?.client_message_id || "").trim();
}

export function messageRowId(row) {
  return String(row?.id || "").trim();
}

/**
 * Stable identity for a bubble: the client idempotency key when present,
 * otherwise the server id. Pending sends use the client key as `id` until
 * the insert returns, so Realtime and the send response can collapse onto
 * the same row instead of painting a duplicate.
 */
export function messageIdentity(row) {
  return messageClientId(row) || messageRowId(row);
}

function isPendingStatus(row) {
  const status = String(row?.send_status || "");
  return status === "pending" || status === "failed";
}

function preferServerId(previous, row) {
  const prevId = messageRowId(previous);
  const nextId = messageRowId(row);
  const clientId = messageClientId(row) || messageClientId(previous);
  const nextIsServer = nextId && nextId !== clientId && !isPendingStatus(row);
  const prevIsServer = prevId && prevId !== clientId && !isPendingStatus(previous);
  if (nextIsServer) return nextId;
  if (prevIsServer) return prevId;
  return nextId || prevId || clientId;
}

function mergePair(previous, row) {
  const merged = { ...previous, ...row };
  merged.id = preferServerId(previous, row);
  const clientId = messageClientId(row) || messageClientId(previous);
  if (clientId) merged.client_message_id = clientId;

  const previousEdit = timestamp(previous.edited_at);
  const incomingEdit = timestamp(row.edited_at);
  if (previousEdit > incomingEdit && !row.deleted_at) {
    merged.body = previous.body;
    merged.edited_at = previous.edited_at;
  }
  if (previous.read_at && !row.read_at) merged.read_at = previous.read_at;
  if (previous.deleted_at && !row.deleted_at) {
    merged.body = previous.body;
    merged.deleted_at = previous.deleted_at;
    merged.attachmentUrl = null;
  }
  if (!Object.hasOwn(row, "reactions")) merged.reactions = previous.reactions;
  if (
    previous.reply_to
    && (!row.reply_to || (row.reply_to.missing && !previous.reply_to.missing))
  ) {
    merged.reply_to = previous.reply_to;
  }
  if (!row.sender_profile && previous.sender_profile) {
    merged.sender_profile = previous.sender_profile;
  }
  if (!previous.deleted_at && !row.deleted_at && !row.attachmentUrl && previous.attachmentUrl) {
    merged.attachmentUrl = previous.attachmentUrl;
  }
  if (row.deleted_at) merged.attachmentUrl = null;

  // A server row wins over a local pending/failed status. A failed retry
  // still has to be able to mark the same identity pending again.
  if (!isPendingStatus(row) && !row.send_status && !isPendingStatus(previous)) {
    delete merged.send_status;
  } else if (!isPendingStatus(row) && !row.send_status && isPendingStatus(previous)) {
    delete merged.send_status;
  }

  return merged;
}

function collectRows(current, incoming) {
  const byIdentity = new Map();
  const alias = new Map();

  const lookup = (row) => {
    const clientId = messageClientId(row);
    const id = messageRowId(row);
    if (clientId && alias.has(`c:${clientId}`)) return alias.get(`c:${clientId}`);
    if (id && alias.has(`i:${id}`)) return alias.get(`i:${id}`);
    return "";
  };

  const index = (identity, row) => {
    const clientId = messageClientId(row);
    const id = messageRowId(row);
    if (clientId) alias.set(`c:${clientId}`, identity);
    if (id) alias.set(`i:${id}`, identity);
  };

  for (const row of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!row || typeof row !== "object") continue;
    const clientId = messageClientId(row);
    const id = messageRowId(row);
    if (!id && !clientId) continue;
    const existingKey = lookup(row);
    if (!existingKey) {
      const identity = clientId || id;
      byIdentity.set(identity, row);
      index(identity, row);
      continue;
    }
    const previous = byIdentity.get(existingKey);
    const merged = mergePair(previous, row);
    byIdentity.set(existingKey, merged);
    index(existingKey, merged);
  }
  return [...byIdentity.values()];
}

/**
 * Normalize a newest-first database window into stable chat order.
 * The first copy of an identity wins — PostgREST already returned newest
 * first, so a transient duplicate must not replace the row we already kept.
 */
export function chronologicalMessages(rows) {
  const byIdentity = new Map();
  const alias = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const clientId = messageClientId(row);
    const id = messageRowId(row);
    if (!id && !clientId) continue;
    const existing = (clientId && alias.get(`c:${clientId}`))
      || (id && alias.get(`i:${id}`))
      || "";
    if (existing) continue;
    const identity = clientId || id;
    byIdentity.set(identity, row);
    if (clientId) alias.set(`c:${clientId}`, identity);
    if (id) alias.set(`i:${id}`, identity);
  }
  return sortChronologically([...byIdentity.values()]);
}

/** Merge local send / Realtime results without duplicate React keys. */
export function mergeMessagesById(current, incoming) {
  return sortChronologically(collectRows(current, incoming));
}

function sortChronologically(rows) {
  return rows.sort((a, b) => {
    const timeDiff = timestamp(a.created_at) - timestamp(b.created_at);
    if (timeDiff !== 0) return timeDiff;
    const aKey = messageIdentity(a) || messageRowId(a);
    const bKey = messageIdentity(b) || messageRowId(b);
    return String(aKey).localeCompare(String(bKey));
  });
}
