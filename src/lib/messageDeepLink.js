/**
 * Push and email CTAs land on Messages with query params. The thread must
 * open the named conversation and (when present) scroll to that message
 * without treating "opened the pane" as "saw the tip".
 */

export function parseMessageDeepLink(search = "") {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const channel = String(params.get("channel") || "").trim();
  const client = String(params.get("client") || "").trim();
  const message = String(params.get("message") || "").trim();
  return {
    channel: channel || null,
    client: client || null,
    message: message || null,
  };
}

export function dmNotificationUrl({ isAdminRecipient, clientId, messageId } = {}) {
  const path = isAdminRecipient ? "/admin" : "/dashboard";
  const params = new URLSearchParams();
  params.set("tab", "messages");
  if (isAdminRecipient && clientId) params.set("client", clientId);
  if (messageId) params.set("message", messageId);
  return `${path}?${params.toString()}`;
}

export function channelNotificationUrl(conversationId, isAdminRecipient, messageId) {
  const path = isAdminRecipient ? "/admin" : "/dashboard";
  const params = new URLSearchParams();
  params.set("tab", "messages");
  if (conversationId) params.set("channel", conversationId);
  if (messageId) params.set("message", messageId);
  return `${path}?${params.toString()}`;
}
