// @vitest-environment jsdom
/**
 * Regression contract for every mama-facing log Save/Add.
 * The last two incidents happened because we hardened one button and
 * treated a missing return as success. Every path here must:
 *   - ignore a second tap while the first write is in flight
 *   - keep the form / stay idle when the write returns false OR undefined
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MealLogCard } from "./MealLogCard";
import { LoggableMealRow } from "./LoggableMealRow";
import { MealRecipeCard } from "./MealRecipeCard";
import { WaterLogCard } from "./WaterLogCard";
import { WeighInCard } from "./WeighInCard";

afterEach(() => {
  cleanup();
});

const snackEntry = {
  id: "m1",
  name: "Lindt Dark Chocolate",
  cal: 170,
  p: 3,
  c: 14,
  f: 11,
  via: "manual",
  slot: "snack",
};

const oatmeal = {
  cat: "Breakfast",
  name: "Protein oatmeal",
  cal: 310,
  p: 30,
  c: 40,
  f: 4,
  serves: 1,
};

describe("log save contract — I know the Macros (snack)", () => {
  it("keeps chocolate + Snack selected when addMealLog returns undefined", async () => {
    const onManualLog = vi.fn(async () => undefined);
    render(<MealLogCard initialMethod="manual" onManualLog={onManualLog} />);

    fireEvent.click(screen.getByRole("button", { name: "Snack" }));
    fireEvent.change(screen.getByPlaceholderText("What was it?"), {
      target: { value: "Lindt Dark Chocolate" },
    });
    fireEvent.change(screen.getByPlaceholderText("CAL"), { target: { value: "170" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't save that meal — try again.")).toBeTruthy();
    });
    expect(screen.getByPlaceholderText("What was it?").value).toBe("Lindt Dark Chocolate");
    expect(onManualLog).toHaveBeenCalledWith(expect.objectContaining({
      name: "Lindt Dark Chocolate",
      slot: "snack",
      via: "manual",
    }));
  });
});

describe("log save contract — estimate Save to today", () => {
  it("keeps the review panel when confirm returns undefined (the old hole)", async () => {
    const onConfirmEstimate = vi.fn(async () => undefined);
    render(
      <MealLogCard
        estimate={{
          meal: "Eggs and toast",
          calories: 420,
          protein_g: 28,
          carbs_g: 32,
          fat_g: 18,
          items: ["2 eggs"],
          confidence: "medium",
        }}
        onConfirmEstimate={onConfirmEstimate}
      />,
    );

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Save to today" })));
    await waitFor(() => expect(onConfirmEstimate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save to today" })).toBeTruthy();
    expect(screen.getByDisplayValue("Eggs and toast")).toBeTruthy();
  });

  it("keeps the review panel when confirm returns false", async () => {
    const onConfirmEstimate = vi.fn(async () => false);
    render(
      <MealLogCard
        estimate={{
          meal: "Eggs and toast",
          calories: 420,
          protein_g: 28,
          carbs_g: 32,
          fat_g: 18,
          items: ["2 eggs"],
          confidence: "medium",
        }}
        onConfirmEstimate={onConfirmEstimate}
      />,
    );

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Save to today" })));
    await waitFor(() => expect(onConfirmEstimate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save to today" })).toBeTruthy();
  });
});

describe("log save contract — edit Save", () => {
  it("does not close the editor on a second tap while update is pending", async () => {
    let resolveUpdate;
    const onUpdateEntry = vi.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    render(
      <MealLogCard
        todayLog={{ date: "2026-09-03", entries: [snackEntry] }}
        mealLogDate="2026-09-03"
        onUpdateEntry={onUpdateEntry}
      />,
    );
    fireEvent.click(screen.getByText("Lindt Dark Chocolate"));
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onUpdateEntry).toHaveBeenCalledTimes(1);
    resolveUpdate(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull());
  });
});

describe("log save contract — My plan Add to Today", () => {
  it("stays idle when onLog returns undefined", async () => {
    const onLog = vi.fn(async () => undefined);
    render(<LoggableMealRow meal={oatmeal} via="custom" onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Today" }));
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Add to Today" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Added ✓" })).toBeNull();
  });

  it("does not log twice while the first add is pending", async () => {
    let resolveLog;
    const onLog = vi.fn(() => new Promise((resolve) => {
      resolveLog = resolve;
    }));
    render(<LoggableMealRow meal={oatmeal} via="recipe" onLog={onLog} />);
    const add = screen.getByRole("button", { name: "Add to Today" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(onLog).toHaveBeenCalledTimes(1);
    resolveLog(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Added ✓" })).toBeTruthy());
  });
});

describe("log save contract — Meals bank Add to Today", () => {
  it("stays idle when onLog returns false", async () => {
    const onLog = vi.fn(async () => false);
    render(<MealRecipeCard meal={oatmeal} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Today" }));
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Add to Today" })).toBeTruthy();
  });

  it("does not log twice while the first add is pending", async () => {
    let resolveLog;
    const onLog = vi.fn(() => new Promise((resolve) => {
      resolveLog = resolve;
    }));
    render(<MealRecipeCard meal={oatmeal} onLog={onLog} />);
    const add = screen.getByRole("button", { name: "Add to Today" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(onLog).toHaveBeenCalledTimes(1);
    resolveLog(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Added ✓" })).toBeTruthy());
  });
});

describe("log save contract — water custom oz", () => {
  it("keeps the oz field when addWater returns undefined", async () => {
    const onAdd = vi.fn(async () => undefined);
    render(
      <WaterLogCard
        date="2026-09-03"
        goalOz={80}
        bottleOz={24}
        entries={[]}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ oz" }));
    const oz = screen.getByPlaceholderText("oz");
    fireEvent.change(oz, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(12));
    expect(screen.getByPlaceholderText("oz").value).toBe("12");
  });

  it("clears the oz field only after addWater returns true", async () => {
    const onAdd = vi.fn(async () => true);
    render(
      <WaterLogCard
        date="2026-09-03"
        goalOz={80}
        bottleOz={24}
        entries={[]}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ oz" }));
    fireEvent.change(screen.getByPlaceholderText("oz"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByPlaceholderText("oz")).toBeNull());
  });
});

describe("log save contract — weigh-in", () => {
  it("keeps the weight and shows an error when save returns undefined", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<WeighInCard weighins={[]} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText("Weight (lbs)"), {
      target: { value: "142.2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => {
      expect(screen.getByText("Couldn't save that weigh-in — try again.")).toBeTruthy();
    });
    expect(screen.getByPlaceholderText("Weight (lbs)").value).toBe("142.2");
  });
});
