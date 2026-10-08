import { describe, expect, it } from "vitest";

import { COACH_BUSY_LINE } from "../../src/content/coachVoice.js";
import { messageForKind } from "./openrouter.js";

describe("messageForKind", () => {
  it("keeps estimate copy when no Coach override is passed", () => {
    expect(messageForKind("credits")).toMatch(/AI helper/);
    expect(messageForKind("credits")).toMatch(/Callie has been notified/);
  });

  it("uses the Coach busy line when coach.js passes unavailableLine", () => {
    expect(messageForKind("credits", { unavailableLine: COACH_BUSY_LINE })).toBe(COACH_BUSY_LINE);
    expect(messageForKind("auth", { unavailableLine: COACH_BUSY_LINE })).toBe(COACH_BUSY_LINE);
    expect(messageForKind("credits", { unavailableLine: COACH_BUSY_LINE })).not.toMatch(/\bAI\b|Callie has been notified/);
  });
});
