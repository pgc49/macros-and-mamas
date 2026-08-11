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
    byId.set(id, row);
  }
  return [...byId.values()].sort((a, b) => {
    const timeDiff = timestamp(a.created_at) - timestamp(b.created_at);
    if (timeDiff !== 0) return timeDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

