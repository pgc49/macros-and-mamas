// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("../lib/push", () => ({
  enablePushNotifications: vi.fn(),
  isStandaloneDisplay: () => false,
  notificationPermission: () => "default",
  pushSupported: () => true,
}));

import { NotificationsTip } from "./NotificationsTip";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("NotificationsTip", () => {
  it("shows instructions for Cohort 2", () => {
    const view = render(<NotificationsTip cohortLabel="2026-08" />);
    expect(view.getByRole("heading", { name: "Turn on notifications" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Turn on notifications" })).toBeTruthy();
  });

  it("does not show for Founding", () => {
    const view = render(<NotificationsTip cohortLabel="2026-07" />);
    expect(view.queryByText("Turn on notifications")).toBeNull();
  });

  it("forceVisible previews the card without writing dismiss storage", () => {
    localStorage.setItem("mm_notifications_tip_dismissed", "1");
    const view = render(<NotificationsTip cohortLabel="2026-07" forceVisible />);
    expect(view.getByRole("heading", { name: "Turn on notifications" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Got it" }));
    expect(localStorage.getItem("mm_notifications_tip_dismissed")).toBe("1");
    expect(view.queryByRole("heading", { name: "Turn on notifications" })).toBeNull();
  });
});
