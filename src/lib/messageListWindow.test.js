import { describe, expect, it } from "vitest";
import {
  commitWindowRange,
  estimateBubbleHeight,
  heightsForMessages,
  indexOfMessage,
  offsetToIndex,
  reservedImageHeight,
  scrollTopAfterHeightChange,
  shouldRemeasure,
  totalListHeight,
  visibleMessageRange,
} from "./messageListWindow";

describe("estimateBubbleHeight", () => {
  it("reserves a real photo box when width and height are known", () => {
    const text = estimateBubbleHeight({ body: "hi" });
    const photo = estimateBubbleHeight({
      body: "",
      attachment_path: "x.jpg",
      attachment_mime: "image/jpeg",
      attachment_width: 640,
      attachment_height: 400,
    });
    expect(photo).toBeGreaterThan(text);
    expect(reservedImageHeight({
      attachment_width: 640,
      attachment_height: 400,
    })).toBeGreaterThan(80);
  });

  it("falls back to 80px when the photo has no size yet", () => {
    expect(reservedImageHeight({ attachment_mime: "image/jpeg" })).toBe(80);
  });

  it("uses a compact height for deleted rows", () => {
    expect(estimateBubbleHeight({ deleted_at: "2026-09-05T00:00:00Z", body: "gone" })).toBe(66);
  });
});

describe("visibleMessageRange", () => {
  const heights = Array.from({ length: 120 }, () => 80);

  it("windows about a phone viewport plus overscan instead of every row", () => {
    const range = visibleMessageRange({
      heights,
      scrollTop: 4000,
      clientHeight: 500,
      overscan: 8,
    });
    expect(range.end - range.start).toBeLessThan(30);
    expect(range.end - range.start).toBeGreaterThan(10);
    expect(range.topSpacer + totalListHeight(heights.slice(range.start, range.end)) + range.bottomSpacer)
      .toBe(totalListHeight(heights));
  });

  it("keeps a nearby pin mounted without opening the whole list", () => {
    const range = visibleMessageRange({
      heights,
      scrollTop: 80 * 110,
      clientHeight: 400,
      overscan: 2,
      pinIndexes: [119],
    });
    expect(range.end).toBe(120);
    expect(range.start).toBeGreaterThan(90);
  });

  it("reports empty spacers for an empty list", () => {
    expect(visibleMessageRange({ heights: [] })).toEqual({
      start: 0,
      end: 0,
      topSpacer: 0,
      bottomSpacer: 0,
    });
  });
});

describe("heightsForMessages", () => {
  it("prefers a measured height over the estimate", () => {
    const rows = [{ id: "a", body: "short" }];
    const measured = new Map([["a", 140]]);
    expect(heightsForMessages(rows, measured)).toEqual([140]);
    expect(heightsForMessages(rows, null)[0]).toBe(estimateBubbleHeight(rows[0]));
  });
});

describe("commitWindowRange", () => {
  const heights = Array.from({ length: 80 }, () => 80);

  it("holds the mounted slice until the viewport walks several rows", () => {
    const prev = visibleMessageRange({
      heights,
      scrollTop: 80 * 40,
      clientHeight: 400,
      overscan: 8,
    });
    const next = visibleMessageRange({
      heights,
      scrollTop: 80 * 42,
      clientHeight: 400,
      overscan: 8,
    });
    const held = commitWindowRange(prev, next, heights, { holdRows: 6 });
    expect(held.start).toBe(prev.start);
    expect(held.end).toBe(prev.end);
  });

  it("commits when the reader reaches the top or the jump is forced", () => {
    const prev = { start: 12, end: 40, topSpacer: 960, bottomSpacer: 3200 };
    const next = visibleMessageRange({
      heights,
      scrollTop: 0,
      clientHeight: 400,
      overscan: 8,
    });
    expect(commitWindowRange(prev, next, heights).start).toBe(0);
    const forced = visibleMessageRange({
      heights,
      scrollTop: 80 * 60,
      clientHeight: 400,
      overscan: 8,
    });
    expect(commitWindowRange(prev, forced, heights, { force: true })).toEqual(forced);
  });
});

describe("scrollTopAfterHeightChange", () => {
  it("shifts scroll when the changed row sits fully above the viewport", () => {
    expect(scrollTopAfterHeightChange({
      itemOffset: 100,
      previousHeight: 80,
      nextHeight: 140,
      scrollTop: 400,
    })).toBe(460);
  });

  it("leaves scroll alone when the changed row is on screen", () => {
    expect(scrollTopAfterHeightChange({
      itemOffset: 380,
      previousHeight: 80,
      nextHeight: 140,
      scrollTop: 400,
    })).toBe(400);
  });
});

describe("offset helpers", () => {
  it("scrolls to the sum of prior row heights", () => {
    expect(offsetToIndex([80, 80, 80], 2, 16)).toBe(144);
    expect(indexOfMessage([{ id: "a" }, { client_message_id: "c" }], "c")).toBe(1);
  });

  it("only remeasures when the box moved more than a pixel", () => {
    expect(shouldRemeasure(100, 100.4)).toBe(false);
    expect(shouldRemeasure(100, 102)).toBe(true);
  });
});
