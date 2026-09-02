// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MealRecipeCard } from "./MealRecipeCard.jsx";

afterEach(() => {
  cleanup();
});

const oatmeal = {
  cat: "Breakfast",
  name: "Protein oatmeal",
  cal: 310,
  p: 30,
  c: 40,
  f: 4,
  serves: 1,
};

describe("MealRecipeCard Meals tab logging chrome", () => {
  it("stretches slot chips across the row and keeps servings on one compact line", () => {
    render(<MealRecipeCard meal={oatmeal} onLog={vi.fn()} />);

    const chips = document.querySelector("[data-slot-chips='fill']");
    expect(chips).toBeTruthy();
    expect(chips.style.width).toBe("100%");
    expect(chips.style.flexWrap).toBe("nowrap");
    const buttons = [...chips.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
    for (const btn of buttons) {
      expect(btn.style.flexGrow).toBe("1");
      expect(btn.style.flexBasis).toBe("0px");
    }

    const hint = document.querySelector("[data-servings-hint]");
    expect(hint.textContent).toMatch(/Servings to log/);
    expect(hint.textContent).toMatch(/macros only/);
    expect(hint.textContent).toMatch(/recipe stays 1 serving/);
    expect(hint.getAttribute("title")).toBe(
      "Scales macros only — recipe amounts stay at one serving",
    );
    expect(screen.queryByText("Add to")).toBeNull();
    expect(document.querySelector("[data-recipe-meta]")).toBeNull();
  });

  it("keeps the All meals collapsed layout: title, Open recipe, one pill, cal, P·C·F, chips, servings", () => {
    render(<MealRecipeCard meal={oatmeal} onLog={vi.fn()} />);
    const card = document.querySelector("[data-meal-recipe-card]");
    const text = card.textContent;
    const titleAt = text.indexOf("Protein oatmeal");
    const openAt = text.indexOf("Open recipe");
    const addAt = text.indexOf("Add to Today");
    const calAt = text.indexOf("310 cal");
    const macrosAt = text.indexOf("P 30g");
    const servingsAt = text.indexOf("Servings to log");
    expect(titleAt).toBeGreaterThanOrEqual(0);
    expect(openAt).toBeGreaterThan(titleAt);
    expect(addAt).toBeGreaterThan(titleAt);
    expect(calAt).toBeGreaterThan(addAt);
    expect(macrosAt).toBeGreaterThan(calAt);
    expect(servingsAt).toBeGreaterThan(macrosAt);
    expect(screen.getByRole("button", { name: "Breakfast" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lunch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dinner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Snack" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fewer servings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More servings" })).toBeTruthy();
  });

  it("advertises Open recipe as its own control and drops the redundant category stamp", () => {
    render(<MealRecipeCard meal={oatmeal} onLog={vi.fn()} />);

    expect(screen.queryByText(/breakfast · open recipe/i)).toBeNull();
    expect(document.querySelector("[data-recipe-meta]")).toBeNull();
    expect(screen.getByRole("button", { name: "Breakfast" })).toBeTruthy();
    const nameBtn = screen.getByRole("button", { name: "Open Protein oatmeal recipe" });
    const openBtn = screen.getByRole("button", { name: "Open recipe ▾" });
    expect(nameBtn.compareDocumentPosition(openBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(openBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(openBtn);
    expect(screen.getByRole("button", { name: "Hide recipe ▴" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Ingredients · one serving")).toBeTruthy();
  });

  it("logs the chosen slot and scaled macros from Add to Today", async () => {
    const onLog = vi.fn(async () => true);
    render(<MealRecipeCard meal={oatmeal} onLog={onLog} />);

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Today" }));

    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(onLog.mock.calls[0][0]).toMatchObject({
      name: "Protein oatmeal · 2×",
      slot: "dinner",
      via: "recipe",
      fromPlanner: true,
      cal: 620,
      p: 60,
      c: 80,
      f: 8,
      servingsLogged: 2,
    });
  });

  it("keeps treat and batch meta the chips cannot show", () => {
    render(
      <MealRecipeCard
        meal={{
          cat: "Treats",
          name: "Oatmeal protein cookies",
          cal: 85,
          p: 5,
          c: 13,
          f: 1,
          serves: 12,
        }}
        onLog={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-recipe-meta]").textContent).toMatch(/Treat/i);
    expect(document.querySelector("[data-recipe-meta]").textContent).toMatch(/batch serves 12/i);
    expect(screen.getByRole("button", { name: "Snack" })).toBeTruthy();
  });
});
