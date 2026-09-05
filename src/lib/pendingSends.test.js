import { afterEach, describe, expect, it } from "vitest";
import {
  buildPendingRow,
  clearAllPendingSends,
  findPendingByFingerprint,
  listPendingRows,
  markPendingStatus,
  reconcilePendingWithMessages,
  sendPayloadFingerprint,
  upsertPendingAttempt,
} from "./pendingSends";

afterEach(() => {
  clearAllPendingSends();
});

describe("pendingSends", () => {
  it("keeps a pending row until the server copy lands", () => {
    const row = buildPendingRow({
      clientMessageId: "cli-1",
      selfId: "mama-1",
      body: "hello",
    });
    upsertPendingAttempt("dm:mama-1", {
      id: "cli-1",
      fingerprint: sendPayloadFingerprint("hello", null, null),
      status: "pending",
      row,
    });

    expect(listPendingRows("dm:mama-1")).toHaveLength(1);

    reconcilePendingWithMessages("dm:mama-1", [{
      id: "srv-1",
      client_message_id: "cli-1",
      body: "hello",
    }]);

    expect(listPendingRows("dm:mama-1")).toEqual([]);
  });

  it("finds a failed attempt by fingerprint so remount retries the same id", () => {
    const fingerprint = sendPayloadFingerprint("same", null, null);
    upsertPendingAttempt("dm:mama-1", {
      id: "cli-9",
      fingerprint,
      status: "failed",
      row: buildPendingRow({ clientMessageId: "cli-9", selfId: "mama-1", body: "same" }),
    });

    expect(findPendingByFingerprint("dm:mama-1", fingerprint).id).toBe("cli-9");
  });

  it("marks a row failed without dropping it", () => {
    upsertPendingAttempt("channel:aug", {
      id: "cli-2",
      status: "pending",
      row: buildPendingRow({ clientMessageId: "cli-2", selfId: "mama-1", body: "x" }),
    });
    markPendingStatus("channel:aug", "cli-2", "failed");
    expect(listPendingRows("channel:aug")[0].send_status).toBe("failed");
  });
});
