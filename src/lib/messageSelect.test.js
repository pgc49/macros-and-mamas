import { describe, expect, it } from "vitest";
import {
  BUBBLE_HOLD_SELECT_CSS,
  bubbleTextSelect,
  copyableMessageBody,
  hasSelectableText,
  holdOpensMenu,
} from "./messageSelect.js";

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

describe("BUBBLE_HOLD_SELECT_CSS", () => {
  it("disables native selection on coarse pointers so a hold can open the picker", () => {
    expect(BUBBLE_HOLD_SELECT_CSS).toMatch(/pointer:\s*coarse/);
    expect(BUBBLE_HOLD_SELECT_CSS).toMatch(/user-select:\s*none/);
    expect(BUBBLE_HOLD_SELECT_CSS).toMatch(/-webkit-touch-callout:\s*none/);
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

describe("holdOpensMenu", () => {
  it("opens the picker when nothing was selected at pointer-down", () => {
    expect(holdOpensMenu("")).toBe(true);
    expect(holdOpensMenu("   ")).toBe(true);
    expect(holdOpensMenu(null)).toBe(true);
  });

  it("leaves an already-started selection alone", () => {
    expect(holdOpensMenu("https://youtu.be/abc")).toBe(false);
  });
});

describe("copyableMessageBody", () => {
  it("returns the live body including URLs and emoji", () => {
    expect(copyableMessageBody({
      body: "Good morning mamas 💕 https://youtu.be/EDjE15Ktzcs",
    })).toBe("Good morning mamas 💕 https://youtu.be/EDjE15Ktzcs");
  });

  it("does not copy a deleted placeholder", () => {
    expect(copyableMessageBody({
      body: "gone",
      deleted_at: "2026-08-30T12:00:00.000Z",
    })).toBe("");
  });
});
