// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("./AdminVoiceDropCard", () => ({
  AdminVoiceDropCard: () => <div>Voice drop</div>,
}));

import { AdminHome } from "./AdminHome.jsx";

afterEach(() => {
  cleanup();
});

const mama = (over = {}) => ({
  id: over.id || "c1",
  role: "client",
  name: "",
  firstName: "",
  lastName: "",
  email: "mama@example.com",
  paid: true,
  unreadFromMama: 0,
  lastActiveDate: null,
  ...over,
});

function renderHome(over = {}) {
  const props = {
    people: [],
    roster: [],
    onOpenLead: () => {},
    onOpenLeads: () => {},
    onOpenClients: () => {},
    ...over,
  };
  return render(
    <MemoryRouter>
      <AdminHome {...props} />
    </MemoryRouter>,
  );
}

describe("AdminHome intake queues", () => {
  it("lists need-approval and need-intake names, not only counts", () => {
    renderHome({
      roster: [
        mama({
          id: "approve",
          name: "Summer",
          stage: "awaiting_approval",
          status: "pending",
          hasIntake: true,
        }),
        mama({
          id: "intake",
          name: "Dolly",
          stage: "paid_awaiting_intake",
          status: "pending",
          hasIntake: false,
        }),
        mama({
          id: "active",
          name: "Erika",
          stage: "active",
          status: "active",
          hasIntake: true,
          lastActiveDate: "2026-08-30",
        }),
      ],
    });
    expect(screen.getByRole("button", { name: "Need approval · 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Need intake · 1" })).toBeTruthy();
    expect(screen.getByText("Summer")).toBeTruthy();
    expect(screen.getByText("Dolly")).toBeTruthy();
    expect(screen.queryByText("Erika")).toBeNull();
    expect(screen.queryByText("Nobody waiting on intake or your Approve tap.")).toBeNull();
  });

  it("opens People with the matching filter when a queue is tapped", () => {
    const onOpenClients = vi.fn();
    renderHome({
      onOpenClients,
      roster: [
        mama({
          id: "approve",
          name: "Summer",
          stage: "awaiting_approval",
          status: "pending",
          hasIntake: true,
        }),
        mama({
          id: "intake",
          name: "Rachel",
          paid: true,
          stage: "signed_up",
          status: "pending",
          hasIntake: false,
          macros: null,
        }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Need approval · 1" }));
    expect(onOpenClients).toHaveBeenCalledWith("awaiting_approval", "all");
    fireEvent.click(screen.getByRole("button", { name: "Need intake · 1" }));
    expect(onOpenClients).toHaveBeenCalledWith("awaiting_intake", "all");
  });

  it("shows an empty state when nobody needs intake or approval", () => {
    renderHome({
      roster: [
        mama({
          id: "active",
          name: "Erika",
          stage: "active",
          status: "active",
          hasIntake: true,
          lastActiveDate: "2026-08-30",
        }),
      ],
    });
    expect(screen.getByRole("button", { name: "Need approval · 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Need intake · 0" })).toBeTruthy();
    expect(screen.getByText("Nobody waiting on intake or your Approve tap.")).toBeTruthy();
    expect(screen.queryByText("Erika")).toBeNull();
  });
});
