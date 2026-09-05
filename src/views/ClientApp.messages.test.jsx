// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "pat@example.com" },
    profile: { name: "Pat" },
    isAdmin: false,
  }),
}));

vi.mock("../components/MessagesPanel", () => ({
  MessagesPanel: () => (
    <div data-messages-panel>
      <textarea placeholder="Write a message…" />
    </div>
  ),
}));

import { ClientApp } from "./ClientApp";

afterEach(() => {
  cleanup();
});

function noop() {}

function renderMessages() {
  return render(
    <MemoryRouter>
      <ClientApp
        tab="messages"
        setTab={noop}
        profile={{ name: "Pat" }}
        macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
        totals={{ p: 0, c: 0, f: 0, cal: 0 }}
        waterOz={80}
        estimateBusy={false}
        estimate={null}
        analyzePhoto={noop}
        analyzeText={noop}
        confirmEstimate={noop}
        discardEstimate={noop}
        logManualMeal={noop}
        logRecipe={noop}
        todayLog={{ date: "2026-09-04", entries: [] }}
        deleteMealEntry={noop}
        updateMealEntry={noop}
        mealLogDate="2026-09-04"
        mealLogWeekStart="2026-09-01"
        mealLogsByDate={{}}
        selectMealLogDate={noop}
        changeMealWeek={noop}
        waterLogsByDate={{}}
        waterBusy={false}
        onAddWater={noop}
        onUndoWater={noop}
        onChangeBottleOz={noop}
        viewWk={1}
        setViewWk={noop}
        curWk={1}
        editPast={false}
        setEditPast={noop}
        checksByWeek={{}}
        toggleCheck={noop}
        adherenceFor={() => ({})}
        progWeekNum={1}
        earliestWk="2026-09-01"
        weighins={[]}
        logWeighin={noop}
        deleteWeighin={noop}
        weeklyRate={0}
        trends={{ locked: true, items: [] }}
        macroHistory={[]}
        mealFilter="All meals"
        setMealFilter={noop}
        customMeals={[]}
        userId="mama-1"
        unreadMessages={0}
        onUnreadMessagesChange={noop}
      />
    </MemoryRouter>,
  );
}

describe("ClientApp Messages chrome", () => {
  it("locks page scroll and keeps App help off the composer", () => {
    const view = renderMessages();
    const content = view.container.querySelector("[data-shell-content]");
    expect(content.getAttribute("data-lock-scroll")).toBe("true");
    expect(content.style.overflowY).toBe("hidden");
    expect(view.container.querySelector("[data-shell-fill]")).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a message…")).toBeTruthy();
    expect(screen.queryByText("App help & feedback")).toBeNull();
  });
});
