// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminClientRoster } from "./AdminClientRoster.jsx";

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
      email: "testpatrick@example.com",
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
    expect(screen.getByText("testpatrick@example.com")).toBeTruthy();
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
    expect(screen.getByText(/Last logged · Today/)).toBeTruthy();
    expect(screen.getByLabelText("Message Lauren Wells")).toBeTruthy();
    const textLink = screen.getByRole("link", { name: "Text Lauren Wells in Messages" });
    expect(textLink.getAttribute("href")).toBe("sms:5550199");
    expect(textLink.textContent).toBe("Text");
    expect(screen.queryByText("555-0199")).toBeNull();
  });

  it("says Active is alphabetical and Needs help is urgency-first", () => {
    renderRoster({ filter: "active" });
    expect(screen.getByText(/Alphabetical/)).toBeTruthy();
    expect(screen.queryByText(/Waiting on you first/)).toBeNull();
    cleanup();
    renderRoster({ filter: "needs_help" });
    expect(screen.getByText(/Unread and approvals stay until you handle them/)).toBeTruthy();
    expect(screen.queryByText(/Alphabetical/)).toBeNull();
    cleanup();
    renderRoster({ filter: "unpaid" });
    expect(screen.getByText(/Newest signups first/)).toBeTruthy();
  });

  it("lets her sort by last messaged and open Needs a note", () => {
    const roster = [
      {
        id: "due-1",
        role: "client",
        name: "Bea Due",
        email: "bea@example.com",
        stage: "active",
        status: "active",
        paid: true,
        unreadFromMama: 0,
        lastActiveDate: "2026-08-18",
        lastAdminAt: "2026-08-01T12:00:00.000Z",
      },
      {
        id: "fresh-1",
        role: "client",
        name: "Ava Fresh",
        email: "ava@example.com",
        stage: "active",
        status: "active",
        paid: true,
        unreadFromMama: 0,
        lastActiveDate: "2026-08-18",
        lastAdminAt: "2026-08-17T12:00:00.000Z",
      },
    ];
    function Harness() {
      const [filter, setFilter] = useState("active");
      return (
        <AdminClientRoster
          roster={roster}
          filter={filter}
          setFilter={setFilter}
          onOpenClient={() => {}}
          onMessageClient={() => {}}
          nowMs={Date.parse("2026-08-18T15:00:00.000Z")}
          todayIso="2026-08-18"
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Needs a note · 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last messaged" }));
    expect(screen.getByText(/weekly touch-base/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Oldest first" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Needs a note · 1" }));
    expect(screen.getByText("Bea Due")).toBeTruthy();
    expect(screen.queryByText("Ava Fresh")).toBeNull();
  });

  it("offers Not today on quiet Needs help cards, not unread", () => {
    renderRoster({
      filter: "needs_help",
      todayIso: "2026-08-18",
      nowMs: Date.parse("2026-08-18T15:00:00.000Z"),
      roster: [
        {
          id: "quiet-1",
          role: "client",
          name: "Bea Quiet",
          email: "bea@example.com",
          stage: "active",
          status: "active",
          paid: true,
          unreadFromMama: 0,
          lastActiveDate: "2026-08-10",
          lastAdminAt: null,
        },
        {
          id: "unread-1",
          role: "client",
          name: "Ava Unread",
          email: "ava@example.com",
          stage: "active",
          status: "active",
          paid: true,
          unreadFromMama: 2,
          lastActiveDate: "2026-08-18",
        },
      ],
    });
    expect(screen.getByLabelText("Not today for Bea Quiet")).toBeTruthy();
    expect(screen.queryByLabelText("Not today for Ava Unread")).toBeNull();
    expect(screen.getByText("Quiet")).toBeTruthy();
  });

  it("lists passed quiet under Passed until tonight", () => {
    renderRoster({
      filter: "needs_help",
      todayIso: "2026-08-18",
      nowMs: Date.parse("2026-08-18T15:00:00.000Z"),
      roster: [
        {
          id: "quiet-1",
          role: "client",
          name: "Bea Quiet",
          email: "bea@example.com",
          stage: "active",
          status: "active",
          paid: true,
          unreadFromMama: 0,
          lastActiveDate: "2026-08-10",
          snoozedUntil: "2026-08-19T06:00:00.000Z",
        },
      ],
    });
    expect(screen.getByText(/Passed until tonight/)).toBeTruthy();
    expect(screen.getByText(/Queue is clear/)).toBeTruthy();
    expect(screen.getByLabelText("Put Bea Quiet back on the board")).toBeTruthy();
  });

  it("hides QA plus-address cards from Unpaid and still shows Dolly on Need intake", () => {
    const roster = [
      {
        id: "qa-quiz",
        role: "client",
        name: "QA Quiz",
        email: "pgchammas+qa-quiz@gmail.com",
        stage: "signed_up",
        status: "pending",
        paid: false,
        hasIntake: false,
        unreadFromMama: 0,
        lastAdminAt: null,
        createdAt: "2026-08-18T12:00:00.000Z",
      },
      {
        id: "qa-hold",
        role: "client",
        name: "QA Hold",
        email: "pgchammas+hold322a@gmail.com",
        stage: "signed_up",
        status: "pending",
        paid: false,
        hasIntake: false,
        unreadFromMama: 0,
        lastAdminAt: null,
        createdAt: "2026-08-18T11:00:00.000Z",
      },
      {
        id: "patrick",
        role: "client",
        name: "Patrick",
        email: "pgchammas@gmail.com",
        stage: "signed_up",
        status: "pending",
        paid: false,
        hasIntake: false,
        unreadFromMama: 0,
        lastAdminAt: null,
        createdAt: "2026-08-17T00:00:00.000Z",
      },
      {
        id: "intake-1",
        role: "client",
        name: "Dolly",
        email: "dollychammas@gmail.com",
        stage: "paid_awaiting_intake",
        status: "pending",
        paid: true,
        hasIntake: false,
        unreadFromMama: 0,
        lastAdminAt: null,
      },
    ];
    function Harness({ start }) {
      const [filter, setFilter] = useState(start);
      return (
        <AdminClientRoster
          roster={roster}
          filter={filter}
          setFilter={setFilter}
          onOpenClient={() => {}}
          onMessageClient={() => {}}
          nowMs={Date.parse("2026-08-18T15:00:00.000Z")}
          todayIso="2026-08-18"
        />
      );
    }
    render(<Harness start="unpaid" />);
    expect(screen.getByText("Patrick")).toBeTruthy();
    expect(screen.getByText("pgchammas@gmail.com")).toBeTruthy();
    expect(screen.getByText(/Newest signups first/)).toBeTruthy();
    expect(screen.queryByText("QA Quiz")).toBeNull();
    expect(screen.queryByText("QA Hold")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Need intake/ }));
    expect(screen.getByText("Dolly")).toBeTruthy();
    expect(screen.queryByText("Patrick")).toBeNull();
  });

  it("filters Need intake and Approve from the same chips Home deep-links to", () => {
    const roster = [
      {
        id: "approve-1",
        role: "client",
        name: "Summer",
        email: "summer@example.com",
        stage: "awaiting_approval",
        status: "pending",
        paid: true,
        hasIntake: true,
        unreadFromMama: 0,
        lastAdminAt: null,
      },
      {
        id: "intake-1",
        role: "client",
        name: "Dolly",
        email: "dolly@example.com",
        stage: "paid_awaiting_intake",
        status: "pending",
        paid: true,
        hasIntake: false,
        unreadFromMama: 0,
        lastAdminAt: null,
      },
      {
        id: "active-1",
        role: "client",
        name: "Erika",
        email: "erika@example.com",
        stage: "active",
        status: "active",
        paid: true,
        hasIntake: true,
        unreadFromMama: 0,
        lastAdminAt: null,
        lastActiveDate: "2026-08-18",
      },
    ];
    function Harness({ start }) {
      const [filter, setFilter] = useState(start);
      return (
        <AdminClientRoster
          roster={roster}
          filter={filter}
          setFilter={setFilter}
          onOpenClient={() => {}}
          onMessageClient={() => {}}
          nowMs={Date.parse("2026-08-18T15:00:00.000Z")}
          todayIso="2026-08-18"
        />
      );
    }
    render(<Harness start="awaiting_approval" />);
    expect(screen.getByText("Summer")).toBeTruthy();
    expect(screen.queryByText("Dolly")).toBeNull();
    expect(screen.queryByText("Erika")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Need intake/ }));
    expect(screen.getByText("Dolly")).toBeTruthy();
    expect(screen.queryByText("Summer")).toBeNull();
    expect(screen.queryByText("Erika")).toBeNull();
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
});
