// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";

afterEach(() => {
  cleanup();
});

const customMeals = [
  { id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 },
  { id: "c2", name: "Yogurt bowl", cal: 280, p: 28, c: 30, f: 6, slot: "breakfast" },
  { id: "c3", name: "Pulled chicken tacos", cal: 425, p: 48, c: 38, f: 7 },
  { id: "c4", name: "Egg scramble", cal: 350, p: 32, c: 12, f: 18 },
];

const recipes = [
  { cat: "Breakfast", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4, serves: 1 },
  { cat: "Dinner", name: "Pulled chicken tacos", cal: 425, p: 48, c: 38, f: 7, serves: 4 },
];

function renderPlan() {
  return render(
    <MealLogCard
      initialMethod="recipes"
      customMeals={customMeals}
      recipes={recipes}
      plannedMeals={[]}
    />,
  );
}

function openFilter(name) {
  const current = screen.queryByRole("button", { name: /Filter meals/ });
  if (current && current.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(current);
  }
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("MealLogCard My plan list", () => {
  it("shows more than two saved meals and a slot filter", () => {
    renderPlan();
    expect(screen.getByText("Turkey and Bacon")).toBeTruthy();
    expect(screen.getByText("Yogurt bowl")).toBeTruthy();
    expect(screen.getAllByText("Pulled chicken tacos").length).toBeGreaterThan(0);
    expect(screen.getByText("Egg scramble")).toBeTruthy();
    expect(screen.queryByText("Add to")).toBeNull();

    const list = document.querySelector("[data-plan-meal-list]");
    expect(list).toBeTruthy();
    expect(list.style.maxHeight).toContain("64dvh");

    fireEvent.click(screen.getByRole("button", { name: "Filter meals" }));
    fireEvent.click(screen.getByRole("option", { name: "Dinner" }));

    expect(screen.queryByText("Protein oatmeal")).toBeNull();
    expect(screen.queryByText("Turkey and Bacon")).toBeNull();
    expect(screen.queryByText("Yogurt bowl")).toBeNull();
    expect(screen.getAllByText("Pulled chicken tacos").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Filter meals · Dinner" })).toBeTruthy();
  });

  it("keeps dinner tacos out of Breakfast and shows all saved under My meals", () => {
    renderPlan();
    fireEvent.click(screen.getByRole("button", { name: "Filter meals" }));
    expect(screen.getByRole("option", { name: "My meals" })).toBeTruthy();

    openFilter("Breakfast");
    expect(screen.getByText("Protein oatmeal")).toBeTruthy();
    expect(screen.getByText("Yogurt bowl")).toBeTruthy();
    expect(screen.queryByText("Pulled chicken tacos")).toBeNull();
    expect(screen.queryByText("Turkey and Bacon")).toBeNull();

    openFilter("My meals");
    expect(screen.getByText("Turkey and Bacon")).toBeTruthy();
    expect(screen.getByText("Pulled chicken tacos")).toBeTruthy();
    expect(screen.queryByText("Protein oatmeal")).toBeNull();
  });

  it("does not show Fits remaining macros without a log and ranges", () => {
    renderPlan();
    expect(screen.queryByRole("button", { name: "Fits remaining macros" })).toBeNull();
  });

  it("filters My plan to meals that fit remaining macros", () => {
    render(
      <MealLogCard
        initialMethod="recipes"
        customMeals={customMeals}
        recipes={[
          ...recipes,
          { cat: "Dinner", name: "Big pasta night", cal: 720, p: 28, c: 90, f: 22, serves: 1 },
        ]}
        plannedMeals={[
          { id: "p1", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4, slot: "breakfast" },
          { id: "p2", name: "Big pasta night", cal: 720, p: 28, c: 90, f: 22, slot: "dinner" },
        ]}
        macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
        todayLog={{
          date: "2026-08-30",
          entries: [{ name: "Lunch bowl", cal: 1400, p: 90, c: 120, f: 45 }],
        }}
        mealLogDate="2026-08-30"
      />,
    );

    expect(screen.getAllByText("Big pasta night").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Fits remaining macros" }));
    expect(screen.getByText(/Room left after this day’s log/)).toBeTruthy();
    expect(screen.getAllByText("Protein oatmeal").length).toBeGreaterThan(0);
    expect(screen.getByText("Yogurt bowl")).toBeTruthy();
    expect(screen.queryByText("Big pasta night")).toBeNull();
  });
});

describe("MealLogCard Save to today", () => {
  it("does not call onConfirmEstimate twice while the first save is pending", async () => {
    let resolveConfirm;
    const onConfirmEstimate = vi.fn(() => new Promise((resolve) => {
      resolveConfirm = resolve;
    }));

    render(
      <MealLogCard
        estimate={{
          meal: "Eggs and toast",
          calories: 420,
          protein_g: 28,
          carbs_g: 32,
          fat_g: 18,
          items: ["2 eggs", "toast"],
          confidence: "medium",
        }}
        onConfirmEstimate={onConfirmEstimate}
      />,
    );

    const save = await waitFor(() => screen.getByRole("button", { name: "Save to today" }));
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onConfirmEstimate).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const saving = screen.getByRole("button", { name: "Saving…" });
      expect(saving.disabled).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(onConfirmEstimate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "discard" }).disabled).toBe(true);

    resolveConfirm(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull());
    expect(onConfirmEstimate).toHaveBeenCalledTimes(1);
  });
});
