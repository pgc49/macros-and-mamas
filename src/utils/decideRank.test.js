import { describe, expect, it } from "vitest";
import { DECIDE_COPY } from "../content/decideVoice.js";
import {
  decideKnowsYou,
  decideReason,
  pickScale,
  rankBankCards,
  scoreScaledMeal,
} from "./decideRank.js";

const BUDGET = { cal: 275, pNeed: 25, pHigh: 32, c: 65, f: 8 };

const chicken = {
  name: "Grilled chicken big salad",
  cal: 210,
  p: 30,
  c: 5,
  f: 7,
  ingredients: [{ item: "chicken breast" }],
};

const salmon = {
  name: "Salmon salad bowl",
  cal: 220,
  p: 28,
  c: 6,
  f: 8,
  ingredients: [{ item: "wild salmon" }],
};

const yogurt = {
  name: "Greek yogurt + berries",
  cal: 180,
  p: 24,
  c: 16,
  f: 2,
};

const turkey = {
  name: "Turkey sausage rice bowl",
  cal: 240,
  p: 26,
  c: 20,
  f: 6,
  ingredients: [{ item: "turkey sausage" }],
};

const steak = {
  name: "Steak night",
  cal: 600,
  p: 50,
  c: 20,
  f: 30,
};

describe("pickScale", () => {
  it("keeps 1× when it fits and a bigger plate does not close 15g more protein", () => {
    expect(pickScale({ cal: 200, p: 20, c: 10, f: 4 }, BUDGET)).toBe(1);
  });

  it("upsizes when a larger plate still fits and adds at least 15g protein", () => {
    const roomy = { cal: 900, pNeed: 75, pHigh: 85, c: 90, f: 30 };
    expect(pickScale({ cal: 300, p: 30, c: 20, f: 8 }, roomy)).toBe(2);
    const mid = { cal: 500, pNeed: 50, pHigh: 60, c: 50, f: 16 };
    expect(pickScale({ cal: 300, p: 30, c: 20, f: 8 }, mid)).toBe(1.5);
  });

  it("uses 0.75 then half only when 1× does not fit", () => {
    const tight = { cal: 150, pNeed: 20, pHigh: 24, c: 20, f: 4 };
    expect(pickScale({ cal: 200, p: 24, c: 16, f: 2 }, tight)).toBe(0.75);
    const tighter = { cal: 100, pNeed: 20, pHigh: 24, c: 12, f: 2 };
    expect(pickScale({ cal: 200, p: 24, c: 16, f: 2 }, tighter)).toBe(0.5);
  });
});

