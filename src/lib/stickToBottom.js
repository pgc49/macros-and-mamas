/**
 * Chat panes have to keep the newest bubble in view without stealing scroll
 * from someone reading back through history.
 *
 * Bubble height settles *after* the first paint — images decode, voice players
 * mount, reaction chips arrive, signed URLs resolve — so a one-shot "scroll to
 * the bottom after render" lands on a list that is still growing. The reader
 * ends up parked above the newest message with nothing to pull them back down,
 * which reads as the pane bouncing away from the bottom while it loads.
 *
 * These helpers keep the reader's intent (pinned to the live edge vs. reading
 * history) separate from the mechanics of re-pinning on every content resize.
 */

/** Within a bubble or two of the end still counts as pinned to the live edge. */
export const BOTTOM_SLACK_PX = 72;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function scrollMetrics(el) {
  return {
    scrollTop: num(el?.scrollTop),
    scrollHeight: num(el?.scrollHeight),
    clientHeight: num(el?.clientHeight),
  };
}

export function distanceFromBottom(metrics) {
  return Math.max(
    0,
    num(metrics?.scrollHeight) - num(metrics?.scrollTop) - num(metrics?.clientHeight),
  );
}

export function isNearBottom(metrics, slack = BOTTOM_SLACK_PX) {
  return distanceFromBottom(metrics) <= Math.max(0, num(slack));
}

/** A pane shorter than its viewport has nothing to scroll, so it is always pinned. */
export function isScrollable(metrics) {
  return num(metrics?.scrollHeight) - num(metrics?.clientHeight) > 1;
}

/**
 * Scroll offset that holds the same row under the reader's eye after an older
 * page is prepended above it. Measured after the prepend commits, so it also
 * overrides whatever the browser's own scroll anchoring picked.
 */
/**
 * Scroll a nested row into a chat scroller. `offsetTop` is wrong here — the
 * bubble's offsetParent is the flex row, not the pane — so we use the
 * bounding-box delta against the live scroll port.
 */
export function scrollChildIntoScroller(scroller, child, pad = 16) {
  if (!scroller || !child?.getBoundingClientRect || !scroller.getBoundingClientRect) {
    return false;
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  if (scrollerRect.height < 2) return false;
  const next = num(scroller.scrollTop) + (childRect.top - scrollerRect.top) - Math.max(0, num(pad));
  scroller.scrollTop = Math.max(0, next);
  return true;
}

export function preservedScrollTop({ scrollHeight, previousScrollHeight, previousScrollTop }) {
  const grew = num(scrollHeight) - num(previousScrollHeight);
  return Math.max(0, num(previousScrollTop) + grew);
}

/**
 * @param {"mount"|"own-send"|"new-message"|"resize"|"older-page"} reason
 * @returns {"bottom"|"hold"|"restore"}
 */
export function scrollIntent(reason, { pinned = true } = {}) {
  if (reason === "older-page") return "restore";
  // A first render and the reader's own send always land on the newest message,
  // even when they had scrolled up to write it.
  if (reason === "mount" || reason === "own-send") return "bottom";
  return pinned ? "bottom" : "hold";
}

/**
 * Binds bottom-pinning to a live scroller.
 *
 * `content` is observed rather than `scroller` because a ResizeObserver on the
 * scroll port never fires when the list inside it grows. Image `load` events
 * are a belt-and-braces path for browsers (and jsdom) without ResizeObserver.
 *
 * @param {HTMLElement} scroller
 * @param {{ content?: HTMLElement, slack?: number, onPinnedChange?: (pinned: boolean) => void }} options
 */
export function createBottomPin(scroller, {
  content = null,
  slack = BOTTOM_SLACK_PX,
  onPinnedChange = null,
  initialPinned = true,
} = {}) {
  let pinned = initialPinned !== false;
  let disposed = false;
  const teardown = [];

  const setPinned = (next) => {
    if (pinned === next) return;
    pinned = next;
    onPinnedChange?.(next);
  };

  const toBottom = () => {
    if (disposed || !scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  };

  const repin = () => {
    if (disposed || !pinned) return;
    toBottom();
  };

  const onScroll = () => {
    if (disposed || !scroller) return;
    const metrics = scrollMetrics(scroller);
    setPinned(!isScrollable(metrics) || isNearBottom(metrics, slack));
  };

  if (scroller?.addEventListener) {
    scroller.addEventListener("scroll", onScroll, { passive: true });
    teardown.push(() => scroller.removeEventListener("scroll", onScroll));

    // `load` does not bubble, so delegate in the capture phase. Covers the
    // attachment images and audio elements that resize a bubble late.
    scroller.addEventListener("load", repin, true);
    teardown.push(() => scroller.removeEventListener("load", repin, true));
  }

  // Watch both: content growing (images, older pages) and the scroll port
  // shrinking into a real pane. Observing only the list missed the moment
  // flex layout gave the port a height smaller than its content — the first
  // paint stayed at the oldest row and looked like the thread opened mid-way.
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(repin);
    if (scroller) observer.observe(scroller);
    if (content && content !== scroller) observer.observe(content);
    teardown.push(() => observer.disconnect());
  }

  return {
    isPinned: () => pinned,
    /** Force the live edge — the reader's own send, or a fresh thread. */
    toBottom() {
      setPinned(true);
      toBottom();
    },
    /** Re-measure after a programmatic scroll the pane did not observe. */
    sync: onScroll,
    repin,
    restore(previous) {
      if (disposed || !scroller) return;
      setPinned(false);
      scroller.scrollTop = preservedScrollTop({
        scrollHeight: scroller.scrollHeight,
        ...previous,
      });
    },
    dispose() {
      disposed = true;
      for (const fn of teardown.splice(0)) {
        try { fn(); } catch { /* detached node */ }
      }
    },
  };
}
