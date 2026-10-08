/**
 * A pasted menu link is fetched here, then handed to the model as text.
 *
 * The model does not browse. Left to "look up" a restaurant, it invents a
 * dish from the name. This module is the only way a link becomes a menu.
 *
 * HTTPS public hosts only. Private, loopback, link-local, and cloud
 * metadata addresses never get fetched — including after a redirect.
 */

export const MENU_FETCH_TIMEOUT_MS = 5_000;
export const MENU_MAX_BYTES = 1_500_000;
const MAX_CHARS = 12_000;
const MIN_CHARS = 80;
const MAX_HOPS = 3;

const METADATA_HOSTS = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.internal",
  "instance-data",
]);

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function normDish(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The dish name has to show up on the page, in order. Close-enough is how "Jane Salad" got invented. */
export function dishOnPage(name, pageText) {
  const dish = normDish(name).replace(/^the /, "");
  const page = normDish(pageText);
  if (dish.length < 4 || !page) return false;
  return page.includes(dish);
}

function isBlockedIpv4(parts) {
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c, d] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b === 100 && c === 100 && d === 200) return true;
  return false;
}

function expandIpv6(host) {
  const raw = String(host || "").toLowerCase();
  if (!raw.includes(":")) return null;
  let v4tail = null;
  let core = raw;
  const lastColon = raw.lastIndexOf(":");
  const maybeV4 = raw.slice(lastColon + 1);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(maybeV4)) {
    v4tail = maybeV4.split(".").map(Number);
    core = raw.slice(0, lastColon);
    if (core.endsWith(":")) core = `${core}:`;
  }
  if ((core.match(/::/g) || []).length > 1) return null;
  const halves = core.split("::");
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const fill = (v4tail ? 6 : 8) - left.length - right.length;
  if (halves.length === 1 && fill !== 0) return null;
  if (halves.length === 2 && fill < 0) return null;
  const groups = [
    ...left,
    ...(halves.length === 2 ? Array(fill).fill("0") : []),
    ...right,
  ];
  if (groups.length !== (v4tail ? 6 : 8)) return null;
  const parts = groups.map((group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return NaN;
    return parseInt(group, 16);
  });
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return { parts, v4tail };
}

function mappedIpv4(parts) {
  if (parts.length === 8 && parts.slice(0, 5).every((n) => n === 0) && parts[5] === 0xffff) {
    return [(parts[6] >> 8) & 255, parts[6] & 255, (parts[7] >> 8) & 255, parts[7] & 255];
  }
  return null;
}

function isBlockedIpv6(host) {
  const parsed = expandIpv6(host);
  if (!parsed) return true;
  if (parsed.v4tail) {
    const prefix = parsed.parts;
    const mapped = prefix.length === 6
      && prefix.slice(0, 5).every((n) => n === 0)
      && prefix[5] === 0xffff;
    return mapped ? isBlockedIpv4(parsed.v4tail) : true;
  }
  const mapped = mappedIpv4(parsed.parts);
  if (mapped) return isBlockedIpv4(mapped);
  const [a] = parsed.parts;
  if (parsed.parts.every((n) => n === 0)) return true;
  if (parsed.parts.slice(0, 7).every((n) => n === 0) && parsed.parts[7] === 1) return true;
  if ((a & 0xffc0) === 0xfe80) return true;
  if ((a & 0xfe00) === 0xfc00) return true;
  return false;
}

export function isBlockedMenuHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (METADATA_HOSTS.has(host) || host.endsWith(".metadata.google.internal")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
  if (host.startsWith("::ffff:")) return isBlockedMenuHost(host.slice("::ffff:".length));
  if (/^\d+$/.test(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return isBlockedIpv4(ipv4.slice(1).map(Number));
  if (host.includes(":")) return isBlockedIpv6(host);
  return false;
}

/** Public https only. Private hosts and metadata addresses never get fetched. */
export function firstMenuLink(raw) {
  const source = String(raw || "");
  const match = source.match(/https?:\/\/[^\s<>"']+/i) || source.match(/\bwww\.[^\s<>"']+/i);
  if (!match) return null;
  let href = match[0].replace(/[),.;\]]+$/, "");
  if (/^www\./i.test(href)) href = `https://${href}`;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isBlockedMenuHost(url.hostname)) return null;
  return url.toString();
}

/**
 * @returns {Promise<{ok: true, url: string, text: string} | {ok: false, reason: string}>}
 */
export async function fetchMenuPage(rawUrl, fetchImpl = fetch) {
  let current = firstMenuLink(rawUrl);
  if (!current) return { ok: false, reason: "bad-url" };

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let resp;
    try {
      resp = await fetchImpl(current, {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(MENU_FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: "network" };
    }

    if (resp.status >= 300 && resp.status < 400) {
      const next = firstMenuLink(new URL(resp.headers.get("location") || "", current).toString());
      if (!next) return { ok: false, reason: "redirect" };
      current = next;
      continue;
    }

    if (!resp.ok) return { ok: false, reason: "http" };
    const declared = Number(resp.headers.get("content-length") || 0);
    if (declared > MENU_MAX_BYTES) return { ok: false, reason: "too-big" };
    const type = String(resp.headers.get("content-type") || "");
    if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      return { ok: false, reason: "type" };
    }

    const bytes = await resp.arrayBuffer();
    if (bytes.byteLength > MENU_MAX_BYTES) return { ok: false, reason: "too-big" };
    const text = htmlToText(new TextDecoder().decode(bytes)).slice(0, MAX_CHARS);
    if (text.length < MIN_CHARS) return { ok: false, reason: "empty" };
    return { ok: true, url: current, text };
  }

  return { ok: false, reason: "redirect" };
}
