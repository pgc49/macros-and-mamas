// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({ user: { id: "admin-1" } }),
}));

vi.mock("../lib/push", () => ({
  syncAppBadge: () => {},
}));

vi.mock("../components/AppUpdateBanner", () => ({
  AppUpdateBanner: () => null,
}));

vi.mock("./AdminQuizFunnelCard", () => ({
  AdminQuizFunnelCard: () => <div>Quiz funnel stub</div>,
}));

vi.mock("../db/db", () => ({
  db: {
    loadAiFailures: async () => [],
    loadMessageInbox: async () => [],
  },
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: () => {},
  },
}));

import { AdminPortal } from "./AdminPortal.jsx";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function roster() {
  return [
    {
      id: "ready-1",
      role: "client",
      name: "August Ready",
      email: "aug@example.com",
      cohort_label: "2026-08",
      stage: "awaiting_approval",
      status: "pending",
      paid: true,
      hasIntake: true,
      unreadFromMama: 0,
      lastAdminAt: null,
    },
    {
      id: "quiet-1",
      role: "client",
      name: "Founding Quiet",
      email: "founding@example.com",
      cohort_label: "2026-07",
      stage: "active",
      status: "active",
      paid: true,
      hasIntake: true,
      unreadFromMama: 0,
      lastAdminAt: null,
      lastActiveDate: "2026-08-10",
      lastMealDate: "2026-08-10",
    },
    {
      id: "intake-1",
      role: "client",
      name: "Paid No Intake",
      email: "needintake@example.com",
      cohort_label: "2026-08",
      stage: "paid_awaiting_intake",
      status: "pending",
      paid: true,
      hasIntake: false,
      unreadFromMama: 0,
      lastAdminAt: null,
    },
  ];
}

describe("AdminPortal ready-to-approve interrupt", () => {
  it("shows the live count and opens that queue, not Founding quiet", () => {
    render(
      <MemoryRouter>
        <AdminPortal roster={roster()} setRoster={() => {}} adminSel={null} setAdminSel={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("1 ready to approve").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "1 ready to approve. Open this queue." }));
    expect(screen.getByText("August Ready")).toBeTruthy();
    expect(screen.queryByText("Founding Quiet")).toBeNull();
    expect(screen.queryByText("Paid No Intake")).toBeNull();
    expect(screen.getByRole("button", { name: /Ready to approve · 1/ })).toBeTruthy();
  });

  it("keeps the all-cohorts count when a leftover Founding filter is selected", () => {
    window.history.replaceState(null, "", "/admin?cohort=2026-07");
    render(
      <MemoryRouter>
        <AdminPortal roster={roster()} setRoster={() => {}} adminSel={null} setAdminSel={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "1 ready to approve. Open this queue." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 ready to approve. Open this queue." }));
    expect(screen.getByText("August Ready")).toBeTruthy();
    expect(screen.queryByText("Founding Quiet")).toBeNull();
  });
});
