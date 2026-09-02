// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";
import { DECIDE_COPY } from "../content/decideVoice";
import { localDateIso } from "../utils/dates";

afterEach(() => {
  cleanup();
});

const MACROS = { cal: 1750, protein: 145, carbs: 180, fat: 60 };

function renderToday(plannedMeals = []) {
  return render(
    <MealLogCard
      macros={MACROS}
      mealLogDate={localDateIso()}
      decideNow={new Date(2026, 8, 2, 12, 40)}
      plannedMeals={plannedMeals}
      profile={{ prefL: "chicken", foodAvoids: "" }}
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
      onLogRecipe={vi.fn(async () => true)}
      onPencilPlanMeal={vi.fn(async () => true)}
    />,
  );
}

describe("Help me decide entry", () => {
  it("shows the Today bar and opens the sheet", () => {
    renderToday();
    expect(screen.getAllByText(DECIDE_COPY.title).length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(document.querySelector("[data-decide-sheet]")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: DECIDE_COPY.logIt }).length).toBeGreaterThan(0);
  });

  it("renders a grey pencilled dinner row", () => {
    renderToday([{
      id: "d1",
      slot: "dinner",
      via: "decide",
      name: "Pulled chicken tacos",
      cal: 425,
      p: 48,
      c: 38,
      f: 7,
    }]);
    expect(screen.getByText(DECIDE_COPY.pencilledHint)).toBeTruthy();
    expect(screen.getByRole("button", { name: DECIDE_COPY.ateIt })).toBeTruthy();
  });
});
