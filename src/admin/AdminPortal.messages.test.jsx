// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { dbMock, realtimeChannel } = vi.hoisted(() => {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return {
    realtimeChannel: channel,
    dbMock: {
      loadMessageInbox: vi.fn(async () => []),
      loadPersonOverrides: vi.fn(async () => []),
      loadLatestEmailEventsByEmails: vi.fn(async () => ({})),
      loadUnsubscribedEmailSet: vi.fn(async () => new Set()),
      loadAiFailures: vi.fn(async () => []),
      recordAdminTouch: vi.fn(async () => {}),
    },
  };
});

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { id: "admin-1", email: "calista@nourishwithcalista.com" },
    profile: { name: "Callie" },
    isAdmin: true,
  }),
}));

vi.mock("../db/db", () => ({
  db: dbMock,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
}));

vi.mock("../lib/push", () => ({
  syncAppBadge: vi.fn(),
}));

vi.mock("./quizLeads", () => ({
  loadQuizLeads: vi.fn(async () => []),
}));

vi.mock("./AdminMessages", () => ({
  AdminMessages: ({ onComposerFocusChange }) => (
    <div data-admin-messages>
      <textarea
        placeholder="Write a message…"
        onFocus={() => onComposerFocusChange?.(true)}
        onBlur={() => onComposerFocusChange?.(false)}
      />
    </div>
  ),
}));

vi.mock("./AdminHome", () => ({ AdminHome: () => <div>Home queue</div> }));
vi.mock("./AdminPeople", () => ({ AdminPeople: () => <div>People list</div> }));
vi.mock("./AdminMore", () => ({ AdminMore: () => <div>More menu</div> }));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

import { AdminPortal } from "./AdminPortal";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/admin?tab=messages");
});

function renderPortal() {
  return render(
    <MemoryRouter>
      <AdminPortal
        roster={[]}
        setRoster={() => {}}
        stats={{}}
        adminSel={null}
        setAdminSel={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("AdminPortal Messages chrome", () => {
  it("locks page scroll and pins the composer above the tab bar", () => {
    const view = renderPortal();
    const content = view.container.querySelector("[data-shell-content]");
    expect(content.getAttribute("data-lock-scroll")).toBe("true");
    expect(content.style.overflowY).toBe("auto");
    expect(view.container.querySelector("[data-shell-fill]")).toBeTruthy();
    expect(view.container.querySelector("[data-admin-messages-slot]")).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a message…")).toBeTruthy();
    expect(screen.queryByText("Callie admin")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Admin" })).toBeTruthy();
  });

  it("hides the admin tab bar while the composer is focused", () => {
    renderPortal();
    fireEvent.focus(screen.getByPlaceholderText("Write a message…"));
    expect(screen.queryByRole("navigation", { name: "Admin" })).toBeNull();
  });
});
