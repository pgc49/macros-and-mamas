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

import { ClientApp } from "./ClientApp";

afterEach(() => {
  cleanup();
});

function noop() {}

function renderMeals(filter = "All meals", extras = {}) {
  let mealFilter = filter;
  const setMealFilter = vi.fn((next) => {
    mealFilter = next;
  });
  const view = render(
    <MemoryRouter>
      <ClientApp
        tab={extras.tab || "meals"}
        setTab={noop}
        profile={{ name: "Pat" }}
        macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
        totals={extras.totals || { p: 0, c: 0, f: 0, cal: 0 }}
        waterOz={80}
        estimateBusy={false}
        estimate={null}
        analyzePhoto={noop}
        analyzeText={noop}
        confirmEstimate={noop}
        discardEstimate={noop}
        logManualMeal={noop}
        logRecipe={noop}
        todayLog={extras.todayLog || { date: "2026-08-30", entries: [] }}
        deleteMealEntry={noop}
        updateMealEntry={noop}
        mealLogDate="2026-08-30"
        mealLogWeekStart="2026-08-24"
        mealLogsByDate={extras.mealLogsByDate || {}}
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
        earliestWk="2026-08-24"
        weighins={[]}
        logWeighin={noop}
        deleteWeighin={noop}
        weeklyRate={0}
        trends={{ locked: true, items: [] }}
        macroHistory={[]}
        mealFilter={filter}
        setMealFilter={setMealFilter}
        customMeals={[{ id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 }]}
      />
    </MemoryRouter>,
  );
  return { view, setMealFilter, getMealFilter: () => mealFilter };
}

describe("Meals tab search filter", () => {
  it("defaults to All meals without an All meals chip", () => {
    renderMeals();

    expect(screen.getByRole("heading", { name: "All meals" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "All meals" })).toBeNull();
    expect(screen.getByRole("button", { name: "Weekly Planner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My meals" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Plan$/ })).toBeNull();
    expect(screen.getByLabelText("Search meals")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter meals" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Breakfast" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Pantry" })).toBeNull();
    expect(screen.getByText("Protein oatmeal")).toBeTruthy();
  });

  it("opens slot filters next to search and keeps Food prefs as its own chip", () => {
    const { setMealFilter } = renderMeals();

    fireEvent.click(screen.getByRole("button", { name: "Filter meals" }));
    expect(screen.getByRole("option", { name: "Breakfast" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: "Breakfast" }));
    expect(setMealFilter).toHaveBeenCalledWith("Breakfast");
  });

  it("toggles Weekly Planner back to All meals", () => {
    const { setMealFilter } = renderMeals("Plan");

    fireEvent.click(screen.getByRole("button", { name: "Weekly Planner" }));
    expect(setMealFilter).toHaveBeenCalledWith("All meals");
  });

  it("shows pantry from the filter, not the top row", () => {
    renderMeals("Pantry");

    expect(screen.getByRole("heading", { name: "Pantry staples" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter meals · Pantry" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pantry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Weekly Planner" })).toBeTruthy();
  });

  it("filters the bank to meals that fit remaining room from today's log", () => {
    renderMeals("All meals", { totals: { cal: 1400, p: 90, c: 120, f: 45 } });

    expect(screen.getByText("Callie's chicken teriyaki")).toBeTruthy();
    expect(screen.getByText("Protein oatmeal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fits remaining macros" }));

    expect(screen.getByText(/Room left after today’s log/)).toBeTruthy();
    expect(screen.getByText("Protein oatmeal")).toBeTruthy();
    expect(screen.getByText("Greek yogurt + berries")).toBeTruthy();
    expect(screen.queryByText("Callie's chicken teriyaki")).toBeNull();
    expect(screen.queryByText("Chicken soba stir fry")).toBeNull();
  });
});

describe("Today log entries", () => {
  it("shows meals from the week map when todayLog was wiped empty", () => {
    renderMeals("All meals", {
      tab: "today",
      todayLog: { date: "2026-08-30", entries: [] },
      mealLogsByDate: {
        "2026-08-30": [{
          id: "1",
          name: "Lindt Dark Chocolate",
          cal: 170,
          p: 3,
          c: 14,
          f: 11,
          via: "manual",
          slot: "snack",
        }],
      },
    });

    expect(screen.getByText("Lindt Dark Chocolate")).toBeTruthy();
    expect(screen.getByText("Snacks")).toBeTruthy();
  });
});
