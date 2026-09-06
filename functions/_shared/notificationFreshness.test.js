import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_MAX_AGE_MS,
  isMessageTooOldToNotify,
  notificationTag,
} from "./notificationFreshness.js";

describe("notification freshness", () => {
  it("allows a just-sent channel message", () => {
    const now = Date.parse("2026-09-06T17:49:00.000Z");
    expect(isMessageTooOldToNotify("2026-09-06T17:48:00.000Z", now)).toBe(false);
  });

  it("blocks yesterday's Founding Members blast from firing again", () => {
    const now = Date.parse("2026-09-06T17:49:00.000Z");
    expect(isMessageTooOldToNotify("2026-09-06T04:15:47.390Z", now)).toBe(true);
    expect(now - Date.parse("2026-09-06T04:15:47.390Z"))
      .toBeGreaterThan(NOTIFICATION_MAX_AGE_MS);
  });

  it("leaves unparseable timestamps eligible so a missing created_at cannot drop a live send", () => {
    expect(isMessageTooOldToNotify("", Date.now())).toBe(false);
    expect(isMessageTooOldToNotify(null, Date.now())).toBe(false);
  });

  it("builds a stable per-message notification tag", () => {
    expect(notificationTag("channel", "55162897-9545-4f6c-b8a6-b001d2a0e437"))
      .toBe("channel:55162897-9545-4f6c-b8a6-b001d2a0e437");
    expect(notificationTag("dm", "")).toBe("");
  });
});
