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
import { WeekPlanner } from "./WeekPlanner";
import { EatingOutMenuFlow } from "./EatingOutMenuFlow";
import { CoachMealCard } from "./CoachMealCard";

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

describe("log save contract — water bottle and glass", () => {
  it("does not increment when bottle add returns undefined", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "+ My bottle · 24 oz" }));
    fireEvent.click(screen.getByRole("button", { name: "+ My bottle · 24 oz" }));
    await waitFor(() => {
      expect(screen.getByText("Couldn't save that water — try again.")).toBeTruthy();
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/0 of 80 oz/)).toBeTruthy();
  });

  it("does not increment when glass add returns false", async () => {
    const onAdd = vi.fn(async () => false);
    render(
      <WaterLogCard
        date="2026-09-03"
        goalOz={80}
        bottleOz={24}
        entries={[]}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Glass · 8 oz" }));
    await waitFor(() => {
      expect(screen.getByText("Couldn't save that water — try again.")).toBeTruthy();
    });
    expect(onAdd).toHaveBeenCalledWith(8);
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

describe("log save contract — Weekly Planner Add to Today", () => {
  it("stays idle when onLog returns undefined", async () => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const onLog = vi.fn(async () => undefined);
    render(
      <WeekPlanner
        macros={{ cal: 1700, protein: 120, carbs: 150, fat: 50 }}
        days={[{
          day: "Mon",
          meals: [{
            id: "p1",
            name: "Protein oatmeal",
            cal: 310,
            p: 30,
            c: 40,
            f: 4,
            slot: "breakfast",
          }],
        }]}
        weekStart="2026-08-24"
        onLog={onLog}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to Today" }));
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Add to Today" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Added ✓" })).toBeNull();
  });
});

describe("log save contract — eating-out menu pick", () => {
  it("keeps the pick and shows an error when onPick returns undefined", async () => {
    const createUrl = URL.createObjectURL;
    const revokeUrl = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:menu-test";
    URL.revokeObjectURL = () => {};
    const onPick = vi.fn(async () => undefined);
    const onMealIdea = vi.fn(async () => ({
      meals: [{
        name: "Grilled salmon",
        cal: 520,
        p: 42,
        c: 18,
        f: 22,
        slot: "dinner",
      }],
    }));
    render(
      <EatingOutMenuFlow
        slot="dinner"
        macros={{ cal: 1700, protein: 120, carbs: 150, fat: 50 }}
        remaining={{ cal: 800, p: 60, c: 80, f: 30 }}
        dayTotals={{ cal: 400, p: 30, c: 40, f: 12 }}
        bands={{ calHi: 1900, pHi: 140, cHi: 180, fHi: 70 }}
        onMealIdea={onMealIdea}
        onPick={onPick}
        addLabel="Add to today"
      />,
    );
    const file = new File(["x"], "menu.jpg", { type: "image/jpeg" });
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[0], { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Get 5 picks" }));
    const add = await waitFor(() => screen.getByRole("button", { name: "Add to today" }));
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => {
      expect(screen.getByText("Couldn't log that meal — try again.")).toBeTruthy();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Grilled salmon")).toBeTruthy();
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
  });
});

describe("log save contract — coach card Log it / Pencil in", () => {
  const card = {
    name: "Protein oatmeal",
    title: "Protein oatmeal",
    cal: 310,
    p: 30,
    c: 40,
    f: 4,
    tag: "Callie's bank",
    source: "bank",
    slot: "breakfast",
  };

  it("stays idle when onLog returns undefined", async () => {
    const onLog = vi.fn(async () => undefined);
    render(<CoachMealCard card={card} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => {
      expect(screen.getByText("That didn't save. Try again in a second.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Log it" })).toBeTruthy();
    expect(screen.queryByText("Logged.")).toBeNull();
  });

  it("stays idle when onLog returns false", async () => {
    const onLog = vi.fn(async () => false);
    render(<CoachMealCard card={card} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Log it" })).toBeTruthy();
  });

  it("stays idle when onLog throws", async () => {
    const onLog = vi.fn(async () => { throw new Error("network"); });
    render(<CoachMealCard card={card} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => {
      expect(screen.getByText("That didn't save. Try again in a second.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Log it" })).toBeTruthy();
  });

  it("does not log twice while the first write is pending", async () => {
    let resolveLog;
    const onLog = vi.fn(() => new Promise((resolve) => {
      resolveLog = resolve;
    }));
    render(<CoachMealCard card={card} onLog={onLog} />);
    const log = screen.getByRole("button", { name: "Log it" });
    fireEvent.click(log);
    fireEvent.click(log);
    expect(onLog).toHaveBeenCalledTimes(1);
    resolveLog(true);
    await waitFor(() => expect(screen.getByText("Logged.")).toBeTruthy());
  });

  it("stays idle when onPencil returns undefined", async () => {
    const onPencil = vi.fn(async () => undefined);
    render(<CoachMealCard card={card} onLog={vi.fn()} onPencil={onPencil} />);
    fireEvent.click(screen.getByRole("button", { name: "Pencil in" }));
    await waitFor(() => {
      expect(screen.getByText("That didn't save. Try again in a second.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Pencil in" })).toBeTruthy();
    expect(screen.queryByText("Pencilled in.")).toBeNull();
  });

  it("stays idle when Save to My meals returns undefined", async () => {
    const onSave = vi.fn(async () => undefined);
    render(
      <CoachMealCard
        card={{ ...card, source: "kitchen", tag: "From your kitchen" }}
        onLog={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save to My meals" }));
    await waitFor(() => {
      expect(screen.getByText("That didn't save. Try again in a second.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Save to My meals" })).toBeTruthy();
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
