// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { tabFromSearch, writeClientTab } from "./clientTab.js";

describe("tabFromSearch", () => {
  it("reads a known tab and falls back to today", () => {
    expect(tabFromSearch("?tab=meals")).toBe("meals");
    expect(tabFromSearch("?tab=today")).toBe("today");
    expect(tabFromSearch("?from=quiz")).toBe("today");
    expect(tabFromSearch("")).toBe("today");
  });
});

describe("writeClientTab", () => {
  it("sets tab without dropping other params", () => {
    window.history.replaceState({}, "", "/dashboard?from=quiz&tab=today");
    writeClientTab("meals");
    expect(window.location.search).toContain("tab=meals");
    expect(window.location.search).toContain("from=quiz");
    writeClientTab("today");
    expect(window.location.search).toContain("tab=today");
    expect(window.location.search).toContain("from=quiz");
  });
});
