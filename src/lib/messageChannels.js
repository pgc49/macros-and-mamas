import { aggregateReactions, toggleReactionRows } from "./messageReactions";

/**
 * Opening window for a thread. A cohort group accumulates forever, so the first
 * paint takes a couple of screens and "Load earlier messages" walks back from
 * there. Loading the whole backlog up front is what made the August group slow.
 */
export const MESSAGE_PAGE_SIZE = 40;
export const MESSAGE_PAGE_MAX = 200;

/**
 * Merge a freshly fetched channel list over the one on screen.
 *
 * Unread dots are resolved separately from the list itself so the pills can
 * paint immediately. Carrying the known dots across means a refresh does not
 * blink every dot off and back on again.
 */
export function mergeChannelList(previous, incoming) {
  const knownUnread = new Map(
    (previous || [])
      .filter((item) => item?.conversation?.id)
      .map((item) => [item.conversation.id, !!item.hasUnread]),
  );
  return (incoming || []).map((item) => ({
    ...item,
    hasUnread: knownUnread.get(item?.conversation?.id) ?? false,
  }));
}

/**
 * Apply a tapback to the loaded window without re-fetching the thread.
 *
 * Reloading a whole channel to render one emoji replaced every message object
 * on screen, which is exactly the kind of churn that moved the scroll position
 * under the reader.
 */
export function applyReactionToMessages(messages, messageId, emoji, selfId) {
  if (!messageId || !selfId) return messages || [];
  return (messages || []).map((m) => {
    if (m?.id !== messageId) return m;
    const rows = toggleReactionRows(m.reaction_rows || [], selfId, emoji);
    return { ...m, reaction_rows: rows, reactions: aggregateReactions(rows, selfId) };
  });
}

/**
 * Whether a fetched page suggests there is more history behind it.
 *
 * A short page means the thread ran out; a full page means there is probably
 * another one. One wasted request at an exact multiple beats tracking a total.
 */
export function pageHasMore(page, requestedLimit) {
  return (page?.length || 0) >= Math.max(1, Number(requestedLimit) || 1);
}

/** Cursor for the page before everything currently loaded. */
export function earlierCursor(messages) {
  const oldest = (messages || [])[0];
  if (!oldest?.created_at || !oldest?.id) return null;
  return { created_at: oldest.created_at, id: oldest.id };
}
