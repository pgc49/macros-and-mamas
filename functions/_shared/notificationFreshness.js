/** Channel fanout that dies mid-send used to retry the whole room for hours. */
export const NOTIFICATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function isMessageTooOldToNotify(createdAt, now = Date.now()) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > NOTIFICATION_MAX_AGE_MS;
}

export function notificationTag(messageType, messageId) {
  const type = String(messageType || "").trim();
  const id = String(messageId || "").trim();
  if (!type || !id) return "";
  return `${type}:${id}`.slice(0, 64);
}
