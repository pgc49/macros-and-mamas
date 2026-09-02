// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { localDateIso } from "../utils/dates";
import { DECIDE_COPY, holdingRoomTitle } from "../content/decideVoice";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "pat@example.com" },
    profile: { name: "Pat" },
    isAdmin: false,
  }),
}));

import { ClientApp } from "./ClientApp";
import { resetDecideSnackCounts } from "../lib/decideEvents";
import { resetDecideScroll } from "../lib/decidePointerTrap";

afterEach(() => {
  resetDecideSnackCounts();
  resetDecideScroll();
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
        customMeals={[{ id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 }]}
      />
    </MemoryRouter>,
  );
  return { view, setMealFilter, getMealFilter: () => mealFilter };
}

describe("Meals tab search filter", () => {
  it("opens Help me decide as home with library chips under it", () => {
    renderMeals("Decide");

    expect(screen.getByRole("heading", { name: "Help me decide" })).toBeTruthy();
    expect(document.querySelector("[data-decide-sheet='page']")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All meals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My meals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planner" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weekly Planner" })).toBeNull();
    expect(screen.getByLabelText("Search meals to pencil in")).toBeTruthy();
  }, 10_000);

  it("shows All meals as a library chip, not the landing", () => {
    renderMeals();

    expect(screen.getByRole("heading", { name: "All meals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All meals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My meals" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Plan$/ })).toBeNull();
    expect(screen.getByLabelText("Search meals")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter meals" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Breakfast" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Pantry" })).toBeNull();
    expect(screen.getByText("Protein oatmeal")).toBeTruthy();
  }, 10_000);

  it("opens slot filters next to search and keeps Food prefs as its own chip", () => {
    const { setMealFilter } = renderMeals();

    fireEvent.click(screen.getByRole("button", { name: "Filter meals" }));
    expect(screen.getByRole("option", { name: "Breakfast" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food prefs" })).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: "Breakfast" }));
    expect(setMealFilter).toHaveBeenCalledWith("Breakfast");
  });

  it("toggles Planner back to Help me decide", () => {
    const { setMealFilter } = renderMeals("Plan");

    fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    expect(setMealFilter).toHaveBeenCalledWith("Decide");
  });

  it("shows pantry from the filter, not the top row", () => {
    renderMeals("Pantry");

    expect(screen.getByRole("heading", { name: "Pantry staples" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter meals · Pantry" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pantry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Planner" })).toBeTruthy();
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

describe("Meals Decide from Today", () => {
  it("opens the Meals Decide page for the slot, not a forever modal", () => {
    const setTab = vi.fn();
    const setMealFilter = vi.fn();
    render(
      <MemoryRouter>
        <ClientApp
          tab="today"
          setTab={setTab}
          profile={{ name: "Pat", prefL: "chicken" }}
          macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
          totals={{ p: 64, c: 53, f: 47, cal: 905 }}
          waterOz={80}
          estimateBusy={false}
          estimate={null}
          analyzePhoto={noop}
          analyzeText={noop}
          confirmEstimate={noop}
          discardEstimate={noop}
          logManualMeal={noop}
          logRecipe={noop}
          todayLog={{
            date: localDateIso(),
            entries: [{
              id: "b1",
              name: "Breakfast",
              cal: 905,
              p: 64,
              c: 53,
              f: 47,
              slot: "breakfast",
              via: "recipe",
            }],
          }}
          deleteMealEntry={noop}
          updateMealEntry={noop}
          mealLogDate={localDateIso()}
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
          adherenceFor={() => 0}
          progWeekNum={() => 1}
          earliestWk="2026-08-24"
          weighins={[]}
          logWeighin={noop}
          deleteWeighin={noop}
          weeklyRate={0}
          trends={{ locked: true, items: [] }}
          macroHistory={[]}
          mealFilter="Decide"
          setMealFilter={setMealFilter}
          customMeals={[]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(setTab).toHaveBeenCalledWith("meals");
    expect(setMealFilter).toHaveBeenCalledWith("Decide");
    expect(document.querySelector("[data-decide-sheet='open']")).toBeNull();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
  });

  it("Today nav from Meals Decide returns to Today once", () => {
    const setTab = vi.fn();
    render(
      <MemoryRouter>
        <ClientApp
          tab="meals"
          setTab={setTab}
          profile={{ name: "Pat" }}
          macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
          totals={{ p: 64, c: 53, f: 47, cal: 905 }}
          waterOz={80}
          estimateBusy={false}
          estimate={null}
          analyzePhoto={noop}
          analyzeText={noop}
          confirmEstimate={noop}
          discardEstimate={noop}
          logManualMeal={noop}
          logRecipe={noop}
          todayLog={{ date: localDateIso(), entries: [] }}
          deleteMealEntry={noop}
          updateMealEntry={noop}
          mealLogDate={localDateIso()}
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
          adherenceFor={() => 0}
          progWeekNum={() => 1}
          earliestWk="2026-08-24"
          weighins={[]}
          logWeighin={noop}
          deleteWeighin={noop}
          weeklyRate={0}
          trends={{ locked: true, items: [] }}
          macroHistory={[]}
          mealFilter="Decide"
          setMealFilter={noop}
          customMeals={[]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(setTab).toHaveBeenCalledWith("today");
    expect(setTab).not.toHaveBeenCalledWith("meals");
  });

  it("returns to Today after Log it from Meals Decide", async () => {
    const setTab = vi.fn();
    const logRecipe = vi.fn(async () => true);
    render(
      <MemoryRouter>
        <ClientApp
          tab="meals"
          setTab={setTab}
          profile={{ name: "Pat", prefL: "chicken" }}
          macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
          totals={{ p: 64, c: 53, f: 47, cal: 905 }}
          waterOz={80}
          estimateBusy={false}
          estimate={null}
          analyzePhoto={noop}
          analyzeText={noop}
          confirmEstimate={noop}
          discardEstimate={noop}
          logManualMeal={noop}
          logRecipe={logRecipe}
          todayLog={{
            date: localDateIso(),
            entries: [{
              id: "b1",
              name: "Breakfast",
              cal: 905,
              p: 64,
              c: 53,
              f: 47,
              slot: "breakfast",
              via: "recipe",
            }],
          }}
          deleteMealEntry={noop}
          updateMealEntry={noop}
          mealLogDate={localDateIso()}
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
          adherenceFor={() => 0}
          progWeekNum={() => 1}
          earliestWk="2026-08-24"
          weighins={[]}
          logWeighin={noop}
          deleteWeighin={noop}
          weeklyRate={0}
          trends={{ locked: true, items: [] }}
          macroHistory={[]}
          mealFilter="Decide"
          setMealFilter={noop}
          customMeals={[]}
        />
      </MemoryRouter>,
    );
    expect(document.querySelector("[data-decide-sheet='page']")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: DECIDE_COPY.logIt })[0]);
    expect(logRecipe).toHaveBeenCalled();
    await waitFor(() => expect(setTab).toHaveBeenCalledWith("today"));
    expect(document.querySelector("[data-decide-sheet='open']")).toBeNull();
  });
});
