// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CALLIE_RECIPES } from "../../functions/_shared/callieRecipes.js";
import { MealRecipeCard } from "../components/MealRecipeCard.jsx";
import { RECIPES } from "./data.js";
import { RECIPE_DETAILS, withRecipeDetail } from "./recipeDetails.js";

afterEach(() => {
  cleanup();
});

const LAURA = "Laura's Juicy Chicken Meatballs";

describe("shared recipe bank", () => {
  it("keeps CALLIE_RECIPES in sync with RECIPES", () => {
    expect(CALLIE_RECIPES).toEqual(RECIPES);
  });

  it("has expandable details for every bank recipe", () => {
    for (const recipe of RECIPES) {
      const detail = RECIPE_DETAILS[recipe.name];
      expect(detail, `missing RECIPE_DETAILS for ${recipe.name}`).toBeTruthy();
      expect(Array.isArray(detail.steps) && detail.steps.length >= 4, `${recipe.name} needs 4–7 steps`).toBe(true);
      expect(detail.steps.length <= 7, `${recipe.name} has too many steps`).toBe(true);
    }
  });

  it("adds Laura's Juicy Chicken Meatballs as Dinner with per-serving macros", () => {
    const recipe = RECIPES.find((r) => r.name === LAURA);
    expect(recipe).toMatchObject({
      cat: "Dinner",
      name: LAURA,
      cal: 436,
      p: 45,
      c: 15,
      f: 22,
      serves: 8,
    });
    expect(recipe.desc).toMatch(/3 lb/i);
    expect(recipe.desc).toMatch(/⅛ of the batch/);

    const detail = withRecipeDetail(recipe);
    expect(detail.batch).toHaveLength(18);
    expect(detail.batch.map((line) => line.item)).toEqual([
      "ground chicken breast",
      "grated Parmesan cheese",
      "finely grated onion",
      "garlic, finely minced",
      "sourdough breadcrumbs",
      "plain 0% milk fat Greek yogurt",
      "avocado oil mayonnaise",
      "small eggs",
      "Worcestershire sauce",
      "tomato paste",
      "kosher salt",
      "black pepper",
      "garlic powder",
      "onion powder",
      "smoked paprika",
      "dried oregano",
      "dried thyme",
      "ground coriander",
    ]);
    expect(detail.serving[0].amount).toMatch(/1\/8|⅛/);
    expect(detail.steps.length).toBeGreaterThanOrEqual(4);
    expect(detail.steps.length).toBeLessThanOrEqual(7);
    expect(detail.steps.join(" ")).toMatch(/165/);
    expect(detail.steps.join(" ")).toMatch(/don’t overwork|don't overwork/i);
  });

  it("expands the card with batch ingredients and steps", () => {
    const recipe = RECIPES.find((r) => r.name === LAURA);
    render(<MealRecipeCard meal={recipe} showLog={false} />);

    expect(screen.getByText(LAURA)).toBeTruthy();
    expect(screen.getByText(/436 cal/)).toBeTruthy();
    expect(screen.getByText(/P 45g/)).toBeTruthy();
    expect(screen.queryByText("Ingredients · batch cook")).toBeNull();

    fireEvent.click(screen.getByText(/open recipe/i));

    expect(screen.getByText("Ingredients · batch cook")).toBeTruthy();
    expect(screen.getByText("ground chicken breast")).toBeTruthy();
    expect(screen.getByText("1 serving (⅛ of batch)")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText(/165°F/)).toBeTruthy();
  });
});
