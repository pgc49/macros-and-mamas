/**
 * Storage attachment URLs are signed per request, so re-signing on every thread
 * refresh hands React a brand-new `src` for an image that has not changed. The
 * browser drops the decoded frame, the bubble collapses to zero height, and the
 * message list jumps under whoever was reading it.
 *
 * Caching by storage path keeps the URL — and therefore the rendered height —
 * stable across refreshes, and batching collapses one signing request per
 * attachment into one per thread load.
 */

export const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Re-sign this far ahead of expiry so a long-open thread never renders a dead URL. */
export const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * @param {{ ttlSeconds?: number, refreshMarginMs?: number, now?: () => number }} options
 */
export function createSignedUrlCache({
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
  refreshMarginMs = SIGNED_URL_REFRESH_MARGIN_MS,
  now = () => Date.now(),
} = {}) {
  /** @type {Map<string, { url: string, expiresAt: number }>} */
  const signed = new Map();
  /** @type {Map<string, Promise<string|null>>} */
  const inFlight = new Map();

  const keyFor = (bucket, path) => `${bucket}\n${path}`;

  function peek(bucket, path) {
    if (!bucket || !path) return null;
    const entry = signed.get(keyFor(bucket, path));
    if (!entry) return null;
    if (entry.expiresAt - refreshMarginMs <= now()) return null;
    return entry.url;
  }

  /**
   * @param {string} bucket
   * @param {string[]} paths
   * @param {(bucket: string, paths: string[], ttlSeconds: number) =>
   *   Promise<Array<{ path?: string, signedUrl?: string }>>} signBatch
   * @returns {Promise<Map<string, string>>} resolved path → URL (misses omitted)
   */
  async function resolve(bucket, paths, signBatch) {
    const resolved = new Map();
    if (!bucket) return resolved;
    const wanted = [...new Set((paths || []).filter(Boolean))];
    if (!wanted.length) return resolved;

    const misses = [];
    for (const path of wanted) {
      const url = peek(bucket, path);
      if (url) resolved.set(path, url);
      else misses.push(path);
    }
    if (!misses.length) return resolved;

    // Parallel loads of the same attachment must share one signing request,
    // otherwise each caller renders a different URL for the same image.
    const awaiting = [];
    const toSign = [];
    for (const path of misses) {
      const existing = inFlight.get(keyFor(bucket, path));
      if (existing) awaiting.push([path, existing]);
      else toSign.push(path);
    }

    if (toSign.length) {
      const batch = (async () => {
        const rows = await signBatch(bucket, toSign, ttlSeconds);
        const byPath = new Map();
        for (const row of rows || []) {
          const path = row?.path;
          const url = row?.signedUrl || row?.signedURL || null;
          if (path && url) byPath.set(path, url);
        }
        const expiresAt = now() + ttlSeconds * 1000;
        for (const path of toSign) {
          const url = byPath.get(path);
          if (url) signed.set(keyFor(bucket, path), { url, expiresAt });
        }
        return byPath;
      })();

      for (const path of toSign) {
        const key = keyFor(bucket, path);
        const own = batch.then((byPath) => byPath.get(path) || null);
        inFlight.set(key, own);
        // Dropping the entry once it settles keeps a failed batch from
        // poisoning every later load of the same attachment.
        own.catch(() => null).then(() => {
          if (inFlight.get(key) === own) inFlight.delete(key);
        });
        awaiting.push([path, own]);
      }
    }

    const settled = await Promise.all(awaiting.map(async ([path, promise]) => {
      try {
        return [path, await promise];
      } catch {
        return [path, null];
      }
    }));
    for (const [path, url] of settled) {
      if (url) resolved.set(path, url);
    }
    return resolved;
  }

  return {
    resolve,
    peek,
    clear() {
      signed.clear();
      inFlight.clear();
    },
  };
}
