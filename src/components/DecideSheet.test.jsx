// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";
import { DECIDE_COPY, decideNextCopy, holdingRoomTitle, knowLaterCopy, snackRoomCopy } from "../content/decideVoice";
import { localDateIso } from "../utils/dates";
import { writeDecidePencil } from "../utils/decidePencil";
import { emptyWeekPlan } from "../utils/weekPlan";
import { resetDecideSnackCounts } from "../lib/decideEvents";
import { resetDecideScroll } from "../lib/decidePointerTrap";

afterEach(() => {
  resetDecideSnackCounts();
  resetDecideScroll();
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
    fireEvent.click(screen.getByRole("button", { name: "Open recipe ▾" }));
    expect(screen.getByRole("button", { name: "Hide recipe ▴" })).toBeTruthy();
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
    fireEvent.click(screen.getAllByRole("button", { name: "Breakfast" })[0]);
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
    const todayLog = {
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
    };
    const pencil = {
      id: "d1",
      slot: "dinner",
      via: "decide",
      name: "Pulled chicken tacos",
      cal: 425,
      p: 48,
      c: 38,
      f: 7,
    };
    const { rerender } = render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[pencil]}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        todayLog={todayLog}
        onClearDecidePencil={onClearDecidePencil}
      />,
    );
    expect(document.querySelector("[data-decide-pencil-row='dinner']")).toBeTruthy();
    expect(document.querySelector("[data-decide-hold-row='dinner']")).toBeNull();
    expect(screen.getByText(holdingRoomTitle("lunch"))).toBeTruthy();
    expect(screen.queryByText(holdingRoomTitle("dinner"))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.clearPencil }));
    expect(onClearDecidePencil).toHaveBeenCalled();
    expect(onClearDecidePencil.mock.calls[0][0].slot).toBe("dinner");
    rerender(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[]}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        todayLog={todayLog}
        onClearDecidePencil={onClearDecidePencil}
      />,
    );
    expect(document.querySelector("[data-decide-pencil-row='dinner']")).toBeNull();
    expect(document.querySelector("[data-decide-hold-row='lunch']")).toBeTruthy();
    expect(document.querySelector("[data-decide-hold-row='dinner']")).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("lunch"))).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
  });

  it("keeps snacks optional and quiet until she turns them on", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(document.querySelector("[data-snack-include='off']")).toBeTruthy();
    expect(document.querySelector("[data-snack-room]")).toBeNull();
    expect(screen.queryByText(snackRoomCopy(1))).toBeNull();
    expect(screen.queryByText(/and a snack/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.includeSnacks }));
    const room = document.querySelector("[data-snack-room]");
    expect(room).toBeTruthy();
    expect(screen.getByText(snackRoomCopy(1))).toBeTruthy();
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
    expect(card?.textContent).toMatch(/Left for/i);
    expect(document.querySelector("[data-decide-held-later]")).toBeTruthy();
  });

  it("scrolls the sheet as a whole and pins only Back", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const scroll = document.querySelector("[data-decide-sheet-scroll]");
    const chrome = document.querySelector("[data-decide-sheet-chrome]");
    const none = screen.getByRole("button", { name: DECIDE_COPY.noneOfThese });
    const back = screen.getByRole("button", { name: DECIDE_COPY.back });
    const featured = document.querySelector("[data-decide-featured-card]");
    expect(scroll.contains(document.querySelector("[data-decide-slot-left]"))).toBe(true);
    expect(scroll.contains(featured)).toBe(true);
    expect(scroll.contains(none)).toBe(true);
    expect(chrome.contains(back)).toBe(true);
    expect(chrome.contains(none)).toBe(false);
    expect(featured.querySelector("[data-meal-recipe-card]")).toBeTruthy();
    expect(featured.style.minHeight || "").not.toBe("200px");
    expect(screen.getByRole("button", { name: DECIDE_COPY.lighter })).toBeTruthy();
    expect(screen.getByRole("button", { name: DECIDE_COPY.moreProtein })).toBeTruthy();
    expect(screen.getByPlaceholderText(DECIDE_COPY.somethingElsePlaceholder)).toBeTruthy();
  });

  it("Lighter twice walks to a new top card", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const first = document.querySelector("[data-decide-featured-card]")?.textContent || "";
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.lighter }));
    const afterOne = document.querySelector("[data-decide-featured-card]")?.textContent || "";
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.lighter }));
    const afterTwo = document.querySelector("[data-decide-featured-card]")?.textContent || "";
    expect(afterOne.length).toBeGreaterThan(0);
    expect(afterTwo.length).toBeGreaterThan(0);
    expect(afterTwo).not.toBe(afterOne);
    expect(afterTwo === first && afterOne === first).toBe(false);
  });

  it("uses the All meals card on Pick for me, not a clipped mini-card", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.background.replace(/\s/g, "")).toMatch(/#FAF5F2|rgb\(250,245,242\)/i);
    expect(document.querySelector("[data-decide-sheet-chrome]").style.background.replace(/\s/g, "")).toMatch(/#FAF5F2|rgb\(250,245,242\)/i);
    const featured = document.querySelector("[data-decide-featured-card]");
    expect(featured).toBeTruthy();
    expect(featured.querySelector("[data-meal-recipe-card]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open recipe ▾" })).toBeTruthy();
    expect(screen.getByRole("button", { name: DECIDE_COPY.pencilIn })).toBeTruthy();
    expect(screen.getByRole("button", { name: DECIDE_COPY.logIt })).toBeTruthy();
    expect(featured.querySelector("[data-slot-chips='fill']") || featured.querySelector("[data-slot-chips]")).toBeTruthy();
    expect(featured.querySelector("[data-servings-hint]")).toBeTruthy();
    expect(screen.queryByText(DECIDE_COPY.seeRecipe)).toBeNull();
    expect(screen.queryByRole("button", { name: DECIDE_COPY.kitchen })).toBeNull();
    expect(screen.queryByRole("button", { name: DECIDE_COPY.eatingOut })).toBeNull();
  });

  it("search focus does not change Dinner to Lunch", () => {
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
    expect(document.querySelector("[data-decide-slot-budget]")?.textContent).toMatch(/dinner/i);
    fireEvent.focus(screen.getByLabelText(DECIDE_COPY.searchToPlan));
    expect(document.querySelector("[data-decide-slot-budget]")?.textContent).toMatch(/dinner/i);
    expect(screen.queryByText(DECIDE_COPY.comingSoon)).toBeNull();
  });

  it("after pencilling dinner at snack time offers lunch, not snack or Done", async () => {
    const onPencilPlanMeal = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 15, 10)}
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
    fireEvent.click(document.querySelector("[data-decide-later-list] button"));
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(screen.queryByText(DECIDE_COPY.doneToday)).toBeNull();
    expect(screen.queryByRole("button", { name: decideNextCopy("snack") })).toBeNull();
    expect(await screen.findByRole("button", { name: decideNextCopy("lunch") })).toBeTruthy();
    expect(document.querySelector("[data-decide-next-open='lunch']")).toBeTruthy();
  });

  it("after pencilling dinner at dinner time offers lunch, not Done", async () => {
    const onPencilPlanMeal = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 18, 10)}
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
    expect(screen.queryByText(DECIDE_COPY.doneToday)).toBeNull();
    expect(screen.getByText(decideNextCopy("lunch"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.pencilIn }));
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(screen.queryByText(DECIDE_COPY.doneToday)).toBeNull();
    expect(screen.queryByRole("button", { name: decideNextCopy("snack") })).toBeNull();
    expect(await screen.findByRole("button", { name: decideNextCopy("lunch") })).toBeTruthy();
  });

  it("after pencilling breakfast offers Decide lunch next, not dinner", async () => {
    const onPencilPlanMeal = vi.fn(async () => true);
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 8, 15)}
        profile={{ prefB: "oatmeal", foodAvoids: "" }}
        plannedMeals={[
          { slot: "lunch", name: "Meal prep bowls", via: "manual", cal: 400, p: 30, c: 40, f: 10 },
          { slot: "dinner", name: "Tacos", via: "manual", cal: 500, p: 40, c: 40, f: 15 },
        ]}
        todayLog={{ date: localDateIso(), entries: [] }}
        onPencilPlanMeal={onPencilPlanMeal}
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    expect(document.querySelector("[data-decide-slot-left]")?.textContent).toMatch(/breakfast/i);
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.pencilIn }));
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(onPencilPlanMeal.mock.calls[0][1]).toBe("breakfast");
    expect(screen.queryByRole("button", { name: decideNextCopy("dinner") })).toBeNull();
    expect(await screen.findByRole("button", { name: decideNextCopy("lunch") })).toBeTruthy();
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
    fireEvent.click(document.querySelector("[data-decide-later-list] button"));
    expect(onPencilPlanMeal).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: decideNextCopy("dinner") })).toBeNull();
  });

  it("steps snack room once when + fires twice", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.includeSnacks }));
    const more = screen.getByRole("button", { name: "More snacks" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
  });

  it("keeps snack room through a Lighter refine", () => {
    renderToday();
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.includeSnacks }));
    fireEvent.click(screen.getByRole("button", { name: "More snacks" }));
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
    const snackCal = document.querySelector("[data-snack-room]").textContent;
    fireEvent.click(screen.getByRole("button", { name: DECIDE_COPY.lighter }));
    expect(document.querySelector("[data-snack-room-count]")?.textContent).toBe("2");
    expect(document.querySelector("[data-snack-room]").textContent).toBe(snackCal);
    expect(document.querySelector("[data-snack-room]").textContent).not.toMatch(/^0 cal|[\s]0 cal/);
  });

  it("search finds a saved My meals plate in the All meals pool", () => {
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        customMeals={[{
          id: "c-taco",
          name: "Leftover taco bowl",
          cal: 380,
          p: 32,
          c: 28,
          f: 10,
          ingredients: "3 oz chicken\n½ cup rice",
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
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    fireEvent.change(screen.getByLabelText(DECIDE_COPY.searchToPlan), {
      target: { value: "taco" },
    });
    const hits = [...document.querySelectorAll("[data-decide-search-row]")].map((el) => el.getAttribute("data-decide-search-row"));
    expect(hits).toContain("Leftover taco bowl");
    expect(document.querySelector("[data-decide-search-row='Leftover taco bowl'] [data-meal-recipe-card]")).toBeTruthy();
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

  it("Something else re-rolls toward a My meals hint without becoming a second search", async () => {
    render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        customMeals={[{
          id: "c-taco",
          name: "Leftover taco bowl",
          cal: 380,
          p: 32,
          c: 28,
          f: 10,
          ingredients: "3 oz chicken\n½ cup rice",
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
      />,
    );
    fireEvent.click(document.querySelector("[data-decide-bar]"));
    const hint = screen.getByPlaceholderText(DECIDE_COPY.somethingElsePlaceholder);
    fireEvent.change(hint, { target: { value: "taco bowl" } });
    fireEvent.keyDown(hint, { key: "Enter" });
    expect(document.querySelector("[data-decide-search-row]")).toBeNull();
    expect(await screen.findByText("Leftover taco bowl")).toBeTruthy();
    expect(document.querySelector("[data-decide-featured-card]")?.textContent).toMatch(/Leftover taco bowl/);
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
    expect(document.querySelector("[data-decide-hold-row='lunch']")).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
    expect(screen.getByText(holdingRoomTitle("lunch"))).toBeTruthy();
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

  it("clearing a pencilled lunch restores Holding room for lunch", () => {
    const lunchPencil = {
      id: "l1",
      slot: "lunch",
      via: "decide",
      name: "Chicken salad",
      cal: 380,
      p: 36,
      c: 18,
      f: 12,
    };
    const todayLog = {
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
    };
    const { rerender } = render(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[lunchPencil]}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        todayLog={todayLog}
      />,
    );
    expect(document.querySelector("[data-decide-pencil-row='lunch']")).toBeTruthy();
    expect(document.querySelector("[data-decide-hold-row='lunch']")).toBeNull();
    expect(screen.getByText(holdingRoomTitle("dinner"))).toBeTruthy();
    rerender(
      <MealLogCard
        macros={MACROS}
        mealLogDate={localDateIso()}
        decideNow={new Date(2026, 8, 2, 12, 40)}
        plannedMeals={[]}
        profile={{ prefL: "chicken", foodAvoids: "" }}
        todayLog={todayLog}
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
