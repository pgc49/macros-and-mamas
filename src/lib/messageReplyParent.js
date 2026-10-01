/**
 * Reply quotes whose parent sits outside the loaded page.
 * Fetch that one row for the preview, then jump/page back when tapped.
 */

export function replyPreviewFrom(parent, id = "") {
  if (!parent) {
    return {
      id: id || null,
      body: "",
      missing: true,
      deleted_at: null,
      sender_id: null,
    };
  }
  return {
    id: parent.id,
    body: parent.deleted_at ? "" : (parent.body || ""),
    deleted_at: parent.deleted_at || null,
    sender_id: parent.sender_id || null,
    sender_profile: parent.sender_profile || null,
    attachment_name: parent.deleted_at ? null : (parent.attachment_name || null),
    missing: false,
  };
}

export function missingReplyIds(rows) {
  const seen = new Set();
  const ids = [];
  for (const row of rows || []) {
    const id = String(row?.reply_to_id || "");
    if (!id || seen.has(id)) continue;
    if (row.reply_to && row.reply_to.missing === false) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function applyFetchedReplyParents(rows, parents) {
  const byId = new Map((parents || []).filter((row) => row?.id).map((row) => [String(row.id), row]));
  if (!byId.size) return rows || [];
  return (rows || []).map((row) => {
    if (!row?.reply_to_id) return row;
    if (row.reply_to && row.reply_to.missing === false) return row;
    const parent = byId.get(String(row.reply_to_id));
    if (!parent) return row;
    return { ...row, reply_to: replyPreviewFrom(parent, row.reply_to_id) };
  });
}

export function loadedMessageMatches(message, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    message?.body,
    message?.attachment_name,
    message?.reply_to?.body,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(needle);
}

export function findLoadedMatchIndexes(messages, query) {
  const needle = String(query || "").trim();
  if (!needle) return [];
  return (messages || []).reduce((indexes, message, index) => {
    if (loadedMessageMatches(message, needle)) indexes.push(index);
    return indexes;
  }, []);
}

export function nextMatchIndex(indexes, current, direction = 1) {
  if (!indexes.length) return -1;
  if (!Number.isInteger(current) || current < 0) {
    return direction >= 0 ? indexes[0] : indexes[indexes.length - 1];
  }
  if (direction >= 0) {
    return indexes.find((index) => index > current) ?? indexes[0];
  }
  for (let i = indexes.length - 1; i >= 0; i -= 1) {
    if (indexes[i] < current) return indexes[i];
  }
  return indexes[indexes.length - 1];
}
