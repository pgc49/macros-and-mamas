// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecipeCreator } from "./RecipeCreator";

afterEach(() => {
  cleanup();
});

describe("RecipeCreator", () => {
  it("saves the chosen meal slot with the recipe", async () => {
    const onSaveCustomMeal = vi.fn(async (meal) => meal);
    const onEstimateRecipe = vi.fn(async () => ({
      meal: "Turkey chili",
      servings: 4,
      calories: 800,
      protein_g: 80,
      carbs_g: 40,
      fat_g: 20,
      items: ["2 lb turkey"],
      confidence: "high",
    }));

    render(
      <RecipeCreator
        embedded
        defaultSlot="lunch"
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={onSaveCustomMeal}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "2 lb ground turkey\n1 onion" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByText("Save as")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to My meals" }));

    await waitFor(() => expect(onSaveCustomMeal).toHaveBeenCalled());
    expect(onSaveCustomMeal.mock.calls[0][0].slot).toBe("dinner");
    expect(onSaveCustomMeal.mock.calls[0][0].name).toBe("Turkey chili");
  });
});
