/**
 * Virtual window for a chat list that still reports a full scrollHeight.
 *
 * Pin (`scrollToBottom`) and prepend-restore (`preservedScrollTop`) both read
 * scrollHeight. Spacers must equal the height of unrendered rows so those
 * helpers keep working after we stop mounting every bubble.
 */

export const MESSAGE_WINDOW_TARGET = 28;
export const MESSAGE_WINDOW_OVERSCAN = 8;
export const DEFAULT_BUBBLE_HEIGHT = 72;
export const IMAGE_RESERVE_MAX = 240;
export const IMAGE_RESERVE_MIN = 80;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function estimateBubbleHeight(message, {
  maxImageHeight = IMAGE_RESERVE_MAX,
  maxBubbleWidth = 280,
} = {}) {
  if (!message) return DEFAULT_BUBBLE_HEIGHT;
  if (message.deleted_at) return 56;
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
  return Math.max(48, height);
}

export function reservedImageHeight(message, {
  maxImageHeight = IMAGE_RESERVE_MAX,
  maxBubbleWidth = 280,
} = {}) {
  const width = num(message?.attachment_width);
  const height = num(message?.attachment_height);
  if (width > 0 && height > 0) {
    const scaled = height * (Math.min(maxBubbleWidth, width) / width);
    return Math.max(IMAGE_RESERVE_MIN, Math.min(maxImageHeight, Math.round(scaled)));
  }
  return IMAGE_RESERVE_MIN;
}

export function heightsForMessages(messages, measured = null) {
  return (messages || []).map((message, index) => {
    const key = message?.client_message_id || message?.id || String(index);
    const known = measured?.get?.(key);
    if (Number.isFinite(known) && known > 0) return known;
    return estimateBubbleHeight(message);
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
