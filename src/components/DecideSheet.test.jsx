// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";
import { DECIDE_COPY, decideNextCopy, holdingRoomTitle, knowLaterCopy, snackRoomCopy } from "../content/decideVoice";
import { localDateIso } from "../utils/dates";
import { writeDecidePencil } from "../utils/decidePencil";
import { emptyWeekPlan } from "../utils/weekPlan";
import { resetDecideSnackCounts } from "../lib/decideEvents";

afterEach(() => {
  resetDecideSnackCounts();
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

  it("pins Back to logging outside the card scroll", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const dialog = screen.getByRole("dialog");
    const scroll = document.querySelector("[data-decide-sheet-scroll]");
    const chrome = document.querySelector("[data-decide-sheet-chrome]");
    const back = screen.getByRole("button", { name: DECIDE_COPY.back });
    expect(dialog.style.overflow).toBe("hidden");
    expect(dialog.style.maxHeight).toBe("90vh");
    expect(dialog.style.minHeight).toBe("0px");
    expect(scroll).toBeTruthy();
    expect(scroll.style.flexGrow).toBe("1");
    expect(scroll.style.minHeight).toBe("0px");
    expect(scroll.style.overflow).toBe("auto");
    expect(scroll.contains(back)).toBe(false);
    expect(chrome.contains(back)).toBe(true);
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

  it("Esc from detail returns to the list, then dismisses; it does not un-log", () => {
    const onLogRecipe = vi.fn(async () => true);
    const onAteIt = vi.fn(async () => true);
    const onDeleteEntry = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
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
        onLogRecipe={onLogRecipe}
        onAteIt={onAteIt}
        onDeleteEntry={onDeleteEntry}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const logIt = screen.getAllByRole("button", { name: DECIDE_COPY.logIt })[0];
    const openBtn = logIt.parentElement?.previousElementSibling;
    fireEvent.click(openBtn);
    expect(screen.getByRole("button", { name: "← Back" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-decide-sheet]")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "← Back" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-decide-sheet]")).toBeNull();
    expect(onLogRecipe).not.toHaveBeenCalled();
    expect(onAteIt).not.toHaveBeenCalled();
    expect(onDeleteEntry).not.toHaveBeenCalled();
    expect(screen.getAllByText("Breakfast").length).toBeGreaterThan(0);
  });

  it("Esc with a Today edit panel open does not delete the log", () => {
    const onDeleteEntry = vi.fn(async () => true);
    const onUpdateEntry = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
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
        onDeleteEntry={onDeleteEntry}
        onUpdateEntry={onUpdateEntry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Breakfast/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(document.querySelector("[data-decide-sheet]")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-decide-sheet]")).toBeNull();
    expect(onDeleteEntry).not.toHaveBeenCalled();
    expect(onUpdateEntry).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getAllByText("Breakfast").length).toBeGreaterThan(0);
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

  it("grey row and Ate it match writeDecidePencil 1.5× sheet totals", async () => {
    const onAteIt = vi.fn(async () => true);
    const { days } = writeDecidePencil(emptyWeekPlan(), "Wed", {
      name: "Tuna salad lettuce wraps",
      cal: 367.5,
      p: 46.5,
      c: 42,
      f: 3,
      servings: 1.5,
    }, "lunch");
    const planned = days.find((d) => d.day === "Wed")?.meals || [];
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={planned}
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
    expect(screen.getByText(/368 cal · P 47g/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.ateIt }));
    const payload = onAteIt.mock.calls[0][0];
    expect(payload.cal).toBe(368);
    expect(payload.p).toBe(47);
  });

  it("replace-path pencil still greys the 1.5× sheet totals", async () => {
    const first = writeDecidePencil(emptyWeekPlan(), "Wed", {
      name: "Tuna salad lettuce wraps",
      cal: 245,
      p: 31,
      c: 28,
      f: 2,
      servings: 1,
    }, "lunch");
    const { days } = writeDecidePencil(first.days, "Wed", {
      name: "Tuna salad lettuce wraps",
      cal: 367.5,
      p: 46.5,
      c: 42,
      f: 3,
      servings: 1.5,
    }, "lunch");
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={days.find((d) => d.day === "Wed")?.meals || []}
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
      />,
    );
    expect(screen.getByText(/368 cal · P 47g/)).toBeTruthy();
    expect(screen.queryByText(/245 cal · P 31g/)).toBeNull();
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
    expect(screen.getByRole("button", { name: DECIDE_COPY.clearPencil })).toBeTruthy();
  });

  it("clears a pencilled row so Holding can come back", () => {
    const onClearDecidePencil = vi.fn();
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[{
          id: "d1",
          slot: "dinner",
          via: "decide",
          name: "Pulled chicken tacos",
          cal: 425,
          p: 48,
          c: 38,
          f: 7,
        }]}
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
        onClearDecidePencil={onClearDecidePencil}
      />,
    );
    expect(document.querySelector("[data-decide-hold-row='dinner']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.clearPencil }));
    expect(onClearDecidePencil).toHaveBeenCalled();
    expect(onClearDecidePencil.mock.calls[0][0].slot).toBe("dinner");
  });

  it("shows save-room-for-a-snack defaulting to 1 and changing leftover for this meal", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const room = document.querySelector("[data-snack-room]");
    expect(room).toBeTruthy();
    expect(screen.getByText(snackRoomCopy(1))).toBeTruthy();
    const budgetGrid = document.querySelector("[data-decide-slot-budget]")?.parentElement;
    expect(budgetGrid?.nextElementSibling).toBe(document.querySelector("[data-snack-room]"));
    expect(screen.getByText(/and a snack/)).toBeTruthy();
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("1");
    const card = document.querySelector("[data-decide-slot-budget]");
    const before = card?.textContent || "";
    fireEvent.click(screen.getByRole("button", { name: "More snacks" }));
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
    expect(screen.getByText(snackRoomCopy(2))).toBeTruthy();
    expect(screen.queryByText(snackRoomCopy(1))).toBeNull();
    const after = card?.textContent || "";
    expect(after).not.toBe(before);
    expect(after).not.toMatch(/to range/);
  });

  it("keeps refine chips and Back in the bottom chrome", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const scroll = document.querySelector("[data-decide-sheet-scroll]");
    const chrome = document.querySelector("[data-decide-sheet-chrome]");
    const none = screen.getByRole("button", { name: DECIDE_COPY.noneOfThese });
    const back = screen.getByRole("button", { name: DECIDE_COPY.back });
    expect(chrome.contains(none)).toBe(true);
    expect(chrome.contains(back)).toBe(true);
    expect(scroll.contains(none)).toBe(false);
    expect(screen.getByRole("button", { name: DECIDE_COPY.lighter })).toBeTruthy();
    expect(screen.getByRole("button", { name: DECIDE_COPY.moreProtein })).toBeTruthy();
    expect(screen.getByPlaceholderText("Something else")).toBeTruthy();
  });

  it("does not offer Decide dinner next after pencilling dinner", async () => {
    const onPencilPlanMeal = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        profile={{ prefL: "chicken", prefD: "tacos", foodAvoids: "" }}
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
        onPencilPlanMeal={onPencilPlanMeal}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByText(knowLaterCopy("dinner")));
    const pencils = screen.getAllByRole("button", { name: DECIDE_COPY.pencilIn });
    fireEvent.click(pencils[pencils.length - 1]);
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: decideNextCopy("dinner") })).toBeNull();
  });

  it("steps snack room once when + fires twice", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const more = screen.getByRole("button", { name: "More snacks" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
  });

  it("keeps snack room through a Lighter refine", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByRole("button", { name: "More snacks" }));
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
    const snackCal = document.querySelector("[data-snack-room]").textContent;
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.lighter }));
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
    expect(document.querySelector("[data-snack-room]").textContent).toBe(snackCal);
    expect(document.querySelector("[data-snack-room]").textContent).not.toMatch(/^0 cal|[\s]0 cal/);
  });

  it("pencils a search hit into the current slot", async () => {
    const onPencilPlanMeal = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
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
        onPencilPlanMeal={onPencilPlanMeal}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.change(screen.getByLabelText(DECIDE_COPY.searchToPlan), {
      target: { value: "oatmeal" },
    });
    expect(document.querySelector("[data-decide-search-row]")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: DECIDE_COPY.pencilIn })[0]);
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(onPencilPlanMeal.mock.calls[0][1]).toBe("lunch");
  });

  it("search for chicken does not return sausage and stays off kitchen mode", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const search = screen.getByLabelText(DECIDE_COPY.searchToPlan);
    fireEvent.focus(search);
    expect(screen.queryByText(DECIDE_COPY.comingSoon)).toBeNull();
    fireEvent.change(search, { target: { value: "chicken" } });
    expect(screen.queryByText(DECIDE_COPY.comingSoon)).toBeNull();
    expect(screen.queryByText("Sausage, egg + whites")).toBeNull();
    const hits = [...document.querySelectorAll("[data-decide-search-row]")].map((el) => el.getAttribute("data-decide-search-row"));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((name) => /chicken/i.test(name))).toBe(true);
    expect(hits.some((name) => /sausage/i.test(name))).toBe(false);
  });

  it("shows a reserved dinner hold on Today's log strip", () => {
    renderToday();
    expect(document.querySelector("[data-decide-hold-row='dinner']")).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
  });

  it("names a lunch hold when breakfast is the current slot", () => {
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 8, 15)}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        todayLog={{ date: localDateIso(), entries: [] }}
      />,
    );
    expect(document.querySelector("[data-decide-hold-row='lunch']")).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("lunch"))).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
  });

  it("does not say Done for today while lunch is still open", () => {
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 18, 10)}
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
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(screen.queryByText(DECIDE_COPY.doneToday)).toBeNull();
    expect(document.querySelector("[data-decide-next-open='lunch']")).toBeTruthy();
    expect(screen.getByText(decideNextCopy("lunch"))).toBeTruthy();
  });

  it("offers Decide dinner next after Log it so the sheet does not dead-end", async () => {
    const onLogRecipe = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
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
        onLogRecipe={onLogRecipe}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getAllByRole("button", { name: DECIDE_COPY.logIt })[0]);
    expect(await screen.findByRole("button", { name: decideNextCopy("dinner") })).toBeTruthy();
    expect(document.querySelector("[data-decide-next]")).toBeTruthy();
  });
});
