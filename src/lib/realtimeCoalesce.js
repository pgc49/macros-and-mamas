/**
 * A busy group forum delivers Realtime events in bursts: ten sends in two
 * seconds, a reaction on each, plus the read-receipt write each one triggers.
 * Refreshing once per event means ten overlapping thread reloads, and every
 * reload swaps the rendered list out from under whoever is reading it.
 *
 * Coalescing collapses a burst into a single refresh. `maxDelayMs` bounds how
 * long a sustained stream can keep deferring that refresh, so a group that
 * never goes quiet still updates.
 */

export const REALTIME_COALESCE_MS = 250;
export const REALTIME_COALESCE_MAX_MS = 1200;

/**
 * @param {() => (void | Promise<void>)} run
 * @param {{
 *   delayMs?: number,
 *   maxDelayMs?: number,
 *   now?: () => number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   cancelScheduled?: (handle: unknown) => void,
 *   onError?: (error: unknown) => void,
 * }} options
 */
export function createCoalescedRefresh(run, {
  delayMs = REALTIME_COALESCE_MS,
  maxDelayMs = REALTIME_COALESCE_MAX_MS,
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancelScheduled = (handle) => clearTimeout(handle),
  onError = (error) => console.warn("coalesced refresh failed", error),
} = {}) {
  let handle = null;
  let firstRequestAt = 0;
  let running = false;
  let dirty = false;
  let disposed = false;

  function clearTimer() {
    if (handle === null) return;
    cancelScheduled(handle);
    handle = null;
  }

  async function invoke() {
    clearTimer();
    firstRequestAt = 0;
    if (disposed) return;
    // Events that land mid-refresh are replayed once the current pass settles,
    // rather than racing a second overlapping load against it.
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      await run();
    } catch (error) {
      onError?.(error);
    } finally {
      running = false;
      if (dirty && !disposed) {
        dirty = false;
        request();
      }
    }
  }

  function request() {
    if (disposed) return;
    const at = now();
    if (!firstRequestAt) firstRequestAt = at;
    const waited = at - firstRequestAt;
    const wait = Math.max(0, Math.min(delayMs, Math.max(0, maxDelayMs - waited)));
    clearTimer();
    handle = schedule(invoke, wait);
  }

  return {
    request,
    flush: invoke,
    isPending: () => handle !== null || running || dirty,
    dispose() {
      disposed = true;
      dirty = false;
      clearTimer();
    },
  };
}
