import { describe, expect, it } from "vitest";

import {
  coachRefusalLine,
  isLoggingRefusal,
  mergeRefusalSummary,
  preserveRefusalLines,
  refusalDoor,
} from "./coachRefusalSummary.js";

describe("a refusal line is factual", () => {
  it("names the door and the question", () => {
    expect(refusalDoor("weight")).toBe("scale");
    expect(refusalDoor("urgent")).toBe("medical");
    expect(refusalDoor("supply")).toBe("supply");
    expect(refusalDoor("food")).toBeNull();
    expect(coachRefusalLine("will this affect my supply", "supply")).toBe(
      "Coach refused (supply): will this affect my supply",
    );
  });

  it("appends onto Callie's summary and does not replace it", () => {
    const line = coachRefusalLine("the scale went up", "scale");
    const merged = mergeRefusalSummary("Quiet week. Protein is steady.", line);
    expect(merged.startsWith("Quiet week. Protein is steady.")).toBe(true);
    expect(merged).toContain(line);
    expect(mergeRefusalSummary(merged, line)).toBe(merged);
  });

  it("keeps the refusal line when a new summary is generated", () => {
    const existing = "Quiet week.\nCoach refused (supply): my supply dipped";
    const fresh = preserveRefusalLines(existing, "New snapshot from her logs.");
    expect(fresh.startsWith("New snapshot from her logs.")).toBe(true);
    expect(fresh).toContain("Coach refused (supply): my supply dipped");
  });

  it("does not treat a logging refusal as a card for Callie", () => {
    expect(isLoggingRefusal("I won't log this")).toBe(true);
    expect(isLoggingRefusal("I will not log dinner")).toBe(true);
    expect(isLoggingRefusal("should I skip dinner")).toBe(true);
    expect(isLoggingRefusal("will this affect my milk supply")).toBe(false);
    expect(isLoggingRefusal("I've been dizzy since this morning")).toBe(false);
  });
});
