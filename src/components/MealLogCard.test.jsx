// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
