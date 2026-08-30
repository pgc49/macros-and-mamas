import { describe, expect, it } from "vitest";
import { bubbleTextSelect, hasSelectableText } from "./messageSelect.js";

describe("bubbleTextSelect", () => {
  it("allows copy on live bubbles for admin and sender", () => {
    expect(bubbleTextSelect(false)).toBe("text");
    expect(bubbleTextSelect(null)).toBe("text");
  });

  it("does not invite selection on a deleted placeholder", () => {
    expect(bubbleTextSelect(true)).toBe("none");
    expect(bubbleTextSelect("2026-08-30T12:00:00.000Z")).toBe("none");
  });
});

describe("hasSelectableText", () => {
  it("treats a non-empty selection as a copy gesture", () => {
    expect(hasSelectableText("https://youtu.be/EDjE15Ktzcs")).toBe(true);
    expect(hasSelectableText({ toString: () => "copied" })).toBe(true);
  });

  it("ignores an empty caret", () => {
    expect(hasSelectableText("")).toBe(false);
    expect(hasSelectableText("   ")).toBe(false);
    expect(hasSelectableText(null)).toBe(false);
  });
});
