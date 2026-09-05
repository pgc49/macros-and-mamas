import { describe, expect, it } from "vitest";
import { formatInboxTimestamp, latestInboxIso } from "./inboxTimestamp";

function localDate(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min, 0);
}

const NOW = localDate(2026, 9, 5, 17, 30); // Saturday

describe("formatInboxTimestamp", () => {
  it("shows the clock time for a message from today", () => {
    const at = localDate(2026, 9, 5, 10, 51);
    expect(formatInboxTimestamp(at.toISOString(), NOW)).toBe(
      at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    );
  });

  it("labels yesterday as Yesterday", () => {
    expect(formatInboxTimestamp(localDate(2026, 9, 4, 22, 10).toISOString(), NOW)).toBe("Yesterday");
  });

  it("uses the weekday for the rest of the last six days", () => {
    expect(formatInboxTimestamp(localDate(2026, 9, 3, 9, 0).toISOString(), NOW)).toBe("Thursday");
    expect(formatInboxTimestamp(localDate(2026, 8, 30, 9, 0).toISOString(), NOW)).toBe("Sunday");
  });

  it("uses a numeric date once the message is a week old or older", () => {
    const weekOld = localDate(2026, 8, 29, 10, 0);
    expect(formatInboxTimestamp(weekOld.toISOString(), NOW)).toBe(
      weekOld.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
    );
  });

  it("returns empty for a missing or invalid stamp", () => {
    expect(formatInboxTimestamp(null, NOW)).toBe("");
    expect(formatInboxTimestamp("not-a-date", NOW)).toBe("");
  });
});

describe("latestInboxIso", () => {
  it("picks the newest valid ISO", () => {
    expect(latestInboxIso(
      "2026-09-01T12:00:00Z",
      "2026-09-05T12:00:00Z",
      "2026-09-03T12:00:00Z",
    )).toBe("2026-09-05T12:00:00Z");
  });

  it("ignores blanks", () => {
    expect(latestInboxIso(null, "", "2026-09-05T12:00:00Z")).toBe("2026-09-05T12:00:00Z");
    expect(latestInboxIso()).toBe("");
  });
});
