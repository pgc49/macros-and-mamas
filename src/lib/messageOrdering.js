function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalize a newest-first database window into stable chat order.
 * `id` breaks equal-timestamp ties, and duplicate rows from local-send +
 * Realtime reconciliation collapse to one visible message.
 */
export function chronologicalMessages(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim();
    if (!id) continue;
    // Database windows arrive newest-first. Keep the first copy if a
    // transient duplicate appears.
    if (!byId.has(id)) byId.set(id, row);
  }
  return sortChronologically([...byId.values()]);
}

/** Merge local send / Realtime results without duplicate React keys. */
export function mergeMessagesById(current, incoming) {
  const byId = new Map();
  for (const row of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim();
    if (!id) continue;
    // Incoming authoritative rows replace an existing optimistic/local copy.
    byId.set(id, row);
  }
  return sortChronologically([...byId.values()]);
}

function sortChronologically(rows) {
  return rows.sort((a, b) => {
    const timeDiff = timestamp(a.created_at) - timestamp(b.created_at);
    if (timeDiff !== 0) return timeDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

