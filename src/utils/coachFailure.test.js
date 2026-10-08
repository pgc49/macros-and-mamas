import { describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/react", () => ({
  captureMessage: (...args) => captureMessage(...args),
}));

import { COACH_FAILURE, captureCoachFailure } from "./coachFailure.js";

describe("captureCoachFailure", () => {
  it("sends a text-free beacon", () => {
    captureCoachFailure({ kind: "note", status: 502 });
    expect(captureMessage).toHaveBeenCalledWith(COACH_FAILURE, {
      level: "warning",
      tags: { surface: "coach", kind: "note" },
      extra: { status: "502" },
      fingerprint: [COACH_FAILURE, "note"],
    });
  });
});
