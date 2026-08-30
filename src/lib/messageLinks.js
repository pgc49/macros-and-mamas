/**
 * Display-only URL split for message bubbles.
 * Does not change stored message bodies.
 */

const URL_RE = /https?:\/\/[^\s<>"']+|youtu\.be\/[^\s<>"']+/gi;
const TRAIL_PUNCT = /[),.;:!?]+$/;

function peelTrailingPunct(raw) {
  const match = String(raw || "");
  const trimmed = match.replace(TRAIL_PUNCT, "");
  return {
    url: trimmed,
    trailing: match.slice(trimmed.length),
  };
}

/** http(s) only. Bare youtu.be/… becomes https://youtu.be/… */
export function hrefForMessageUrl(raw) {
  const peeled = peelTrailingPunct(raw).url;
  if (!peeled) return "";
  const withScheme = /^https?:\/\//i.test(peeled) ? peeled : `https://${peeled}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

/**
 * Split body text into { type: "text"|"link", value, href? } parts.
 * Link `value` is the original matched text (minus trailing punctuation).
 */
export function splitLinkedMessageText(text) {
  const raw = text == null ? "" : String(text);
  if (!raw) return [];
  const parts = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match;
  while ((match = re.exec(raw))) {
    const start = match.index;
    if (start > lastIndex) {
      parts.push({ type: "text", value: raw.slice(lastIndex, start) });
    }
    const { url, trailing } = peelTrailingPunct(match[0]);
    const href = hrefForMessageUrl(url);
    if (href) {
      parts.push({ type: "link", value: url, href });
    } else {
      parts.push({ type: "text", value: match[0] });
    }
    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < raw.length) {
    parts.push({ type: "text", value: raw.slice(lastIndex) });
  }
  return parts;
}
