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

  it("shows Fits remaining macros as a toggle that composes with the slot", () => {
    const onFitsChange = vi.fn();
    const onChange = vi.fn();
    render(
      <MealSlotFilterBar
        query=""
        onQueryChange={() => {}}
        filters={["Breakfast", "Dinner"]}
        value="Dinner"
        onChange={onChange}
        allValue="All meals"
        open={false}
        onOpenChange={() => {}}
        fitsActive
        onFitsChange={onFitsChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Filter meals · Dinner · Fits remaining macros" })).toBeTruthy();
    const fits = screen.getByRole("button", { name: "Fits remaining macros" });
    expect(fits.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fits);
    expect(onFitsChange).toHaveBeenCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides Fits remaining macros when no handler is passed", () => {
    render(
      <MealSlotFilterBar
        query=""
        onQueryChange={() => {}}
        filters={["Breakfast"]}
        value="All meals"
        onChange={() => {}}
        allValue="All meals"
        open={false}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Fits remaining macros" })).toBeNull();
  });
});
