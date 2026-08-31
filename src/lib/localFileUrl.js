/**
 * Local paths the estimator cannot open — a file:// URL, or an iOS SMS
 * attachment path. Used as a hard fail when the *whole* paste is one of
 * these, so a real recipe that merely mentions a filename still goes through.
 */

export function isLocalFileUrl(value) {
  const t = String(value || "").trim();
  if (!t) return false;
  if (/^file:/i.test(t)) return true;
  if (/^\/(?:private\/)?var\/mobile\/Library\/SMS\/Attachments\//i.test(t)) return true;
  return false;
}

/** True when the entire trimmed body is a local path, not recipe text. */
export function isLocalFilePaste(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const lines = t.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) return false;
  return isLocalFileUrl(lines[0]);
}
