/**
 * Session cache for the Today Monday voice drop.
 * The banner used to refetch on every Today remount, then insert at the top
 * of the scroller — that layout jump is what made the page feel frozen.
 */

let cached = undefined;
let inflight = null;

export function peekVoiceDropCache() {
  return cached;
}

export function seedVoiceDropCache(row) {
  cached = row === undefined ? undefined : (row || null);
}

export function clearVoiceDropCache() {
  cached = undefined;
  inflight = null;
}

/**
 * @param {() => Promise<object|null>} load
 * @returns {Promise<object|null>}
 */
export async function loadCurrentVoiceDropCached(load) {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = Promise.resolve(load())
    .then((row) => {
      cached = row || null;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
