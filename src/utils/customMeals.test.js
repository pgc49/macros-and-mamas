import { describe, expect, it } from "vitest";
import {
  customMealId,
  customMealKey,
  customMealsMatch,
  mergeSavedCustomMeal,
  slotOnlySavePayload,
} from "./customMeals";

const sheet = { id: "c-sheet", name: "Sheet Pan", slot: "lunch" };
const sausage = { id: "c-sausage", name: "Sausage, egg + whites", slot: "breakfast" };
const greek = { id: "c-greek", name: "Greek yogurt + berries", slot: "breakfast" };

describe("custom meal identity", () => {
  it("keys by id even when names collide with another row's id string", () => {
    expect(customMealKey({ id: "c-sheet", name: "Sheet Pan" })).toBe("id:c-sheet");
    expect(customMealKey({ name: "c-sheet" })).toBe("name:c-sheet");
    expect(customMealId({ id: 0 })).toBe("0");
  });

  it("matches by id only when both sides have one — names cannot rematch", () => {
    expect(customMealsMatch(sheet, { id: "c-sheet", name: "Renamed" })).toBe(true);
    expect(customMealsMatch(sheet, { id: "c-other", name: "Sheet Pan" })).toBe(false);
    expect(customMealsMatch({ name: "Sheet Pan" }, { id: "c-sheet", name: "Sheet Pan" })).toBe(true);
  });

  it("keepOrder replaces the same id in place after a shuffled reload list", () => {
    const loaded = [sausage, greek, sheet];
    const saved = { ...sheet, slot: "dinner" };
    const next = mergeSavedCustomMeal(loaded, saved, { keepOrder: true });
    expect(next.map((m) => m.id)).toEqual(["c-sausage", "c-greek", "c-sheet"]);
    expect(next[2]).toMatchObject({ id: "c-sheet", name: "Sheet Pan", slot: "dinner" });
    expect(next[0].slot).toBe("breakfast");
  });

  it("does not move a slot onto a different meal when names match an older row", () => {
    const list = [sheet, sausage];
    const saved = { id: "c-sausage", name: "Sheet Pan", slot: "snack" };
    const next = mergeSavedCustomMeal(list, saved, { keepOrder: true });
    expect(next[0]).toMatchObject({ id: "c-sheet", slot: "lunch" });
    expect(next[1]).toMatchObject({ id: "c-sausage", slot: "snack" });
  });

  it("requires an id for slot-only persist", () => {
    expect(slotOnlySavePayload(sheet, "dinner")).toEqual({ id: "c-sheet", slot: "dinner" });
    expect(slotOnlySavePayload({ name: "Sheet Pan" }, "dinner")).toBeNull();
    expect(slotOnlySavePayload(sheet, "")).toBeNull();
  });
});
