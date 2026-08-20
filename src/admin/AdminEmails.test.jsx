// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    loadRecentEmailEvents: vi.fn(),
    loadCohortWaitlist: vi.fn(),
  },
}));

vi.mock("../db/db", () => ({
  db: dbMock,
}));

import { AdminEmails } from "./AdminEmails.jsx";

const MEGAN = "11111111-1111-4111-8111-111111111111";

const events = [
  {
    id: "evt-1",
    profile_id: MEGAN,
    email_type: "welcome",
    to_email: "megan@example.com",
    subject: "You're in, mama",
    status: "sent",
    created_at: "2026-08-18T12:00:00.000Z",
    profiles: { name: "Megan", last_name: "Wells", email: "megan@example.com" },
  },
  {
    id: "evt-2",
    profile_id: null,
    email_type: "quiz_drip_2d",
    to_email: "lead@example.com",
    subject: "the numbers are the easy part",
    status: "sent",
    created_at: "2026-08-17T12:00:00.000Z",
  },
];

const waitlist = [
  {
    id: "wl-1",
    first_name: "Waitlist",
    last_name: "Mama",
    email: "waitlist@example.com",
    created_at: "2026-08-10T12:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

beforeEach(() => {
  dbMock.loadRecentEmailEvents.mockReset();
  dbMock.loadCohortWaitlist.mockReset();
  dbMock.loadRecentEmailEvents.mockResolvedValue(events);
  dbMock.loadCohortWaitlist.mockResolvedValue(waitlist);
});

describe("AdminEmails", () => {
  it("opens on the send log and keeps templates off that view", async () => {
    render(<AdminEmails roster={[{ id: MEGAN, name: "Megan" }]} />);

    expect(screen.getByText("Emails we actually sent. Tap a mama to open her profile.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log" }).getAttribute("aria-pressed")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    expect(screen.getByText("megan@example.com")).toBeTruthy();
    expect(screen.getByText(/Welcome · You're in, mama/)).toBeTruthy();
    expect(screen.getByText("lead@example.com")).toBeTruthy();

    expect(screen.queryByText("Quiz, no account")).toBeNull();
    expect(screen.queryByText("The ranges I sent you are a starting point.")).toBeNull();
    expect(screen.queryByText("Waitlist roster · cohort 2")).toBeNull();
    expect(screen.queryByText("waitlist@example.com")).toBeNull();
    expect(dbMock.loadCohortWaitlist).not.toHaveBeenCalled();
  });

  it("filters the log by name or type", async () => {
    render(<AdminEmails roster={[{ id: MEGAN, name: "Megan" }]} />);
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Search sent emails"), {
      target: { value: "quiz" },
    });
    expect(screen.queryByText("Megan Wells")).toBeNull();
    expect(screen.getByText("lead@example.com")).toBeTruthy();
  });

  it("opens a mama profile from the log", async () => {
    const onOpenMama = vi.fn();
    render(
      <AdminEmails
        roster={[{ id: MEGAN, name: "Megan" }]}
        onOpenMama={onOpenMama}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Megan Wells")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Megan Wells"));
    expect(onOpenMama).toHaveBeenCalledWith(MEGAN);
  });

  it("shows the journey with full template copy on Templates", async () => {
    window.history.replaceState({}, "", "?emails=templates");
    render(<AdminEmails roster={[]} />);

    expect(screen.getByText(/The path a mama walks/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Templates" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Quiz, no account · Track A")).toBeTruthy();
    expect(screen.getByText(/Plant-based gets the first email only/)).toBeTruthy();
    expect(screen.getByText("Signed up, no payment · Track B")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("Callie · Operator")).toBeTruthy();
    expect(screen.getByText(/These go to Callie, not to mamas/)).toBeTruthy();

    expect(screen.getByText("Quiz drip · day 2")).toBeTruthy();
    expect(screen.getByText(/The ranges I sent you are a starting point/)).toBeTruthy();
    expect(screen.getByText("[First name], the numbers are the easy part")).toBeTruthy();
    expect(screen.getByText("Finish joining · +1h")).toBeTruthy();
    expect(screen.getByText("Your macros are live")).toBeTruthy();
    expect(screen.queryByText("Megan Wells")).toBeNull();
    expect(screen.queryByText("Sent emails")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("Waitlist roster · cohort 2")).toBeTruthy();
    });
    expect(screen.getByText("waitlist@example.com")).toBeTruthy();
    expect(screen.getByText(/The blast itself is template W above/)).toBeTruthy();
    expect(dbMock.loadRecentEmailEvents).not.toHaveBeenCalled();
  });
});
