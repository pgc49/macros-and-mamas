// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminClientRoster, ReadyToApproveBanner } from "./AdminClientRoster.jsx";

afterEach(() => {
  cleanup();
});

function renderRoster(over = {}) {
  const clients = over.roster || [
    {
      id: "unpaid-1",
      role: "client",
      name: "New signup",
      firstName: "Test Patrick",
      email: "pgchammas+demo@gmail.com",
      phone: "",
      stage: "signed_up",
      status: "pending",
      paid: false,
      hasIntake: false,
      unreadFromMama: 0,
      lastAdminAt: null,
      createdAt: "2026-08-18T03:00:00.000Z",
    },
    {
      id: "active-1",
      role: "client",
      name: "Lauren Wells",
      email: "lauren@example.com",
      phone: "555-0199",
      stage: "active",
      status: "active",
      week: 3,
      paid: true,
      hasIntake: true,
      unreadFromMama: 1,
      lastAdminAt: "2026-08-16T12:00:00.000Z",
      lastActiveDate: "2026-08-18",
    },
  ];
  const props = {
    roster: clients,
    filter: "unpaid",
    setFilter: () => {},
    onOpenClient: () => {},
    onMessageClient: () => {},
    nowMs: Date.parse("2026-08-18T15:00:00.000Z"),
    todayIso: "2026-08-18",
    ...over,
  };
  return render(<AdminClientRoster {...props} />);
}

describe("AdminClientRoster", () => {
  it("shows first name and email for unpaid signups instead of New signup", () => {
    renderRoster();
    expect(screen.getByText("Test Patrick")).toBeTruthy();
    expect(screen.getByText("pgchammas+demo@gmail.com")).toBeTruthy();
    expect(screen.queryByText("New signup")).toBeNull();
    expect(screen.getByText("Never messaged")).toBeTruthy();
  });

  it("shows a Comp chip on complimentary roster rows", () => {
    renderRoster({
      filter: "all",
      roster: [
        {
          id: "comp-1",
          role: "client",
          name: "Comp Mama",
          email: "comp@example.com",
          stage: "active",
          status: "active",
          paid: true,
          comp: true,
          hasIntake: true,
          unreadFromMama: 0,
          lastAdminAt: null,
        },
      ],
    });
    expect(screen.getByText("Comp Mama")).toBeTruthy();
    expect(screen.getByText("Comp")).toBeTruthy();
  });

  it("shows a quiet via hint when a mama was referred", () => {
    renderRoster({
      filter: "all",
      roster: [
        {
          id: "ref-1",
          role: "client",
          name: "Paid Mama",
          email: "paid@example.com",
          stage: "paid_awaiting_intake",
          status: "pending",
          paid: true,
          hasIntake: false,
          unreadFromMama: 0,
          lastAdminAt: null,
          referredBy: { advocateName: "Ava Stone", code: "AVA25" },
        },
      ],
    });
    expect(screen.getByText("via Ava Stone")).toBeTruthy();
    expect(screen.queryByText(/Referred by/)).toBeNull();
  });

  it("omits a referred-by hint when there is no referral", () => {
    renderRoster({ filter: "all" });
    expect(screen.queryByText(/^via /)).toBeNull();
  });

  it("shows last messaged and a message shortcut on active rows", () => {
    const onMessageClient = () => {};
    renderRoster({ filter: "active", onMessageClient });
    expect(screen.getByText("Lauren Wells")).toBeTruthy();
    expect(screen.getByText(/You messaged · 2d ago/)).toBeTruthy();
    expect(screen.getByLabelText("Message Lauren Wells")).toBeTruthy();
  });

  it("says Active is alphabetical and Needs you is urgency-first", () => {
    renderRoster({ filter: "active" });
    expect(screen.getByText(/Alphabetical/)).toBeTruthy();
    expect(screen.queryByText(/Waiting on you first/)).toBeNull();
    cleanup();
    renderRoster({ filter: "needs_you" });
    expect(screen.getByText(/Waiting on you first, then oldest message/)).toBeTruthy();
    expect(screen.queryByText(/Alphabetical/)).toBeNull();
    cleanup();
    renderRoster({ filter: "unpaid" });
    expect(screen.getByText(/Newest signups first/)).toBeTruthy();
  });

  it("filters the list from the search field", () => {
    renderRoster({ filter: "all" });
    fireEvent.change(screen.getByLabelText("Search name, email, or phone"), {
      target: { value: "lauren@" },
    });
    expect(screen.getByText("Lauren Wells")).toBeTruthy();
    expect(screen.queryByText("Test Patrick")).toBeNull();
  });

  it("can switch between Founding and Cohort 2", () => {
    const setCohort = () => {};
    renderRoster({
      filter: "all",
      cohort: "all",
      setCohort,
      roster: [
        {
          id: "f",
          role: "client",
          name: "Ava Founding",
          email: "ava@example.com",
          cohort_label: "2026-07",
          stage: "active",
          status: "active",
          paid: true,
        },
        {
          id: "c2",
          role: "client",
          name: "Dolly Chammas",
          email: "dollychammas@gmail.com",
          cohort_label: "2026-08",
          stage: "paid_awaiting_intake",
          status: "pending",
          paid: true,
        },
      ],
    });
    expect(screen.getByRole("button", { name: "All groups" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Founding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cohort 2" })).toBeTruthy();
    expect(screen.getByText("Ava Founding")).toBeTruthy();
    expect(screen.getByText("Dolly Chammas")).toBeTruthy();
    cleanup();
    renderRoster({
      filter: "all",
      cohort: "2026-08",
      setCohort,
      roster: [
        {
          id: "f",
          role: "client",
          name: "Ava Founding",
          email: "ava@example.com",
          cohort_label: "2026-07",
          stage: "active",
          status: "active",
          paid: true,
        },
        {
          id: "c2",
          role: "client",
          name: "Dolly Chammas",
          email: "dollychammas@gmail.com",
          cohort_label: "2026-08",
          stage: "paid_awaiting_intake",
          status: "pending",
          paid: true,
        },
      ],
    });
    expect(screen.getByText("Dolly Chammas")).toBeTruthy();
    expect(screen.queryByText("Ava Founding")).toBeNull();
  });

  it("filters Ready to approve to paid + intake, not Founding quiet or paid-no-intake", () => {
    const setFilter = () => {};
    renderRoster({
      filter: "awaiting_approval",
      setFilter,
      roster: [
        {
          id: "ready",
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
          id: "quiet",
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
        },
        {
          id: "intake",
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
      ],
    });
    expect(screen.getByText("August Ready")).toBeTruthy();
    expect(screen.queryByText("Founding Quiet")).toBeNull();
    expect(screen.queryByText("Paid No Intake")).toBeNull();
    expect(screen.getByRole("button", { name: /Ready to approve · 1/ })).toBeTruthy();
    expect(screen.getByText(/Paid, intake in — waiting on your approve tap/)).toBeTruthy();
  });
});

describe("ReadyToApproveBanner", () => {
  it("shows the live count and opens the queue on click", () => {
    let opened = false;
    const { rerender } = render(<ReadyToApproveBanner count={21} onOpen={() => { opened = true; }} />);
    expect(screen.getByText("21 ready to approve")).toBeTruthy();
    expect(screen.getByText(/Paid and intake in — waiting on your tap/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "21 ready to approve. Open this queue." }));
    expect(opened).toBe(true);
    rerender(<ReadyToApproveBanner count={0} onOpen={() => {}} />);
    expect(screen.queryByText(/ready to approve/)).toBeNull();
  });
});
