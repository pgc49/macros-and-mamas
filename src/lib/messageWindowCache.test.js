import { describe, expect, it } from "vitest";
import {
  evictWindowKeys,
  MESSAGE_WINDOW_ROW_CAP,
  MESSAGE_WINDOW_THREAD_CAP,
  serializeMessageWindow,
} from "./messageWindowCache";

function row(id, extra = {}) {
  return {
    id,
    body: `Message ${id}`,
    created_at: "2026-09-05T12:00:00.000Z",
    ...extra,
  };
}

describe("serializeMessageWindow", () => {
  it("drops pending rows and signed or local attachment URLs", () => {
    const out = serializeMessageWindow([
      row("a", { attachment_path: "aug/a.jpg", attachmentUrl: "https://signed.example/a" }),
      row("b", { send_status: "pending", attachmentUrl: "blob:preview" }),
      row("c", { send_status: "failed" }),
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
    expect(out[0].attachment_path).toBe("aug/a.jpg");
    expect(out[0].attachmentUrl).toBeUndefined();
  });

  it("keeps only the newest page", () => {
    const rows = Array.from({ length: MESSAGE_WINDOW_ROW_CAP + 8 }, (_, i) => row(`m-${i}`));
    const out = serializeMessageWindow(rows);
    expect(out).toHaveLength(MESSAGE_WINDOW_ROW_CAP);
    expect(out[0].id).toBe("m-8");
    expect(out[out.length - 1].id).toBe("m-47");
  });
});

describe("evictWindowKeys", () => {
  it("keeps the most recently saved threads and the one just written", () => {
    const entries = Array.from({ length: MESSAGE_WINDOW_THREAD_CAP + 3 }, (_, i) => ({
      key: `thread-${i}`,
      savedAt: i,
    }));
    const keep = evictWindowKeys(entries, { keepKey: "thread-0" });
    expect(keep.has("thread-0")).toBe(true);
    expect(keep.size).toBeLessThanOrEqual(MESSAGE_WINDOW_THREAD_CAP + 1);
    expect(keep.has("thread-14")).toBe(true);
  });
});
