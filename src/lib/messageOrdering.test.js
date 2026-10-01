import { describe, expect, it } from "vitest";
import { chronologicalMessages, mergeMessagesById, messageIdentity } from "./messageOrdering";

describe("messageIdentity", () => {
  it("prefers the client idempotency key", () => {
    expect(messageIdentity({ id: "server", client_message_id: "client" })).toBe("client");
  });

  it("falls back to the server id", () => {
    expect(messageIdentity({ id: "server" })).toBe("server");
  });
});

describe("mergeMessagesById client_message_id", () => {
  it("collapses a pending bubble onto the server row", () => {
    const pending = {
      id: "cli-1",
      client_message_id: "cli-1",
      body: "hi",
      created_at: "2026-09-05T12:00:00.000Z",
      send_status: "pending",
      attachmentUrl: "blob:preview",
    };
    const server = {
      id: "srv-1",
      client_message_id: "cli-1",
      body: "hi",
      created_at: "2026-09-05T12:00:00.000Z",
    };

    const merged = mergeMessagesById([pending], [server]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("srv-1");
    expect(merged[0].client_message_id).toBe("cli-1");
    expect(merged[0].send_status).toBeUndefined();
    expect(merged[0].attachmentUrl).toBe("blob:preview");
  });

  it("does not duplicate when Realtime and send resolve out of order", () => {
    const pending = {
      id: "cli-2",
      client_message_id: "cli-2",
      body: "burst",
      created_at: "2026-09-05T12:01:00.000Z",
      send_status: "pending",
    };
    const realtime = {
      id: "srv-2",
      client_message_id: "cli-2",
      body: "burst",
      created_at: "2026-09-05T12:01:00.000Z",
    };
    const send = { ...realtime, sender_profile: { name: "You" } };

    const merged = mergeMessagesById([pending], [realtime, send]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("srv-2");
    expect(merged[0].sender_profile).toEqual({ name: "You" });
  });

  it("keeps a failed status until a server row arrives", () => {
    const failed = {
      id: "cli-3",
      client_message_id: "cli-3",
      body: "nope",
      created_at: "2026-09-05T12:02:00.000Z",
      send_status: "failed",
    };
    const stillLocal = mergeMessagesById([], [failed]);
    expect(stillLocal[0].send_status).toBe("failed");
  });
});

describe("chronologicalMessages", () => {
  it("dedupes by client_message_id across mixed ids", () => {
    const rows = [
      { id: "srv", client_message_id: "cli", created_at: "2026-09-05T12:00:00.000Z", body: "server" },
      { id: "cli", client_message_id: "cli", created_at: "2026-09-05T12:00:00.000Z", body: "pending" },
    ];
    const ordered = chronologicalMessages(rows);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].id).toBe("srv");
  });

  it("keeps the first newest-first copy of a duplicate id", () => {
    const ordered = chronologicalMessages([
      { id: "b", created_at: "2026-08-10T10:01:00Z", body: "second" },
      { id: "b", created_at: "2026-08-10T10:01:00Z", body: "second reconciled" },
    ]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].body).toBe("second");
  });
});
