// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOTTOM_SLACK_PX,
  createBottomPin,
  distanceFromBottom,
  isNearBottom,
  isScrollable,
  preservedScrollTop,
  bottomScrollTop,
  pinChildToBottom,
  scrollChildIntoScroller,
  scrollIntent,
  scrollMetrics,
  scrollToBottom,
} from "./stickToBottom";

/**
 * jsdom has no layout engine, so scrollHeight/clientHeight are always 0 and
 * assigning scrollTop is a no-op. This stands in for a real scroll port:
 * heights are writable and scrollTop clamps the way a browser clamps it.
 */
function fakeScroller({ scrollHeight = 1000, clientHeight = 400, scrollTop = 0 } = {}) {
  const listeners = new Map();
  return {
    scrollHeight,
    clientHeight,
    _scrollTop: scrollTop,
    get scrollTop() {
      return this._scrollTop;
    },
    set scrollTop(next) {
      this._scrollTop = Math.max(0, Math.min(next, this.scrollHeight - this.clientHeight));
    },
    addEventListener(type, fn) {
      const set = listeners.get(type) || new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    /** Content settling later — images decoding, reaction chips arriving. */
    grow(px) {
      this.scrollHeight += px;
    },
    shrink(px) {
      this.scrollHeight = Math.max(this.clientHeight, this.scrollHeight - px);
      this.scrollTop = this._scrollTop;
    },
  };
}

afterEach(() => {
  delete globalThis.ResizeObserver;
});

describe("bottom distance helpers", () => {
  it("measures the gap between the viewport and the end of the list", () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(0);
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 })).toBe(500);
  });

  it("never reports a negative gap when the browser over-scrolls", () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 400 })).toBe(0);
  });

  it("treats missing or non-numeric metrics as zero", () => {
    expect(distanceFromBottom(null)).toBe(0);
    expect(distanceFromBottom({ scrollHeight: "nope", scrollTop: undefined })).toBe(0);
  });

  it("counts a near-bottom reader as pinned within the slack window", () => {
    const almost = { scrollHeight: 1000, scrollTop: 600 - (BOTTOM_SLACK_PX - 1), clientHeight: 400 };
    const scrolledUp = { scrollHeight: 1000, scrollTop: 200, clientHeight: 400 };
    expect(isNearBottom(almost)).toBe(true);
    expect(isNearBottom(scrolledUp)).toBe(false);
  });

  it("does not treat a list shorter than its viewport as scrollable", () => {
    expect(isScrollable({ scrollHeight: 300, clientHeight: 400 })).toBe(false);
    expect(isScrollable({ scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  it("reads metrics off a live element", () => {
    const el = fakeScroller({ scrollTop: 120 });
    expect(scrollMetrics(el)).toEqual({ scrollTop: 120, scrollHeight: 1000, clientHeight: 400 });
  });
});

describe("preservedScrollTop", () => {
  it("offsets by exactly the height the prepended page added", () => {
    expect(preservedScrollTop({
      scrollHeight: 1800,
      previousScrollHeight: 1000,
      previousScrollTop: 0,
    })).toBe(800);
  });

  it("is stable when the browser already anchored the scroll itself", () => {
    // The formula uses the captured pre-prepend offset, so re-applying it after
    // native scroll anchoring has moved scrollTop lands on the same place.
    const args = { scrollHeight: 1800, previousScrollHeight: 1000, previousScrollTop: 40 };
    expect(preservedScrollTop(args)).toBe(840);
    expect(preservedScrollTop(args)).toBe(840);
  });

  it("clamps to the top rather than going negative", () => {
    expect(preservedScrollTop({
      scrollHeight: 500,
      previousScrollHeight: 1000,
      previousScrollTop: 100,
    })).toBe(0);
  });
});

describe("scrollIntent", () => {
  it("lands on the newest message for a first render and the reader's own send", () => {
    expect(scrollIntent("mount", { pinned: false })).toBe("bottom");
    expect(scrollIntent("own-send", { pinned: false })).toBe("bottom");
  });

  it("holds a reader who scrolled up when someone else posts", () => {
    expect(scrollIntent("new-message", { pinned: false })).toBe("hold");
    expect(scrollIntent("new-message", { pinned: true })).toBe("bottom");
  });

  it("re-pins a pinned reader when late content resizes the list", () => {
    expect(scrollIntent("resize", { pinned: true })).toBe("bottom");
    expect(scrollIntent("resize", { pinned: false })).toBe("hold");
  });

  it("restores the anchor row for an older page", () => {
    expect(scrollIntent("older-page", { pinned: true })).toBe("restore");
  });
});

describe("createBottomPin", () => {
  it("re-pins to the bottom when content grows late", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    pin.toBottom();
    expect(el.scrollTop).toBe(600);

    // An attachment image finishes decoding and pushes the list taller. This
    // is the moment the old one-shot jump left the reader stranded.
    el.grow(500);
    el.emit("load");

    expect(el.scrollTop).toBe(1100);
    expect(pin.isPinned()).toBe(true);
    pin.dispose();
  });

  it("recovers the bottom after a shrink-then-grow reflow", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    pin.toBottom();

    // Re-signed image URLs drop the decoded frames: the list collapses, the
    // browser clamps scrollTop, then the images reload and it grows back.
    el.shrink(500);
    el.emit("scroll");
    expect(el.scrollTop).toBe(100);
    el.grow(500);
    el.emit("load");

    expect(el.scrollTop).toBe(600);
    pin.dispose();
  });

  it("leaves a reader who scrolled up alone when content grows", () => {
    const onPinnedChange = vi.fn();
    const el = fakeScroller();
    const pin = createBottomPin(el, { onPinnedChange });
    pin.toBottom();

    el.scrollTop = 100;
    el.emit("scroll");
    expect(pin.isPinned()).toBe(false);
    expect(onPinnedChange).toHaveBeenLastCalledWith(false);

    el.grow(500);
    el.emit("load");

    expect(el.scrollTop).toBe(100);
    pin.dispose();
  });

  it("re-pins once the reader scrolls back down to the end", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    el.scrollTop = 100;
    el.emit("scroll");
    expect(pin.isPinned()).toBe(false);

    el.scrollTop = 600;
    el.emit("scroll");
    expect(pin.isPinned()).toBe(true);
    pin.dispose();
  });

  it("stays pinned when the list is shorter than the viewport", () => {
    const el = fakeScroller({ scrollHeight: 200, clientHeight: 400 });
    const pin = createBottomPin(el);
    el.emit("scroll");
    expect(pin.isPinned()).toBe(true);
    pin.dispose();
  });

  it("re-pins when the scroll port itself shrinks into a pane", () => {
    const callbacks = [];
    const observed = [];
    globalThis.ResizeObserver = class {
      constructor(fn) { callbacks.push(fn); }
      observe(node) { observed.push(node); }
      disconnect() {}
    };
    const el = fakeScroller({ scrollHeight: 1000, clientHeight: 1000 });
    const content = { tagName: "DIV" };
    const pin = createBottomPin(el, { content });
    expect(observed).toEqual([el, content]);

    // First paint: the list is as tall as its content, so there is nothing to
    // scroll. Flex then gives the port a real height and the newest row
    // would sit below the fold unless we re-pin.
    el.clientHeight = 400;
    for (const fn of callbacks) fn();

    expect(el.scrollTop).toBe(600);
    pin.dispose();
  });

  it("re-pins from a ResizeObserver on the content element", () => {
    const callbacks = [];
    globalThis.ResizeObserver = class {
      constructor(fn) { callbacks.push(fn); }
      observe() {}
      disconnect() {}
    };
    const el = fakeScroller();
    const content = { tagName: "DIV" };
    const pin = createBottomPin(el, { content });
    pin.toBottom();

    el.grow(300);
    for (const fn of callbacks) fn();

    expect(el.scrollTop).toBe(900);
    pin.dispose();
  });

  it("computes the live-edge scrollTop instead of assigning scrollHeight", () => {
    const el = fakeScroller({ scrollHeight: 1000, clientHeight: 400, scrollTop: 80 });
    expect(bottomScrollTop(el)).toBe(600);
    scrollToBottom(el);
    expect(el.scrollTop).toBe(600);
  });

  it("pins the last bubble to the pane bottom", () => {
    const el = fakeScroller({ scrollTop: 100, clientHeight: 400, scrollHeight: 2000 });
    el.getBoundingClientRect = () => ({ top: 0, bottom: 400, height: 400 });
    const child = { getBoundingClientRect: () => ({ top: 280, bottom: 360, height: 80 }) };
    expect(pinChildToBottom(el, child)).toBe(true);
    expect(el.scrollTop).toBe(60);
  });

  it("scrolls a nested child by bounding-box delta, not offsetTop", () => {
    const el = fakeScroller({ scrollTop: 40, clientHeight: 400, scrollHeight: 2000 });
    el.getBoundingClientRect = () => ({ top: 100, height: 400 });
    const child = {
      offsetTop: 8,
      getBoundingClientRect: () => ({ top: 520, height: 80 }),
    };
    expect(scrollChildIntoScroller(el, child, 16)).toBe(true);
    expect(el.scrollTop).toBe(40 + (520 - 100) - 16);
  });

  it("waits when the pane has no height yet", () => {
    const el = fakeScroller();
    el.getBoundingClientRect = () => ({ top: 0, height: 0 });
    const child = { getBoundingClientRect: () => ({ top: 200, height: 40 }) };
    expect(scrollChildIntoScroller(el, child)).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("does not snap to the tip when it starts unpinned for a deep-link", () => {
    const callbacks = [];
    globalThis.ResizeObserver = class {
      constructor(fn) { callbacks.push(fn); }
      observe() {}
      disconnect() {}
    };
    const el = fakeScroller({ scrollTop: 80 });
    const pin = createBottomPin(el, { initialPinned: false });
    expect(pin.isPinned()).toBe(false);

    el.grow(200);
    for (const fn of callbacks) fn();
    el.emit("load");

    expect(el.scrollTop).toBe(80);
    expect(pin.isPinned()).toBe(false);
    pin.dispose();
  });

  it("unpins and holds the anchor row when an older page is restored", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    pin.toBottom();

    const previous = { previousScrollHeight: el.scrollHeight, previousScrollTop: el.scrollTop };
    el.grow(800);
    pin.restore(previous);

    expect(el.scrollTop).toBe(1400);
    expect(pin.isPinned()).toBe(false);

    // The restore must survive later resizes instead of snapping to the end.
    el.grow(200);
    el.emit("load");
    expect(el.scrollTop).toBe(1400);
    pin.dispose();
  });

  it("detaches every listener on dispose", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    expect(el.listenerCount("scroll")).toBe(1);
    expect(el.listenerCount("load")).toBe(1);

    pin.dispose();

    expect(el.listenerCount("scroll")).toBe(0);
    expect(el.listenerCount("load")).toBe(0);
  });

  it("ignores work requested after dispose", () => {
    const el = fakeScroller();
    const pin = createBottomPin(el);
    pin.dispose();
    pin.toBottom();
    expect(el.scrollTop).toBe(0);
  });
});
