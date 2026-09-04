import { describe, expect, it } from "vitest";
import { logSaveSucceeded } from "./logSave";

describe("logSaveSucceeded", () => {
  it("accepts only explicit true so a missing return cannot look saved", () => {
    expect(logSaveSucceeded(true)).toBe(true);
    expect(logSaveSucceeded(false)).toBe(false);
    expect(logSaveSucceeded(undefined)).toBe(false);
    expect(logSaveSucceeded(null)).toBe(false);
    expect(logSaveSucceeded({ id: "row" })).toBe(false);
  });
});
