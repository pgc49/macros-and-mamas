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
        tab="meals"
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
        customMeals={extras.customMeals || [{ id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 }]}
        onSaveCustomMeal={extras.onSaveCustomMeal}
      />
    </MemoryRouter>,
  );
  return { view, setMealFilter, getMealFilter: () => mealFilter };
}

describe("Meals tab search filter", () => {
  it("defaults to All meals with an All meals chip first", () => {
    renderMeals();

    expect(screen.getByRole("heading", { name: "All meals" })).toBeTruthy();
    const chips = document.querySelector("[data-meals-sections]");
    expect(chips).toBeTruthy();
    expect(chips.style.flexWrap).toBe("nowrap");
    const sectionButtons = [...chips.querySelectorAll("button")].map((b) => b.textContent);
    expect(sectionButtons).toEqual(["All meals", "Planner", "Food prefs", "My meals"]);
    expect(screen.getByRole("button", { name: "All meals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My meals" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weekly Planner" })).toBeNull();
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

  it("selects All meals from its chip and Planner from Planner", () => {
    const { setMealFilter } = renderMeals();

    fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    expect(setMealFilter).toHaveBeenCalledWith("Plan");

    fireEvent.click(screen.getByRole("button", { name: "All meals" }));
    expect(setMealFilter).toHaveBeenCalledWith("All meals");
  });

  it("toggles Planner back to All meals", () => {
    const { setMealFilter } = renderMeals("Plan");

    fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    expect(setMealFilter).toHaveBeenCalledWith("All meals");
  });

  it("shows pantry from the filter, not the top row", () => {
    renderMeals("Pantry");

    expect(screen.getByRole("heading", { name: "Pantry staples" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter meals · Pantry" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pantry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Planner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All meals" })).toBeTruthy();
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

  it("lets several My meals slots draft, then Save all persists them", async () => {
    const onSaveCustomMeal = vi.fn(async (meal) => meal);
    renderMeals("My meals", {
      customMeals: [
        {
          id: "c-steak",
          name: "Steak Tacos",
          cal: 480,
          p: 38,
          c: 36,
          f: 18,
          slot: "lunch",
        },
        {
          id: "c-yogurt",
          name: "Yogurt bowl",
          cal: 280,
          p: 28,
          c: 30,
          f: 6,
          slot: "breakfast",
        },
      ],
      onSaveCustomMeal,
    });

    expect(screen.queryByRole("button", { name: "Save all" })).toBeNull();

    const dinners = screen.getAllByRole("button", { name: "Dinner" });
    fireEvent.click(dinners[0]);
    fireEvent.click(dinners[1]);

    expect(onSaveCustomMeal).not.toHaveBeenCalled();
    expect(screen.getByText("2 meal slots changed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save all" }));

    await vi.waitFor(() => {
      expect(onSaveCustomMeal).toHaveBeenCalledTimes(2);
    });
    expect(onSaveCustomMeal).toHaveBeenCalledWith(expect.objectContaining({
      name: "Steak Tacos",
      slot: "dinner",
    }));
    expect(onSaveCustomMeal).toHaveBeenCalledWith(expect.objectContaining({
      name: "Yogurt bowl",
      slot: "dinner",
    }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "Save all" })).toBeNull();
    });
  });

  it("reverts pending slots and shows a soft error when Save all fails", async () => {
    const onSaveCustomMeal = vi.fn(async () => null);
    renderMeals("My meals", {
      customMeals: [{
        id: "c-steak",
        name: "Steak Tacos",
        cal: 480,
        p: 38,
        c: 36,
        f: 18,
        slot: "lunch",
      }],
      onSaveCustomMeal,
    });

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save all" }));

    await vi.waitFor(() => {
      expect(screen.getByText("Couldn't save some slots — try again")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Save all" })).toBeNull();
  });
});
