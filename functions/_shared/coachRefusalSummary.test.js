import { describe, expect, it } from "vitest";

import {
  coachRefusalLine,
  escalateDoor,
  isLoggingRefusal,
  mergeRefusalSummary,
  preserveRefusalLines,
  refusalDoor,
} from "./coachRefusalSummary.js";

describe("a refusal line is factual", () => {
  it("names only a stuck or medical escalate", () => {
    expect(refusalDoor("urgent")).toBe("medical");
    expect(refusalDoor("stuck")).toBe("stuck");
    expect(refusalDoor("supply")).toBeNull();
    expect(refusalDoor("food")).toBeNull();
    expect(escalateDoor("I've been dizzy since this morning", { scope: "urgent" })).toBe("medical");
    expect(escalateDoor("should I skip dinner", { escalate: "stuck" })).toBe("stuck");
    expect(escalateDoor("will this affect my supply", { scope: "supply" })).toBeNull();
    expect(escalateDoor("I feel awful about what I ate", { scope: "urgent" })).toBeNull();
    expect(escalateDoor("what workout should I do", { scope: "off_topic" })).toBeNull();
    expect(escalateDoor("what should I eat", { escalate: "stuck" })).toBeNull();
    expect(coachRefusalLine("I've been dizzy since this morning", "medical")).toBe(
      "Coach refused (medical): I've been dizzy since this morning",
    );
    expect(coachRefusalLine("should I skip dinner", "stuck")).toBe(
      "Coach refused (stuck): should I skip dinner",
    );
  });

  it("appends onto Callie's summary and does not replace it", () => {
    const line = coachRefusalLine("I've been dizzy since this morning", "medical");
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
