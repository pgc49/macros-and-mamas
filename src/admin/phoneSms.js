/**
 * Open the phone Messages app (iMessage on iPhone when the number can).
 * Web pages cannot force iMessage-only; sms: is the iOS entry point.
 */
export function smsHref(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `sms:${plus ? "+" : ""}${digits}`;
}
