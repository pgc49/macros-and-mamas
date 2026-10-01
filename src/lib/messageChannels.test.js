import { describe, expect, it } from "vitest";
import {
  MESSAGE_PAGE_SIZE,
  applyReactionToMessages,
  earlierCursor,
  membershipHasUnread,
  mergeChannelList,
  pageHasMore,
} from "./messageChannels";

function item(id, hasUnread = false) {
  return { conversation: { id, label: id }, membership: { user_id: "mama-1" }, hasUnread };
}

describe("mergeChannelList", () => {
  it("carries known unread dots across a refresh", () => {
    const previous = [item("aug", true), item("founding", false)];
    const incoming = [item("aug"), item("founding")];

    const merged = mergeChannelList(previous, incoming);

    // Dropping the dot here would blink it off and back on every refresh.
    expect(merged.map((i) => i.hasUnread)).toEqual([true, false]);
  });

  it("takes the incoming list's membership and ordering", () => {
    const merged = mergeChannelList(
      [item("aug", true)],
      [{ conversation: { id: "aug" }, membership: { notify_level: "mute" } }],
    );

    expect(merged[0].membership).toEqual({ notify_level: "mute" });
    expect(merged[0].hasUnread).toBe(true);
  });

  it("defaults an unseen channel to no dot", () => {
    expect(mergeChannelList([], [item("new")])[0].hasUnread).toBe(false);
  });

  it("drops a channel the reader no longer belongs to", () => {
    const merged = mergeChannelList([item("aug", true), item("old", true)], [item("aug")]);
    expect(merged.map((i) => i.conversation.id)).toEqual(["aug"]);
  });

  it("tolerates missing lists and malformed rows", () => {
    expect(mergeChannelList(null, null)).toEqual([]);
    expect(mergeChannelList([{}], [{}])).toEqual([{ hasUnread: false }]);
  });
});

describe("applyReactionToMessages", () => {
  const messages = [
    { id: "m-1", body: "hi", reaction_rows: [] },
    { id: "m-2", body: "hey", reaction_rows: [{ emoji: "👍", user_id: "other" }] },
  ];

  it("adds a tapback and its aggregate chip", () => {
    const next = applyReactionToMessages(messages, "m-1", "❤️", "mama-1");

    expect(next[0].reaction_rows).toEqual([{ emoji: "❤️", user_id: "mama-1" }]);
    expect(next[0].reactions).toEqual([{ emoji: "❤️", count: 1, mine: true }]);
  });

  it("clears the reader's own tapback when they pick it again", () => {
    const once = applyReactionToMessages(messages, "m-1", "❤️", "mama-1");
    const twice = applyReactionToMessages(once, "m-1", "❤️", "mama-1");

    expect(twice[0].reaction_rows).toEqual([]);
    expect(twice[0].reactions).toEqual([]);
  });

  it("replaces the reader's tapback rather than stacking a second", () => {
    const heart = applyReactionToMessages(messages, "m-1", "❤️", "mama-1");
    const laugh = applyReactionToMessages(heart, "m-1", "😂", "mama-1");

    expect(laugh[0].reaction_rows).toEqual([{ emoji: "😂", user_id: "mama-1" }]);
  });

  it("keeps other readers' tapbacks on the same message", () => {
    const next = applyReactionToMessages(messages, "m-2", "👍", "mama-1");

    expect(next[1].reactions).toEqual([{ emoji: "👍", count: 2, mine: true }]);
  });

  it("leaves every other message identical so React can skip them", () => {
    const next = applyReactionToMessages(messages, "m-1", "❤️", "mama-1");

    expect(next[1]).toBe(messages[1]);
  });

  it("ignores an unknown emoji", () => {
    const next = applyReactionToMessages(messages, "m-1", "🦄", "mama-1");
    expect(next[0].reaction_rows).toEqual([]);
  });

  it("does nothing without a message id or a reader", () => {
    expect(applyReactionToMessages(messages, null, "❤️", "mama-1")).toBe(messages);
    expect(applyReactionToMessages(messages, "m-1", "❤️", null)).toBe(messages);
  });

  it("tolerates an empty window", () => {
    expect(applyReactionToMessages(null, "m-1", "❤️", "mama-1")).toEqual([]);
  });
});

describe("membershipHasUnread", () => {
  it("is unread when inbound is newer than last read", () => {
    expect(membershipHasUnread({
      last_inbound_at: "2026-09-05T12:05:00Z",
      last_read_at: "2026-09-05T12:00:00Z",
    })).toBe(true);
  });

  it("is caught up when the reader is at or past inbound", () => {
    expect(membershipHasUnread({
      last_inbound_at: "2026-09-05T12:00:00Z",
      last_read_at: "2026-09-05T12:00:00Z",
    })).toBe(false);
  });

  it("is caught up when last_read is later than a backdated inbound stamp", () => {
    expect(membershipHasUnread({
      last_inbound_at: "2026-09-05T12:05:00Z",
      last_read_at: "2026-09-05T13:57:00Z",
    })).toBe(false);
  });

  it("is unread when they have inbound and have never opened the thread", () => {
    expect(membershipHasUnread({ last_inbound_at: "2026-09-05T12:00:00Z" })).toBe(true);
  });

  it("is caught up when nothing has arrived", () => {
    expect(membershipHasUnread({ last_read_at: "2026-09-05T12:00:00Z" })).toBe(false);
  });
});

describe("pageHasMore", () => {
  it("treats a full page as probably having more behind it", () => {
    expect(pageHasMore(new Array(MESSAGE_PAGE_SIZE).fill({}), MESSAGE_PAGE_SIZE)).toBe(true);
  });

  it("treats a short page as the end of the thread", () => {
    expect(pageHasMore(new Array(MESSAGE_PAGE_SIZE - 1).fill({}), MESSAGE_PAGE_SIZE)).toBe(false);
    expect(pageHasMore([], MESSAGE_PAGE_SIZE)).toBe(false);
    expect(pageHasMore(null, MESSAGE_PAGE_SIZE)).toBe(false);
  });
});

describe("earlierCursor", () => {
  it("points at the oldest loaded message", () => {
    expect(earlierCursor([
      { id: "m-1", created_at: "2026-08-01T00:00:00Z" },
      { id: "m-2", created_at: "2026-08-02T00:00:00Z" },
    ])).toEqual({ id: "m-1", created_at: "2026-08-01T00:00:00Z" });
  });

  it("has no cursor for an empty or incomplete window", () => {
    expect(earlierCursor([])).toBeNull();
    expect(earlierCursor(null)).toBeNull();
    expect(earlierCursor([{ id: "m-1" }])).toBeNull();
  });
});
