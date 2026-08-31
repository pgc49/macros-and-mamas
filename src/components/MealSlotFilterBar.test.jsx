// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealSlotFilterBar } from "./MealSlotFilterBar";

afterEach(() => {
  cleanup();
});

describe("MealSlotFilterBar", () => {
  it("hides slot chips until the filter opens", () => {
    const onOpenChange = vi.fn();
    render(
      <MealSlotFilterBar
        query=""
        onQueryChange={() => {}}
        placeholder="Search meals"
        filters={["Breakfast", "Pantry"]}
        value="All meals"
        onChange={() => {}}
        allValue="All meals"
        open={false}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByLabelText("Search meals")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Breakfast" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter meals" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("keeps chips open while a slot is active", () => {
    const onChange = vi.fn();
    render(
      <MealSlotFilterBar
        query=""
        onQueryChange={() => {}}
        filters={["Breakfast", "Pantry"]}
        value="Breakfast"
        onChange={onChange}
        allValue="All meals"
        open={false}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Filter meals · Breakfast" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Breakfast" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Pantry" }));
    expect(onChange).toHaveBeenCalledWith("Pantry");
  });
});
