// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";
import { DECIDE_COPY, knowLaterCopy } from "../content/decideVoice";
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

  it("closes on Escape and Back to logging", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(document.querySelector("[data-decide-sheet]")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-decide-sheet]")).toBeNull();

    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.back }));
    expect(document.querySelector("[data-decide-sheet]")).toBeNull();
  });

  it("names the later-slot CTA for lunch, not always dinner", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
    expect(screen.getByText(knowLaterCopy("lunch"))).toBeTruthy();
    expect(screen.queryByText(DECIDE_COPY.knowDinner)).toBeNull();
  });

  it("Log it does not double pre-scaled 2-serving macros", async () => {
    const onLogRecipe = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 18, 30)}
        profile={{ prefD: "salmon rice", foodAvoids: "" }}
        todayLog={{
          date: localDateIso(),
          entries: [
            { id: "b", name: "B", cal: 500, p: 35, c: 40, f: 20, slot: "breakfast", via: "manual" },
            { id: "l", name: "L", cal: 500, p: 35, c: 60, f: 20, slot: "lunch", via: "manual" },
          ],
        }}
        onLogRecipe={onLogRecipe}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getAllByRole("button", { name: DECIDE_COPY.logIt })[0]);
    expect(onLogRecipe).toHaveBeenCalled();
    const logged = onLogRecipe.mock.calls[0][0];
    expect(logged.cal).toBeGreaterThan(400);
    expect(logged.cal).toBeLessThan(1200);
    expect((logged.name.match(/×/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("Ate it logs the 1.5× pencilled totals the sheet showed", async () => {
    const onAteIt = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[{
          id: "d1",
          slot: "dinner",
          via: "decide",
          name: "Salmon salad bowl",
          cal: 335.333,
          p: 39.333,
          c: 6,
          f: 15,
          qty: 1.5,
          servings: 1.5,
        }]}
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
        onAteIt={onAteIt}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.ateIt }));
    const payload = onAteIt.mock.calls[0][0];
    expect(payload.cal).toBeCloseTo(503, 0);
    expect(payload.p).toBeCloseTo(59, 0);
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
