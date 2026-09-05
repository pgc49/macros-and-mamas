/**
 * Virtual window for a chat list that still reports a full scrollHeight.
 *
 * Pin (`scrollToBottom`) and prepend-restore (`preservedScrollTop`) both read
 * scrollHeight. Spacers must equal the height of unrendered rows so those
 * helpers keep working after we stop mounting every bubble.
 */

export const MESSAGE_WINDOW_TARGET = 28;
export const MESSAGE_WINDOW_OVERSCAN = 8;
/** Keep the mounted slice until the viewport walks this many rows. Stops the list remounting (and jumping) on every scroll tick. */
export const WINDOW_HOLD_ROWS = 6;
export const DEFAULT_BUBBLE_HEIGHT = 72;
export const IMAGE_RESERVE_MAX = 240;
export const IMAGE_RESERVE_MIN = 80;
export const BUBBLE_STACK_GAP = 10;
export const DEFAULT_BUBBLE_WIDTH = 280;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bubbleContentWidth(listWidth, {
  maxFraction = 0.85,
  padding = 24,
  min = 160,
} = {}) {
  const width = num(listWidth);
  if (width < 1) return DEFAULT_BUBBLE_WIDTH;
  return Math.max(min, Math.round(width * maxFraction - padding));
}

export function estimateBubbleHeight(message, {
  maxImageHeight = IMAGE_RESERVE_MAX,
  maxBubbleWidth = DEFAULT_BUBBLE_WIDTH,
} = {}) {
  if (!message) return DEFAULT_BUBBLE_HEIGHT;
  if (message.deleted_at) return 56 + BUBBLE_STACK_GAP;
  let height = 52;
  const body = String(message.body || "");
  if (body) height += Math.max(21, Math.ceil(body.length / 42) * 21);
  const mime = String(message.attachment_mime || "");
  if ((message.attachment_path || message.attachmentUrl) && mime.startsWith("image/")) {
    height += reservedImageHeight(message, { maxImageHeight, maxBubbleWidth }) + 8;
  } else if (mime.startsWith("audio/")) {
    height += 56;
  } else if (message.attachment_path || message.attachmentUrl) {
    height += 24;
  }
  if (message.reply_to) height += 48;
  if (message.send_status === "pending" || message.send_status === "failed") height += 16;
  return Math.max(48, height + BUBBLE_STACK_GAP);
}

export function reservedImageHeight(message, {
  maxImageHeight = IMAGE_RESERVE_MAX,
  maxBubbleWidth = DEFAULT_BUBBLE_WIDTH,
} = {}) {
  const width = num(message?.attachment_width);
  const height = num(message?.attachment_height);
  if (width > 0 && height > 0) {
    const scaled = height * (Math.min(maxBubbleWidth, width) / width);
    return Math.max(IMAGE_RESERVE_MIN, Math.min(maxImageHeight, Math.round(scaled)));
  }
  return IMAGE_RESERVE_MIN;
}

export function heightsForMessages(messages, measured = null, options = {}) {
  return (messages || []).map((message, index) => {
    const key = message?.client_message_id || message?.id || String(index);
    const known = measured?.get?.(key);
    if (Number.isFinite(known) && known > 0) return known;
    return estimateBubbleHeight(message, options);
  });
}

export function totalListHeight(heights) {
  return (heights || []).reduce((sum, value) => sum + num(value), 0);
}

/**
 * Inclusive [start, end) range of rows that should be in the DOM.
 * `pinIndexes` stay mounted so Jump to latest / deep-link / quote targets exist.
 */
