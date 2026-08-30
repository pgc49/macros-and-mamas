import { describe, expect, it } from "vitest";
import {
  moreViewFromQuery,
  peopleSegmentFromQuery,
  primaryTabFromQuery,
  queryTabFor,
} from "./adminNav.js";

describe("adminNav", () => {
  it("maps legacy tabs onto the four primary destinations", () => {
    expect(primaryTabFromQuery("overview")).toBe("home");
    expect(primaryTabFromQuery("clients")).toBe("people");
    expect(primaryTabFromQuery("leads")).toBe("people");
    expect(primaryTabFromQuery("emails")).toBe("more");
    expect(primaryTabFromQuery("messages")).toBe("messages");
  });

  it("preserves leads / clients deep links on People", () => {
    expect(peopleSegmentFromQuery("leads")).toBe("leads");
    expect(peopleSegmentFromQuery("clients")).toBe("clients");
    expect(peopleSegmentFromQuery("overview")).toBe("needs_action");
  });

  it("writes a legacy-compatible query tab", () => {
    expect(queryTabFor("people", { peopleSegment: "leads" })).toBe("leads");
    expect(queryTabFor("more", { moreView: "emails" })).toBe("emails");
    expect(queryTabFor("home")).toBe("home");
  });

  it("opens More subviews from the old tab names", () => {
    expect(moreViewFromQuery("announcements")).toBe("announcements");
    expect(moreViewFromQuery("credits")).toBe("credits");
    expect(moreViewFromQuery("more")).toBe("menu");
  });
});
