// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoggableMealRow } from "./LoggableMealRow";

afterEach(() => {
  cleanup();
});

const steakTacos = {
  id: "c-steak",
  name: "Steak Tacos",
  cal: 480,
  p: 38,
  c: 36,
  f: 18,
  serves: 1,
  ingredients: "6 oz steak\n2 tortillas",
  slot: "lunch",
};

function renderRow(extras = {}) {
  return render(
    <LoggableMealRow
      meal={steakTacos}
      via="custom"
      onLog={vi.fn(async () => true)}
      {...extras}
    />,
  );
}

describe("LoggableMealRow slot draft", () => {
  it("reports a slot draft without saving", () => {
    const onSlotDraftChange = vi.fn();
    const onSaveIngredients = vi.fn(async (meal) => meal);
    renderRow({ onSlotDraftChange, onSaveIngredients });

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));

    expect(onSlotDraftChange).toHaveBeenCalledWith("dinner");
    expect(onSaveIngredients).not.toHaveBeenCalled();
  });

  it("does not mark a controlled row dirty on mount", () => {
    const onSlotDraftChange = vi.fn();
    renderRow({
      meal: { id: "c-plain", name: "Sheet Pan", cal: 400, p: 30, c: 20, f: 12 },
      onSlotDraftChange,
    });

    expect(onSlotDraftChange).not.toHaveBeenCalled();
  });

  it("keeps My meals slot chips and labels them Meal slot, not Add to", () => {
    renderRow({});

    expect(screen.getByText("Meal slot")).toBeTruthy();
    expect(screen.queryByText("Add to")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));

    expect(screen.getByRole("button", { name: "Dinner" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("hides slot chips on bank or pantry rows", () => {
    renderRow({ showSlotPicker: false });

    expect(screen.queryByRole("button", { name: "Breakfast" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dinner" })).toBeNull();
    expect(screen.queryByText("Meal slot")).toBeNull();
    expect(screen.queryByText("Add to")).toBeNull();
    expect(screen.getByRole("button", { name: "Add to Today" })).toBeTruthy();
  });

  it("includes the current slot when saving ingredients", () => {
    const onSaveIngredients = vi.fn(async (meal) => meal);
    renderRow({ onSaveIngredients });

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Save recipe note" }));

    expect(onSaveIngredients).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: "6 oz steak\n2 tortillas",
      slot: "dinner",
    }));
  });

  it("does not persist a controlled draft slot when saving ingredients", () => {
    const onSaveIngredients = vi.fn(async (meal) => meal);
    const onSlotDraftChange = vi.fn();
    renderRow({
      slotValue: "dinner",
      onSlotDraftChange,
      onSaveIngredients,
    });

    fireEvent.click(screen.getByRole("button", { name: "Recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Save recipe note" }));

    expect(onSaveIngredients).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: "6 oz steak\n2 tortillas",
      slot: "lunch",
    }));
    expect(onSlotDraftChange).not.toHaveBeenCalled();
  });

});
