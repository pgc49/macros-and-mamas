// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminBottomNav } from "./AdminBottomNav";

afterEach(() => {
  cleanup();
});

describe("AdminBottomNav", () => {
  it("matches the mama tab bar so safe-area is not double-counted", () => {
    render(<AdminBottomNav tab="messages" setTab={() => {}} unreadMessages={12} />);
    const nav = screen.getByRole("navigation", { name: "Admin" });
    expect(nav.style.padding).toBe("12px 12px 4px");
    expect(nav.getAttribute("style") || "").not.toMatch(/safe-area/);
    expect(nav.style.borderTop).toBe("");
    expect(screen.getByRole("button", { name: /Messages/ }).style.minHeight).toBe("48px");
    expect(screen.getByText("9+")).toBeTruthy();
  });
});