describe("rankBankCards", () => {
  it("drops diet violations and dislikes before scoring", () => {
    const { meals } = rankBankCards({
      bankMeals: [chicken, salmon, yogurt],
      budget: BUDGET,
      diet: "vegetarian",
      dislikes: ["yogurt"],
    });
    expect(meals.map((m) => m.name)).not.toContain(chicken.name);
    expect(meals.map((m) => m.name)).not.toContain(salmon.name);
    expect(meals.map((m) => m.name)).not.toContain(yogurt.name);
  });

  it("never returns the same meal at two scales and keeps three protein families", () => {
    const { meals } = rankBankCards({
      bankMeals: [chicken, salmon, yogurt, turkey, { ...chicken, name: "Chicken salad on sourdough" }],
      budget: BUDGET,
    });
    const names = meals.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(meals.length).toBeLessThanOrEqual(3);
  });

  it("adds a fridge soft card when only two meals fit", () => {
    const { cards } = rankBankCards({
      bankMeals: [chicken, yogurt],
      budget: BUDGET,
    });
    expect(cards[2]).toMatchObject({ kind: "soft", action: "kitchen" });
  });

  it("adds Browse everything when almost nothing fits", () => {
    const { cards } = rankBankCards({
      bankMeals: [steak],
      budget: BUDGET,
    });
    expect(cards.some((c) => c.action === "browse")).toBe(true);
  });

  it("lighter prefer plus skipNames changes the top cards", () => {
    const heavy = { name: "Heavy bowl", cal: 260, p: 28, c: 20, f: 8 };
    const mid = { name: "Mid bowl", cal: 200, p: 26, c: 18, f: 6 };
    const light = { name: "Light bowl", cal: 140, p: 24, c: 12, f: 3 };
    const first = rankBankCards({
      bankMeals: [heavy, mid, light, yogurt],
      budget: BUDGET,
    });
    const next = rankBankCards({
      bankMeals: [heavy, mid, light, yogurt],
      budget: BUDGET,
      prefer: "lighter",
      skipNames: first.meals.map((m) => m.name),
    });
    expect(next.meals.map((m) => m.name).some((n) => first.meals.some((f) => f.name === n)))
      .toBe(false);
  });

  it("two exclusive lighter passes never repeat the pantry trio", () => {
    const applePb = { name: "Apple + peanut butter", cal: 190, p: 5, c: 28, f: 8 };
    const cookies = { name: "Oatmeal protein cookies", cal: 85, p: 5, c: 13, f: 1 };
    const kalona4 = { name: "Kalona SuperNatural Whole Milk (4 oz)", cal: 70, p: 4, c: 6, f: 4 };
    const kalona8 = { name: "Kalona SuperNatural Whole Milk (8 oz)", cal: 140, p: 8, c: 12, f: 8 };
    const honey = { name: "Honey", cal: 21, p: 0, c: 6, f: 0 };
    const yogurtCup = { name: "Greek yogurt + berries", cal: 180, p: 24, c: 16, f: 2 };
    const chickenSalad = { name: "Grilled chicken big salad", cal: 210, p: 30, c: 5, f: 7 };
    const pool = {
      bankMeals: [applePb, cookies, chickenSalad, yogurtCup],
      pantryItems: [kalona4, kalona8, honey],
      budget: { cal: 400, pNeed: 25, pHigh: 32, c: 65, f: 12 },
    };
    const first = rankBankCards({ ...pool, prefer: "lighter" });
    const second = rankBankCards({
      ...pool,
      prefer: "lighter",
      skipNames: first.meals.map((m) => m.name),
    });
    const firstNames = first.meals.map((m) => m.name);
    const secondNames = second.meals.map((m) => m.name);
    expect(firstNames.length).toBeGreaterThan(0);
    expect(secondNames.length).toBeGreaterThan(0);
    expect(secondNames.some((n) => firstNames.includes(n))).toBe(false);
    expect(first.meals[0].cal).toBeLessThanOrEqual(first.meals[first.meals.length - 1].cal);
  });

  it("protein prefer keeps real protein and drops Honey", () => {
    const { meals } = rankBankCards({
      bankMeals: [chicken, yogurt],
      pantryItems: [{ name: "Honey", cal: 21, p: 0, c: 6, f: 0 }],
      budget: BUDGET,
      prefer: "protein",
    });
    expect(meals.map((m) => m.name)).not.toContain("Honey");
    expect(meals.every((m) => (m.p || 0) > 0)).toBe(true);
  });

  it("None of these walks to the next three", () => {
    const first = rankBankCards({
      bankMeals: [chicken, salmon, yogurt, turkey],
      budget: BUDGET,
    });
    const next = rankBankCards({
      bankMeals: [chicken, salmon, yogurt, turkey],
      budget: BUDGET,
      skipNames: first.meals.map((m) => m.name),
    });
    const overlap = next.meals.filter((m) => first.meals.some((f) => f.name === m.name));
    expect(overlap).toEqual([]);
  });

  it("scores My meals and a like token above a generic bank row", () => {
    const bank = scoreScaledMeal({ ...chicken, source: "bank", servings: 1 }, BUDGET, {});
    const mine = scoreScaledMeal({ ...chicken, source: "my", servings: 1 }, BUDGET, { likes: ["chicken"] });
    expect(mine).toBeGreaterThan(bank);
  });
});

describe("knows-you and reason", () => {
  it("prefers pencilled, then usuals, then likes", () => {
    expect(decideKnowsYou(chicken, { pencilledName: chicken.name })).toBe(DECIDE_COPY.knowsPencilled);
    expect(decideKnowsYou(chicken, {
      slotHistoryNames: [chicken.name, chicken.name, chicken.name],
      slot: "lunch",
    })).toBe("One of your usuals at lunch");
    expect(decideKnowsYou(chicken, { likes: ["chicken"] })).toBe("You like chicken");
    expect(decideKnowsYou({ ...yogurt, source: "pantry" })).toBe(DECIDE_COPY.knowsPantry);
  });

  it("writes protein-forward reason lines", () => {
    expect(decideReason({ ...chicken, servings: 1, p: 30, f: 4 }, { pNeed: 25, f: 5 }))
      .toMatch(/Fills your protein/);
    expect(decideReason({ ...chicken, servings: 1.5, p: 30, f: 4 }, { pNeed: 25, f: 20 }))
      .toMatch(/1.5 servings/);
    expect(decideReason({ ...chicken, servings: 1, p: 18 }, { pNeed: 25, f: 20 }))
      .toBe(DECIDE_COPY.reasonMost);
    expect(decideReason(chicken, BUDGET, { over: true })).toBe(DECIDE_COPY.reasonOver);
  });

  it("never says Gets protein into range when protein is nowhere near pNeed", () => {
    const honey = { name: "Honey", servings: 1, cal: 21, p: 0, c: 6, f: 0 };
    expect(decideReason(honey, { pNeed: 25, f: 20 })).toBe(DECIDE_COPY.reasonFits);
    expect(decideReason(honey, { pNeed: 25, f: 20 })).not.toBe(DECIDE_COPY.reasonGets);
  });
});
