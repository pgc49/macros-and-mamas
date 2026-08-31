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

  it("hard-fails a file:// paste without calling the model", async () => {
    const onEstimateRecipe = vi.fn(async () => ({ meal: "should not run" }));

    render(
      <RecipeCreator
        embedded
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "file:///Users/me/Library/SMS/recipe.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByText(/Couldn't read that recipe/)).toBeTruthy());
    expect(onEstimateRecipe).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save to My meals" })).toBeNull();
  });

  it("hard-fails an iOS SMS attachment path without calling the model", async () => {
    const onEstimateRecipe = vi.fn(async () => ({ meal: "should not run" }));

    render(
      <RecipeCreator
        embedded
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "/var/mobile/Library/SMS/Attachments/xx/IMG_1234.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByText(/Couldn't read that recipe/)).toBeTruthy());
    expect(onEstimateRecipe).not.toHaveBeenCalled();
  });

  it("still reads a recipe that merely mentions a filename", async () => {
    const onEstimateRecipe = vi.fn(async () => ({
      meal: "Turkey chili",
      servings: 4,
      calories: 800,
      protein_g: 80,
      carbs_g: 40,
      fat_g: 20,
    }));

    render(
      <RecipeCreator
        embedded
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "Turkey chili\n2 lb ground turkey\nsee chili.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save to My meals" })).toBeTruthy());
    expect(onEstimateRecipe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save to My meals" }).disabled).toBe(false);
  });

  it("does not draft a meal named error or all-zero macros", async () => {
    const onEstimateRecipe = vi.fn(async () => ({
      meal: "error",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      tip: "I can't open that file path",
    }));
    const onSaveCustomMeal = vi.fn();

    render(
      <RecipeCreator
        embedded
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={onSaveCustomMeal}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "2 lb turkey" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByText(/Couldn't read that recipe/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Save to My meals" })).toBeNull();
    expect(onSaveCustomMeal).not.toHaveBeenCalled();
  });

  it("keeps Save off when the draft macros are all zero", async () => {
    const onEstimateRecipe = vi.fn(async () => ({
      meal: "Water",
      servings: 1,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    }));

    render(
      <RecipeCreator
        embedded
        onEstimateRecipe={onEstimateRecipe}
        onSaveCustomMeal={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Turkey chili/), {
      target: { value: "1 cup water" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read recipe" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save to My meals" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Save to My meals" }).disabled).toBe(true);
  });
});
