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

function renderMeals(filter = "All meals") {
  let mealFilter = filter;
  const setMealFilter = vi.fn((next) => {
    mealFilter = next;
  });
  const view = render(
    <MemoryRouter>
      <ClientApp
        tab="meals"
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
        todayLog={{ date: "2026-08-30", entries: [] }}
        deleteMealEntry={noop}
        updateMealEntry={noop}
        mealLogDate="2026-08-30"
        mealLogWeekStart="2026-08-24"
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
});
