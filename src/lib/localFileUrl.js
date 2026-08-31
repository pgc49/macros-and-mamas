/**
 * True when the composer body is only a local file path — typically an iOS
 * Messages attachment URL pasted instead of using +.
 * Does not match a real sentence that happens to mention a path.
 */
export function isLocalFileUrl(body) {
  const text = String(body ?? "").trim();
  if (!text) return false;
  if (/^file:\/\//i.test(text)) return true;
  if (/^\/var\/mobile\/Library\/SMS\/Attachments(?:\/|$)/i.test(text)) return true;
  return false;
}
