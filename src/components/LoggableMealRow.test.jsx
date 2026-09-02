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

  it("keeps bank or pantry slot chips local", () => {
    renderRow({});

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));

    expect(screen.getByRole("button", { name: "Dinner" })).toBeTruthy();
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

});
