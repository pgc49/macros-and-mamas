// @vitest-environment jsdom
/**
 * The card is where the coach's honesty is visible or isn't. A number the
 * model estimated has to be marked as one, a meal from Callie's bank must not
 * be, and the recipe has to survive into the sheet — otherwise "Save to My
 * meals" keeps macros she can't reproduce.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CoachMealCard, CoachMealSheet } from "./CoachMealCard";

afterEach(cleanup);

const bankCard = {
  name: "Protein oatmeal",
  title: "Protein oatmeal",
  cal: 310,
  p: 30,
  c: 40,
  f: 4,
  tag: "Callie's bank",
  source: "bank",
  slot: "breakfast",
  reason: "Fills your protein, leaves 46g fat.",
};

const builtCard = {
  ...bankCard,
  name: "Chicken and rice bowl",
  title: "Chicken and rice bowl",
  tag: "From your kitchen",
  source: "kitchen",
  ingredients: [{ amount: "6 oz", item: "chicken thigh" }, "1 cup rice"],
  steps: ["Season the chicken.", "Sear 6 minutes a side."],
};

const ESTIMATE = "Rough estimate — adjust after if the plate looked different";

describe("coach card honesty", () => {
  it("marks a meal the model put numbers on as an estimate", () => {
    render(<CoachMealCard card={builtCard} onLog={vi.fn()} />);
    expect(screen.getByText(ESTIMATE)).toBeTruthy();
  });

  it("does not mark a meal from Callie's bank as an estimate", () => {
    render(<CoachMealCard card={bankCard} onLog={vi.fn()} />);
    expect(screen.queryByText(ESTIMATE)).toBeNull();
  });

  it("offers Save to My meals only for a meal she can't already find", () => {
    const { unmount } = render(<CoachMealCard card={bankCard} onLog={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Save to My meals" })).toBeNull();
    unmount();

    render(<CoachMealCard card={builtCard} onLog={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save to My meals" })).toBeTruthy();
  });

  it("shows the note when a portion runs protein past the top", () => {
    render(
      <CoachMealCard
        card={{ ...bankCard, proteinNote: "Puts you over the top of protein, which is fine" }}
        onLog={vi.fn()}
      />,
    );
    expect(screen.getByText("Puts you over the top of protein, which is fine")).toBeTruthy();
  });

  it("shows the macros it was ranked on, not the unportioned meal", () => {
    render(<CoachMealCard card={{ ...bankCard, title: "Protein oatmeal · 1.5×", cal: 465, p: 45, c: 60, f: 6 }} onLog={vi.fn()} />);
    expect(screen.getByTestId("coach-card-title").textContent).toBe("Protein oatmeal · 1.5×");
    expect(screen.getByText("465 cal · P 45 · C 60 · F 6")).toBeTruthy();
  });
});

describe("coach card after it is taken", () => {
  it("replaces the actions once the log lands, so she can't log it twice", async () => {
    render(<CoachMealCard card={bankCard} onLog={vi.fn(async () => true)} onPencil={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => expect(screen.getByText("Logged.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Log it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pencil in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "See recipe" })).toBeNull();
  });

  it("says pencilled, not logged, when she holds the room instead", async () => {
    render(<CoachMealCard card={bankCard} onLog={vi.fn()} onPencil={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Pencil in" }));
    await waitFor(() => expect(screen.getByText("Pencilled in.")).toBeTruthy());
  });

  it("keeps the card usable after a save to My meals", async () => {
    render(<CoachMealCard card={builtCard} onLog={vi.fn()} onSave={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to My meals" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Log it" })).toBeTruthy());
  });
});

describe("the recipe sheet", () => {
  it("shows what's in it and how to make it", () => {
    render(<CoachMealSheet card={builtCard} onClose={vi.fn()} onLog={vi.fn()} />);
    expect(screen.getByText("6 oz chicken thigh")).toBeTruthy();
    expect(screen.getByText("1 cup rice")).toBeTruthy();
    expect(screen.getByText("Sear 6 minutes a side.")).toBeTruthy();
  });

  it("leaves out the headings when there is no recipe to show", () => {
    render(<CoachMealSheet card={bankCard} onClose={vi.fn()} onLog={vi.fn()} />);
    expect(screen.queryByText("What's in it")).toBeNull();
    expect(screen.queryByText("How to make it")).toBeNull();
  });

  it("closes on the backdrop but not on the sheet itself", () => {
    const onClose = vi.fn();
    render(<CoachMealSheet card={builtCard} onClose={onClose} onLog={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Chicken and rice bowl")[0]);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });
});
