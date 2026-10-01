import { describe, expect, it } from "vitest";
import {
  jumpLatestLabel,
  nextUnseenCount,
  shouldMarkThreadRead,
} from "./threadReadState";

describe("shouldMarkThreadRead", () => {
  it("marks only when the tip is in view and no deep-link is pending", () => {
    expect(shouldMarkThreadRead({
      latestMessageId: "m-9",
      atLatest: true,
      focusPending: false,
    })).toBe(true);
  });

  it("holds while the reader is scrolled up", () => {
    expect(shouldMarkThreadRead({
      latestMessageId: "m-9",
      atLatest: false,
      focusPending: false,
    })).toBe(false);
  });

  it("holds while a push target is still being scrolled into place", () => {
    expect(shouldMarkThreadRead({
      latestMessageId: "m-9",
      atLatest: true,
      focusPending: true,
    })).toBe(false);
  });

  it("holds on an empty thread", () => {
    expect(shouldMarkThreadRead({
      latestMessageId: "",
      atLatest: true,
      focusPending: false,
    })).toBe(false);
  });
});

describe("nextUnseenCount", () => {
  it("counts each new tip while the reader is away from the live edge", () => {
    expect(nextUnseenCount({ unseenCount: 0, atLatest: false, tipChanged: true })).toBe(1);
    expect(nextUnseenCount({ unseenCount: 2, atLatest: false, tipChanged: true })).toBe(3);
  });

  it("clears when the reader is already at the tip", () => {
    expect(nextUnseenCount({ unseenCount: 4, atLatest: true, tipChanged: true })).toBe(0);
  });

  it("holds when the tip did not move", () => {
    expect(nextUnseenCount({ unseenCount: 2, atLatest: false, tipChanged: false })).toBe(2);
  });
});

describe("jumpLatestLabel", () => {
  it("names the unseen count", () => {
    expect(jumpLatestLabel(0)).toBe("Jump to latest ↓");
    expect(jumpLatestLabel(3)).toBe("3 new ↓");
  });
});
