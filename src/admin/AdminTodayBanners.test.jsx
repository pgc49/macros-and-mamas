// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "callie@example.com" },
    profile: { name: "Callie" },
    isAdmin: true,
  }),
}));

import { AdminTodayBanners } from "./AdminTodayBanners";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("AdminTodayBanners", () => {
  it("previews every Today card and says pin-to-home-screen is automatic", () => {
    render(
      <MemoryRouter>
        <AdminTodayBanners />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Today banners" })).toBeTruthy();
    expect(screen.getByText("Pin to home screen")).toBeTruthy();
    expect(screen.getByText(/this is the main first-week card/i)).toBeTruthy();
    expect(screen.getByText("You’re up to date / What’s new")).toBeTruthy();
    expect(screen.getByText("Put Macros and Mamas on your home screen")).toBeTruthy();
    expect(screen.getAllByText("Turn on notifications").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Monday voice drop").length).toBeGreaterThan(0);
    expect(screen.getAllByText("App update ready").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-banner-catalog]")).toHaveLength(5);
  });

  it("preview Got it does not persist pin-to-home-screen or What’s new dismiss keys", () => {
    render(
      <MemoryRouter>
        <AdminTodayBanners />
      </MemoryRouter>,
    );
    const pin = document.querySelector("[data-banner-catalog='homescreen']");
    const pinGotIt = [...pin.querySelectorAll("button")].find((b) => b.textContent === "Got it");
    fireEvent.click(pinGotIt);
    expect(localStorage.getItem("mm_homescreen_tip_dismissed")).toBeNull();

    const notes = document.querySelector("[data-banner-catalog='whatsNew']");
    const notesGotIt = [...notes.querySelectorAll("button")].find((b) => b.textContent === "Got it");
    fireEvent.click(notesGotIt);
    expect(localStorage.getItem("mm_release_notes_seen")).toBeNull();
  });
});
