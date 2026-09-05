import { mergeMessagesById } from "./messageOrdering";
import { aggregateReactions } from "./messageReactions";

function eventName(payload) {
  return String(payload?.eventType || payload?.event || "").toUpperCase();
}

export function conversationIdFromPayload(payload) {
  return payload?.new?.conversation_id
    || payload?.old?.conversation_id
    || null;
}

export function clientIdFromPayload(payload) {
  return payload?.new?.client_id || payload?.old?.client_id || null;
}

/**
 * Merge one Realtime message event into the loaded window.
 *
 * INSERT appends (or collapses a pending send). UPDATE patches. DELETE /
 * soft-delete tombstones the row. Never replaces the rest of the thread.
 */
export function applyMessageChange(list, payload) {
  const event = eventName(payload);
  const incoming = payload?.new && typeof payload.new === "object" ? payload.new : null;
  const previous = payload?.old && typeof payload.old === "object" ? payload.old : null;
  if (event === "DELETE") {
    const row = incoming || previous;
    if (!row?.id && !row?.client_message_id) return list || [];
    return mergeMessagesById(list, [{
      ...row,
      deleted_at: row.deleted_at || new Date().toISOString(),
      attachmentUrl: null,
    }]);
  }
  if ((event === "INSERT" || event === "UPDATE") && incoming) {
    const row = { ...incoming };
    if (event === "UPDATE" && incoming.deleted_at) row.attachmentUrl = null;
    return mergeMessagesById(list, [row]);
  }
  return list || [];
}

/**
 * Patch one message's reaction rows from a Realtime event.
 *
 * Reactions carry no thread id, so the caller only invokes this for windows
 * that already contain the message. Unknown ids are a no-op — we do not
 * refetch the thread to render one emoji.
 */
export function applyReactionEvent(list, payload, selfId) {
  const event = eventName(payload);
  const row = payload?.new || payload?.old;
  const messageId = row?.message_id;
  if (!messageId) return list || [];
  return (list || []).map((m) => {
    if (m?.id !== messageId && m?.client_message_id !== messageId) return m;
    let rows = [...(m.reaction_rows || [])];
    if (event === "DELETE") {
      const gone = payload?.old || row;
      rows = rows.filter((r) => !(
        r.user_id === gone.user_id && r.emoji === gone.emoji
      ));
    } else if (event === "INSERT" || event === "UPDATE") {
      const next = payload?.new || row;
      rows = rows.filter((r) => r.user_id !== next.user_id);
      if (next.emoji && next.user_id) {
        rows.push({
          id: next.id,
          message_id: messageId,
          user_id: next.user_id,
          emoji: next.emoji,
          created_at: next.created_at,
        });
      }
    }
    return { ...m, reaction_rows: rows, reactions: aggregateReactions(rows, selfId) };
  });
}

/** True when this INSERT should light an unread dot on a thread the reader is not looking at. */
export function inboundUnreadFromPayload(payload, selfId) {
  if (eventName(payload) !== "INSERT") return false;
  const row = payload?.new;
  if (!row || row.deleted_at) return false;
  if (selfId && row.sender_id === selfId) return false;
  return true;
}
