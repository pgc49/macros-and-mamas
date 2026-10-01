import { describe, expect, it } from "vitest";
import {
  applyMessageChange,
  applyReactionEvent,
  inboundUnreadFromPayload,
} from "./realtimeMessageApply";

const open = [
  { id: "m-1", body: "hi", created_at: "2026-09-05T12:00:00.000Z", reaction_rows: [], reactions: [] },
];

describe("applyMessageChange", () => {
  it("inserts one row without dropping the rest of the window", () => {
    const next = applyMessageChange(open, {
      eventType: "INSERT",
      new: { id: "m-2", body: "new", created_at: "2026-09-05T12:01:00.000Z" },
    });
    expect(next.map((m) => m.id)).toEqual(["m-1", "m-2"]);
    expect(next[0]).toBe(open[0]);
  });

  it("patches an edit in place", () => {
    const next = applyMessageChange(open, {
      eventType: "UPDATE",
      new: { id: "m-1", body: "edited", edited_at: "2026-09-05T12:02:00.000Z" },
    });
    expect(next).toHaveLength(1);
    expect(next[0].body).toBe("edited");
  });

  it("tombstones a delete", () => {
    const next = applyMessageChange(open, {
      eventType: "DELETE",
      old: { id: "m-1" },
    });
    expect(next[0].deleted_at).toBeTruthy();
  });

  it("collapses a pending send onto the Realtime insert", () => {
    const pending = [{
      id: "cli-1",
      client_message_id: "cli-1",
      body: "mine",
      created_at: "2026-09-05T12:03:00.000Z",
      send_status: "pending",
    }];
    const next = applyMessageChange(pending, {
      eventType: "INSERT",
      new: {
        id: "srv-1",
        client_message_id: "cli-1",
        body: "mine",
        created_at: "2026-09-05T12:03:00.000Z",
      },
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("srv-1");
  });
});

describe("applyReactionEvent", () => {
  it("adds a tapback to the matching message only", () => {
    const next = applyReactionEvent(open, {
      eventType: "INSERT",
      new: { message_id: "m-1", user_id: "mama-1", emoji: "❤️" },
    }, "mama-1");
    expect(next[0].reactions).toEqual([{ emoji: "❤️", count: 1, mine: true }]);
  });

  it("leaves the window alone when the message is not loaded", () => {
    const next = applyReactionEvent(open, {
      eventType: "INSERT",
      new: { message_id: "other", user_id: "mama-1", emoji: "❤️" },
    }, "mama-1");
    expect(next[0]).toBe(open[0]);
    expect(next[0].reactions).toEqual([]);
  });
});

describe("inboundUnreadFromPayload", () => {
  it("marks unread for someone else's insert", () => {
    expect(inboundUnreadFromPayload({
      eventType: "INSERT",
      new: { sender_id: "other", conversation_id: "aug" },
    }, "mama-1")).toBe(true);
  });

  it("ignores the reader's own send", () => {
    expect(inboundUnreadFromPayload({
      eventType: "INSERT",
      new: { sender_id: "mama-1", conversation_id: "aug" },
    }, "mama-1")).toBe(false);
  });
});