export function visibleMessageRange({
  heights = [],
  scrollTop = 0,
  clientHeight = 0,
  overscan = MESSAGE_WINDOW_OVERSCAN,
  pinIndexes = [],
} = {}) {
  const count = heights.length;
  if (count === 0) {
    return { start: 0, end: 0, topSpacer: 0, bottomSpacer: 0 };
  }
  const viewport = Math.max(1, num(clientHeight, 1));
  const top = Math.max(0, num(scrollTop));
  const bottom = top + viewport;
  let start = 0;
  let acc = 0;
  while (start < count && acc + num(heights[start]) < top) {
    acc += num(heights[start]);
    start += 1;
  }
  let end = start;
  let seen = 0;
  while (end < count && seen < bottom - top + 1) {
    seen += num(heights[end]);
    end += 1;
  }
  start = Math.max(0, start - Math.max(0, num(overscan)));
  end = Math.min(count, end + Math.max(0, num(overscan)));
  const slack = Math.max(0, num(overscan)) * 2;
  for (const raw of pinIndexes) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (index < start - slack || index > end + slack) continue;
    start = Math.min(start, index);
    end = Math.max(end, index + 1);
  }
  if (end - start < 1) end = Math.min(count, start + 1);
  const topSpacer = totalListHeight(heights.slice(0, start));
  const bottomSpacer = totalListHeight(heights.slice(end));
  return { start, end, topSpacer, bottomSpacer };
}

/**
 * Hold the already-mounted slice while the reader is still inside it.
 * Recomputing start/end on every scroll pixel remounts photos and the
 * estimate→measure correction shoves the list.
 */
export function commitWindowRange(prev, next, heights, {
  holdRows = WINDOW_HOLD_ROWS,
  force = false,
} = {}) {
  if (!next) return prev || { start: 0, end: 0, topSpacer: 0, bottomSpacer: 0 };
  if (force || !prev) return next;
  const count = (heights || []).length;
  const startDelta = Math.abs(num(next.start) - num(prev.start));
  const endDelta = Math.abs(num(next.end) - num(prev.end));
  const hitTop = next.start === 0 && prev.start !== 0;
  const hitBottom = count > 0 && next.end >= count && prev.end < count;
  const keepSlice = !hitTop && !hitBottom
    && startDelta < holdRows
    && endDelta < holdRows;
  const start = keepSlice ? prev.start : next.start;
  const end = keepSlice ? prev.end : next.end;
  const topSpacer = totalListHeight((heights || []).slice(0, start));
  const bottomSpacer = totalListHeight((heights || []).slice(end));
  if (
    start === prev.start
    && end === prev.end
    && topSpacer === prev.topSpacer
    && bottomSpacer === prev.bottomSpacer
  ) {
    return prev;
  }
  return { start, end, topSpacer, bottomSpacer };
}

/** Keep the same row under the eye when a fully-above bubble changes height. */
export function scrollTopAfterHeightChange({
  itemOffset = 0,
  previousHeight = 0,
  nextHeight = 0,
  scrollTop = 0,
} = {}) {
  const delta = num(nextHeight) - num(previousHeight);
  if (!delta) return Math.max(0, num(scrollTop));
  if (num(itemOffset) + num(previousHeight) <= num(scrollTop)) {
    return Math.max(0, num(scrollTop) + delta);
  }
  return Math.max(0, num(scrollTop));
}

export function offsetToIndex(heights, index, pad = 16) {
  if (!Number.isInteger(index) || index <= 0) return 0;
  return Math.max(0, totalListHeight(heights.slice(0, index)) - Math.max(0, num(pad)));
}

export function indexOfMessage(messages, messageId) {
  const id = String(messageId || "");
  if (!id) return -1;
  return (messages || []).findIndex((message) => (
    String(message?.id || "") === id
    || String(message?.client_message_id || "") === id
  ));
}

export function shouldRemeasure(previous, next) {
  return Math.abs(num(previous) - num(next)) > 1;
}

/** First paint assumes the reader is on the live edge, not the oldest row. */
export function initialLatestRange(messages, measured = null, clientHeight = 480) {
  const heights = heightsForMessages(messages, measured);
  const viewport = Math.max(1, num(clientHeight, 480));
  return visibleMessageRange({
    heights,
    scrollTop: Math.max(0, totalListHeight(heights) - viewport),
    clientHeight: viewport,
    overscan: MESSAGE_WINDOW_OVERSCAN,
    pinIndexes: messages?.length ? [messages.length - 1] : [],
  });
}
