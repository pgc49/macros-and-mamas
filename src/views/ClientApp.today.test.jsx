// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "pat@example.com" },
    profile: { name: "Pat" },
    isAdmin: false,
  }),
}));

vi.mock("../db/db", () => ({
  db: {
    loadCurrentVoiceDrop: vi.fn(async () => null),
    dismissHomescreenTip: vi.fn(async () => ({})),
    savePushSubscription: vi.fn(),
  },
}));

vi.mock("../components/MessagesPanel", () => ({
  MessagesPanel: () => <div data-messages-panel>messages</div>,
}));

import { ClientApp } from "./ClientApp";
import { startMembershipCheckout } from "../lib/billing";

vi.mock("../lib/billing", () => ({
  startMembershipCheckout: vi.fn(async () => ({ url: "https://checkout.stripe.test/session" })),
}));

afterEach(() => {
  cleanup();
});

function noop() {}

function clientProps(tab) {
  return {
    tab,
    setTab: noop,
    profile: { name: "Pat", homescreenTipDismissedAt: "2026-08-01T00:00:00Z", cohort_label: "2026-07" },
    macros: { protein: 120, carbs: 150, fat: 50, cal: 1700 },
    totals: { p: 0, c: 0, f: 0, cal: 0 },
    waterOz: 80,
    estimateBusy: false,
    estimate: null,
    analyzePhoto: noop,
    analyzeText: noop,
    confirmEstimate: noop,
    discardEstimate: noop,
    logManualMeal: noop,
    logRecipe: noop,
    todayLog: { date: "2026-09-04", entries: [] },
    deleteMealEntry: noop,
    updateMealEntry: noop,
    mealLogDate: "2026-09-04",
    mealLogWeekStart: "2026-09-01",
    mealLogsByDate: {},
    selectMealLogDate: noop,
    changeMealWeek: noop,
    waterLogsByDate: {},
    waterBusy: false,
    onAddWater: noop,
    onUndoWater: noop,
    onChangeBottleOz: noop,
    viewWk: "2026-09-01",
    setViewWk: noop,
    curWk: "2026-09-01",
    editPast: false,
    setEditPast: noop,
    checksByWeek: {},
    toggleCheck: noop,
    goalItems: [],
    adherenceFor: () => 0,
    progWeekNum: () => 1,
    earliestWk: "2026-09-01",
    weighins: [],
    logWeighin: noop,
    deleteWeighin: noop,
    weeklyRate: 0,
    trends: { locked: true, items: [] },
    macroHistory: [],
    mealFilter: "All meals",
    setMealFilter: noop,
    customMeals: [],
    userId: "mama-1",
  };
}

function renderClient(tab, extra = {}) {
  return render(
    <MemoryRouter>
      <ClientApp {...clientProps(tab)} {...extra} />
    </MemoryRouter>,
  );
}

describe("ClientApp Today keep-alive", () => {
  it("keeps Today mounted and inert when switching to Meals", () => {
    const view = renderClient("today");
    const panel = view.container.querySelector('[data-tab-panel="today"]');
    expect(panel).toBeTruthy();
    expect(panel.hidden).toBe(false);
    expect(screen.getByRole("heading", { name: "Hi Pat." })).toBeTruthy();

    view.rerender(
      <MemoryRouter>
        <ClientApp {...clientProps("meals")} />
      </MemoryRouter>,
    );

    const still = view.container.querySelector('[data-tab-panel="today"]');
    expect(still).toBe(panel);
    expect(still.hidden).toBe(true);
    expect(still.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("heading", { name: "Hi Pat." })).toBeNull();
    expect(screen.getByRole("heading", { name: "All meals" })).toBeTruthy();
  });

  it("does not remount Today after a Messages visit", () => {
    const setTab = vi.fn();
    const view = renderClient("today", { setTab });
    const panel = view.container.querySelector('[data-tab-panel="today"]');

    fireEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(setTab).toHaveBeenCalledWith("messages");

    view.rerender(
      <MemoryRouter>
        <ClientApp {...clientProps("messages")} setTab={setTab} />
      </MemoryRouter>,
    );
    expect(view.container.querySelector('[data-tab-panel="today"]')).toBe(panel);

    view.rerender(
      <MemoryRouter>
        <ClientApp {...clientProps("today")} setTab={setTab} />
      </MemoryRouter>,
    );
    expect(view.container.querySelector('[data-tab-panel="today"]')).toBe(panel);
    expect(view.container.querySelector('[data-tab-panel="today"]').hidden).toBe(false);
    expect(screen.getByRole("heading", { name: "Hi Pat." })).toBeTruthy();
  });
});

describe("ClientApp membership pay prompt", () => {
  it("puts Pay $49/mo on Today and pauses logging", async () => {
    renderClient("today", { membershipPaywall: true });
    expect(screen.getByRole("heading", { name: "Hi Pat." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your free month has ended" })).toBeTruthy();
    expect(screen.getByText(/Logging stays paused until membership is on/)).toBeTruthy();
    const paused = document.querySelector("[data-membership-paused='true']");
    expect(paused).toBeTruthy();
    expect(paused.hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pay $49/mo" }));
    expect(startMembershipCheckout).toHaveBeenCalledWith({ cancelPath: "/dashboard" });

    const share = screen.getByRole("link", { name: "Share my code" });
    expect(paused.contains(share)).toBe(false);
    expect(screen.getByText(/one free month of the \$49 membership/)).toBeTruthy();
  });

  it("shows the same pay step on Meals and keeps Messages closed", () => {
    const meals = renderClient("meals", { membershipPaywall: true });
    expect(screen.getByRole("heading", { name: "Your free month has ended" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay $49/mo" })).toBeTruthy();
    expect(meals.container.querySelector("[data-membership-paused='true']")).toBeTruthy();
    meals.unmount();

    const messages = renderClient("messages", { membershipPaywall: true });
    expect(screen.getByText(/Messages open again once membership is on/)).toBeTruthy();
    expect(messages.container.querySelector("[data-messages-panel]")).toBeNull();
  });

  it("shows Callie's courtesy month on Today for August and not for Founding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T18:00:00.000Z"));
    try {
      const august = renderClient("today", {
        profile: {
          name: "Pat",
          paid: true,
          homescreenTipDismissedAt: "2026-08-01T00:00:00Z",
          cohort_label: "2026-08",
        },
      });
      expect(screen.getByRole("heading", { name: "A courtesy month of the new membership" })).toBeTruthy();
      expect(screen.getByText(/one month free of the new tier/)).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Two friends cover a month" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Share my code" }).getAttribute("href")).toBe("/account/share");
      expect(screen.getByText("Alumni chat with Callie and the other grads")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Add my membership" }));
      expect(startMembershipCheckout).toHaveBeenCalledWith({ cancelPath: "/dashboard" });
      august.unmount();

      renderClient("today");
      expect(screen.queryByText("From Callie")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
