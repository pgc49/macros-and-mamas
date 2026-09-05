/**
 * Honest unread for a chat thread: last_read only moves when the live tip is
 * actually on screen. Opening the pane, or a push deep-link that lands on an
 * older row, must not clear the unread dot.
 */

export function shouldMarkThreadRead({ latestMessageId, atLatest, focusPending }) {
  return Boolean(latestMessageId && atLatest && !focusPending);
}

export function nextUnseenCount({ unseenCount = 0, atLatest, tipChanged }) {
  if (!tipChanged) return unseenCount;
  if (atLatest) return 0;
  return (Number(unseenCount) || 0) + 1;
}

export function jumpLatestLabel(unseenCount) {
  const n = Number(unseenCount) || 0;
  return n > 0 ? `${n} new ↓` : "Jump to latest ↓";
}
