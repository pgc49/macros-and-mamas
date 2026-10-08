// @vitest-environment jsdom
/**
 * The coach's promises, held to by test:
 *
 *  - the question she asks most is answered on the device, with no network
 *  - a question that isn't the coach's is handed to Callie in her own words
 *  - a card that fails to save never looks like a logged meal
 *  - the coach doesn't hand back a card she has already turned down
 */

import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import * as Sentry from "@sentry/react";
import { CoachPanel, pairCoachThread } from "./CoachPanel";
import { CoachMealCard } from "./CoachMealCard";
import { COACH_COPY, COACH_DEFLECT, COACH_DISORDERED_LINE_NOTED, COACH_EMERGENCY_LINE } from "../content/coachVoice";
import { localDateIso } from "../utils/dates";
import { sanitizeCoachCards } from "../../functions/_shared/coachMessages.js";

// jsdom has no canvas, so the real downscale resolves null and no preview
// would ever render here.
const downscaleMock = vi.hoisted(() => vi.fn(async () => "QUJD"));
vi.mock("../utils/imageDownscale", () => ({ downscaleImage: downscaleMock }));
vi.mock("@sentry/react", () => ({ captureMessage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const MACROS = { cal: 1750, protein: 140, carbs: 160, fat: 55 };
const TOTALS = { cal: 520, p: 42, c: 55, f: 16 };
const PROFILE = { first_name: "QA" };

const CARD = {
  kind: "meal",
  name: "Chicken bowl",
  title: "Chicken bowl",
  tag: COACH_COPY.sourceBank,
  source: "bank",
  cal: 430,
  p: 45,
  c: 30,
  f: 12,
  servings: 1,
  reason: "Gets protein into range. Fits everything else.",
};

function panelProps(props = {}) {
  return {
    profile: PROFILE,
    macros: MACROS,
    totals: TOTALS,
    entries: [],
    plannedMeals: [],
    mealHistoryByDate: {},
    customMeals: [],
    ...props,
  };
}

function renderPanel(props = {}) {
  return render(<CoachPanel {...panelProps(props)} />);
}

const cardTitles = () => screen.queryAllByTestId("coach-card-title").map((n) => n.textContent);

/** Cards on the most recent coach reply — earlier ones stay in the thread. */
function latestCardTitles() {
  const turns = [...document.querySelectorAll("[data-coach-turn='coach']")].reverse();
  for (const turn of turns) {
    const titles = [...turn.querySelectorAll("[data-testid='coach-card-title']")].map((node) => node.textContent);
    if (titles.length) return titles;
  }
  return [];
}

function expectDistinctMealCount(names, { min = 2, max = 3 } = {}) {
  const bases = names.map((name) => String(name || "").replace(/\s·\s.*$/, "").toLowerCase());
  expect(bases.length).toBeGreaterThanOrEqual(min);
  expect(bases.length).toBeLessThanOrEqual(max);
  expect(new Set(bases).size).toBe(bases.length);
}

describe("the coach answers on the device", () => {
  it("tells her Callie can read the chat before she types", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    const note = await screen.findByTestId("coach-callie-reads");
    expect(note.textContent).toBe(COACH_COPY.callieReads);
    const scroller = document.querySelector("[data-coach-scroll]");
    const composer = screen.getByLabelText(COACH_COPY.placeholder);
    expect(scroller.contains(note)).toBe(true);
    expect(note.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has already answered by the time she gets there", async () => {
    const postCoach = vi.fn();
    const onLoadThread = vi.fn(async () => []);
    renderPanel({ postCoach, onLoadThread });

    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(postCoach).not.toHaveBeenCalled();
  });

  it("shows today's thread instead when there is one to come back to", async () => {
    const onLoadThread = vi.fn(async () => [
      { id: "r1", role: "mama", body: "what should I eat", kind: "text", payload: null },
      { id: "r2", role: "coach", body: "Earlier answer.", kind: "text", payload: null },
    ]);
    renderPanel({ postCoach: vi.fn(), onLoadThread });

    await screen.findByText("Earlier answer.");
    expect(cardTitles()).toHaveLength(0);
  });

  it("drops replayed My meals cards that were deleted from live custom meals", async () => {
    const onLoadThread = vi.fn(async () => [
      {
        id: "r2",
        role: "coach",
        body: "Earlier answer.",
        kind: "cards",
        payload: {
          cards: [
            {
              kind: "meal",
              id: "deleted-1",
              name: "Rosemary crackers",
              title: "Rosemary crackers",
              source: "my",
              tag: "My meals",
              cal: 200,
              p: 8,
              c: 20,
              f: 8,
              servings: 1,
              reason: "Fits.",
            },
            {
              kind: "meal",
              id: "live-1",
              name: "Live custom meal",
              title: "Live custom meal",
              source: "my",
              tag: "My meals",
              cal: 210,
              p: 22,
              c: 12,
              f: 9,
              servings: 1,
              reason: "Fits.",
            },
          ],
        },
      },
    ]);
    renderPanel({
      postCoach: vi.fn(),
      onLoadThread,
      customMeals: [{ id: "live-1", name: "Live custom meal", cal: 210, p: 22, c: 12, f: 9 }],
    });

    await screen.findByText("Earlier answer.");
    expect(screen.queryByText("Rosemary crackers")).toBeNull();
    expect(screen.getByText("Live custom meal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.lighter }));
    await waitFor(() => expect(cardTitles().length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("Rosemary crackers")).toBeNull();
  });

  it("drops a My meal from the open thread when she deletes it", async () => {
    const onLoadThread = vi.fn(async () => [
      {
        id: "r2",
        role: "coach",
        body: "Earlier answer.",
        kind: "cards",
        payload: {
          cards: [
            {
              kind: "meal",
              id: "deleted-1",
              name: "Rosemary crackers",
              title: "Rosemary crackers",
              source: "my",
              tag: "My meals",
              cal: 200,
              p: 8,
              c: 20,
              f: 8,
              servings: 1,
              reason: "Fits.",
            },
            {
              kind: "meal",
              name: "Sheet Pan Chicken with Sweet Potato",
              title: "Sheet Pan Chicken with Sweet Potato",
              source: "new",
              tag: "Built for what's left",
              knowsYou: "Usually breakfast",
              basedOn: "Sheet Pan Chicken with Sweet Potato",
              cal: 440,
              p: 45,
              c: 35,
              f: 14,
              servings: 1,
              reason: "Fits.",
            },
            {
              kind: "meal",
              name: "Sheet pan chicken",
              title: "Sheet pan chicken",
              source: "bank",
              tag: COACH_COPY.sourceBank,
              cal: 440,
              p: 45,
              c: 35,
              f: 14,
              servings: 1,
              reason: "Fits.",
            },
            {
              kind: "meal",
              id: "live-1",
              name: "Live custom meal",
              title: "Live custom meal",
              source: "my",
              tag: "My meals",
              cal: 210,
              p: 22,
              c: 12,
              f: 9,
              servings: 1,
              reason: "Fits.",
            },
            {
              kind: "meal",
              id: "sausage",
              name: "Sausage, egg + whites scramble",
              title: "Sausage, egg + whites scramble",
              source: "my",
              tag: "My meals",
              cal: 420,
              p: 36,
              c: 20,
              f: 18,
              servings: 1,
              reason: "Fits.",
            },
          ],
        },
      },
    ]);
    const saved = [
      { id: "deleted-1", name: "Rosemary crackers", cal: 200, p: 8, c: 20, f: 8 },
      { id: "sheet", name: "Sheet Pan Chicken with Sweet Potato", cal: 440, p: 45, c: 35, f: 14 },
      { id: "live-1", name: "Live custom meal", cal: 210, p: 22, c: 12, f: 9 },
      { id: "sausage", name: "Sausage, egg + whites scramble", cal: 420, p: 36, c: 20, f: 18 },
    ];
    const stillSaved = saved.filter((meal) => meal.id !== "sheet" && meal.id !== "deleted-1");
    const view = renderPanel({ onLoadThread, customMeals: saved });
    await screen.findByText("Rosemary crackers");
    expect(cardTitles()).toContain("Rosemary crackers");

    view.rerender(
      <CoachPanel {...panelProps({
        onLoadThread,
        customMeals: stillSaved,
      })}
      />,
    );
    expect(screen.queryByText("Rosemary crackers")).toBeNull();
    expect(cardTitles()).toContain("Sheet Pan Chicken with Sweet Potato");
    expect(screen.getByText("Sheet Pan Chicken with Sweet Potato")).toBeTruthy();
    expect(stillSaved.map((meal) => meal.name)).toEqual([
      "Live custom meal",
      "Sausage, egg + whites scramble",
    ]);
  });

  it("does not ask for another meal when the day is already logged", async () => {
    renderPanel({
      onLoadThread: async () => [],
      entries: [
        { slot: "breakfast", name: "Eggs" },
        { slot: "lunch", name: "Salad" },
        { slot: "dinner", name: "Steak" },
        { slot: "snack", name: "Yogurt" },
      ],
      totals: { cal: 1650, p: 130, c: 92, f: 66 },
    });
    await screen.findByText(COACH_COPY.title);
    expect(document.body.textContent).toContain(COACH_COPY.openerDone);
    expect(screen.queryByText(/Looking for a .+ idea\?/)).toBeNull();
    expect(screen.queryByText(COACH_COPY.snackAsk)).toBeNull();
  });

  it("gives her cards for What should I eat? without calling the model", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach, onLoadThread: async () => [] });
    const opening = await waitFor(() => {
      const titles = cardTitles();
      expect(titles.length).toBeGreaterThan(0);
      return titles.length;
    });

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askEat }));

    await waitFor(() => expect(latestCardTitles().length).toBeGreaterThan(0));
    expect(opening).toBeGreaterThanOrEqual(2);
    expect(opening).toBeLessThanOrEqual(3);
    expectDistinctMealCount(latestCardTitles());
    expect(cardTitles().length).toBeGreaterThan(opening);
    expect(postCoach).not.toHaveBeenCalled();
  });

  it("silences a stock fit line on an open thread and keeps a plate-tied why", async () => {
    renderPanel({
      onLoadThread: async () => [
        {
          id: "r2",
          role: "coach",
          body: "Earlier plate.",
          kind: "cards",
          payload: {
            cards: [
              {
                kind: "meal",
                name: "Sheet pan chicken",
                title: "Sheet pan chicken",
                source: "bank",
                tag: COACH_COPY.sourceBank,
                cal: 440,
                p: 45,
                c: 35,
                f: 14,
                servings: 1,
                reason: COACH_COPY.reasonGets,
              },
              {
                kind: "meal",
                name: "Turkey meatballs",
                title: "Turkey meatballs",
                source: "bank",
                tag: COACH_COPY.sourceBank,
                cal: 420,
                p: 40,
                c: 22,
                f: 16,
                servings: 1,
                reason: COACH_COPY.reasonFits,
                knowsYou: "One of your usuals at dinner",
              },
              {
                kind: "meal",
                name: "Turkey meatballs + rice",
                title: "Turkey meatballs + rice",
                source: "bank",
                tag: COACH_COPY.sourceBank,
                cal: 470,
                p: 36,
                c: 67,
                f: 6,
                servings: 1,
                reason: COACH_COPY.proteinOverMuch,
                proteinNote: COACH_COPY.proteinOverMuch,
              },
            ],
          },
        },
      ],
    });

    await screen.findByText("Sheet pan chicken");
    expect(screen.getByText("Turkey meatballs")).toBeTruthy();
    expect(screen.getByText("Turkey meatballs + rice")).toBeTruthy();
    expect(document.body.textContent).not.toContain(COACH_COPY.reasonGets);
    expect(document.body.textContent).not.toContain(COACH_COPY.reasonFits);
    expect(document.body.textContent).not.toContain(COACH_COPY.proteinOverMuch);
    expect(document.body.textContent).not.toContain("Hits protein and keeps fat in range");
    expect(document.body.textContent).not.toContain("more protein than you need");
    expect(document.body.textContent).not.toContain("Keep fat in range");
    const whys = screen.getAllByTestId("coach-card-why").map((node) => node.textContent);
    expect(whys.some((why) => /chicken/i.test(why))).toBe(true);
    expect(whys.every((why) => !/skipped a meal|hormonal|cortisol/i.test(why))).toBe(true);
    expect(document.body.textContent).not.toContain("One of your usuals at dinner");
  });

  it("opens on dinner after lunch when the clock is evening", async () => {
    const evening = new Date("2026-10-01T04:07:00.000Z");
    renderPanel({
      now: evening,
      onLoadThread: async () => [],
      entries: [{ slot: "lunch", name: "Salad" }],
    });
    await screen.findByText(COACH_COPY.title);
    expect(document.body.textContent).toMatch(/Dinner · \d+ cal/);
    expect(document.body.textContent).not.toContain(COACH_COPY.openerLead);
    expect(document.body.textContent).not.toContain("Looking for a dinner idea?");
    expect(document.body.textContent).not.toContain(COACH_COPY.reasonGets);
    expect(document.body.textContent).not.toContain(COACH_COPY.reasonFits);
    expect(document.body.textContent).not.toContain(COACH_COPY.proteinOverMuch);
    expect(document.body.textContent).not.toContain("more protein than you need");
    expect(document.body.textContent).not.toMatch(/Holding /);
    expect(document.body.textContent).not.toContain("Looking for a breakfast idea?");
    expect(document.body.textContent).not.toMatch(/Breakfast ·/);
    expect(document.body.textContent).not.toMatch(/keep fat in its band/i);
    expect(document.body.textContent).not.toMatch(/plenty of room/i);
    expect(document.body.textContent).not.toMatch(/you need about \d+g of protein/i);
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(cardTitles().length).toBeGreaterThanOrEqual(2);
    expect(cardTitles().length).toBeLessThanOrEqual(3);
    expect(new Set(cardTitles().map((name) => name.replace(/\s·\s.*$/, "").toLowerCase())).size).toBe(cardTitles().length);
    const whys = screen.getAllByTestId("coach-card-why").map((node) => node.textContent);
    expect(whys).toHaveLength(cardTitles().length);
    for (const why of whys) {
      expect(why.length).toBeLessThan(180);
      expect(why).not.toMatch(/skipped a meal|hormonal|cortisol|keep fat in its band|you need about/i);
      expect(why).toMatch(/chicken|halibut|turkey|salmon|eggs|rice|tortilla|yogurt|oat/i);
    }
  });

  it("replays a three-card bank dump as one plate, one swap, and a food why", async () => {
    const lead = `${COACH_COPY.skipNotice} You need about 129g of protein tonight. ${COACH_COPY.plenty}`;
    renderPanel({
      onLoadThread: async () => [{
        id: "r2",
        role: "coach",
        body: lead,
        kind: "cards",
        payload: {
          cards: [
            { kind: "meal", name: "Pulled chicken tacos", title: "Pulled chicken tacos", source: "bank", tag: COACH_COPY.sourceBank, cal: 450, p: 35, c: 40, f: 14, servings: 1, reason: COACH_COPY.reasonGets },
            { kind: "meal", name: "Halibut + rice", title: "Halibut + rice", source: "bank", tag: COACH_COPY.sourceBank, cal: 455, p: 44, c: 50, f: 7, servings: 1, reason: COACH_COPY.reasonFits },
            { kind: "meal", name: "Turkey meatballs + rice", title: "Turkey meatballs + rice", source: "bank", tag: COACH_COPY.sourceBank, cal: 470, p: 36, c: 67, f: 6, servings: 1, reason: COACH_COPY.proteinOverMuch },
          ],
        },
      }],
    });
    await screen.findByText("Pulled chicken tacos");
    expectDistinctMealCount(cardTitles());
    expect(cardTitles()).toContain("Pulled chicken tacos");
    expect(document.body.textContent).toContain("I noticed you skipped a meal");
    expect(document.body.textContent).not.toMatch(/129g|keep fat in its band|plenty of room|you need about/i);
    const dumpWhys = screen.getAllByTestId("coach-card-why").map((node) => node.textContent);
    expect(dumpWhys.some((why) => /chicken|tortilla/i.test(why))).toBe(true);
    expect(dumpWhys.every((why) => !/skipped a meal|hormonal|cortisol|blunted metabolism/i.test(why))).toBe(true);
    expect(screen.getByRole("button", { name: "Photo of my fridge" })).toBeTruthy();
  });

  it("paints a stored Berry smoothie whose reason was blank", async () => {
    renderPanel({
      onLoadThread: async () => [{
        id: "r2",
        role: "coach",
        body: `${COACH_COPY.skipNotice} ${COACH_COPY.skipBreakfastHint}`,
        kind: "cards",
        payload: {
          cards: [{
            kind: "meal",
            name: "Berry protein smoothie",
            title: "Berry protein smoothie",
            source: "bank",
            tag: COACH_COPY.sourceBank,
            cal: 270,
            p: 28,
            c: 34,
            f: 4,
            servings: 1,
            reason: "",
            knowsYou: "Usually breakfast",
            ingredients: ["salt", "oil"],
          }],
        },
      }],
    });
    await screen.findByText("Berry protein smoothie");
    expect(screen.getByTestId("coach-card-why").textContent).toBe(
      "Protein powder, frozen berries, and medium banana.",
    );
    expect(document.body.textContent).toContain("I noticed you skipped a meal");
  });

  it("logs tonight as dinner, not the breakfast the clock already passed", async () => {
    const onLogCard = vi.fn(async () => true);
    renderPanel({
      onLogCard,
      onLoadThread: async () => [],
      entries: [{ slot: "lunch", name: "Salad" }],
    });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await waitFor(() => expect(cardTitles().length).toBeGreaterThanOrEqual(2));
    const logs = screen.getAllByRole("button", { name: COACH_COPY.logIt });
    fireEvent.click(logs[logs.length - 1]);
    await waitFor(() => expect(onLogCard).toHaveBeenCalled());
    expect(onLogCard.mock.calls.at(-1)[0].slot).toBe("dinner");
  });

  it("stamps a model dinner she named, even when the model called it breakfast", async () => {
    const onLogCard = vi.fn(async () => true);
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Chicken and rice tonight.",
      meals: [{ name: "Chicken and rice", cal: 380, p: 34, c: 28, f: 12, slot: "breakfast" }],
    }));
    renderPanel({
      postCoach,
      onLogCard,
      onLoadThread: async () => [],
      entries: [{ slot: "lunch", name: "Salad" }],
    });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat tonight if I only have chicken and rice" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText("Chicken and rice tonight.");
    expect(postCoach.mock.calls[0][0].slot).toBe("dinner");
    const logs = screen.getAllByRole("button", { name: COACH_COPY.logIt });
    fireEvent.click(logs[logs.length - 1]);
    await waitFor(() => expect(onLogCard).toHaveBeenCalled());
    const card = onLogCard.mock.calls.at(-1)[0];
    expect(card.name).toMatch(/Chicken and rice/);
    expect(card.slot).toBe("dinner");
  });

  it("answers the same question typed, still without the model", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat for dinner?" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(postCoach).not.toHaveBeenCalled();
  });

  it("says this is a beta and what it is for", async () => {
    renderPanel({ onLoadThread: async () => [] });
    await screen.findByText(COACH_COPY.title);
    expect(screen.getByText(COACH_COPY.betaLabel)).toBeTruthy();
    expect(screen.getByText(COACH_COPY.betaNote)).toBeTruthy();
    expect(COACH_COPY.betaNote).toMatch(/next meal/i);
    expect(COACH_COPY.betaNote).toMatch(/Callie/);
    expect(COACH_COPY.betaNote).not.toMatch(/\bAI\b|model|prompt/i);
  });

  it("sends a question it can't answer itself to the model", async () => {
    const postCoach = vi.fn(async () => ({ ok: true, reply: "Grilled, not fried, and ask for the sauce on the side.", meals: [] }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I only have chicken and rice, what can I make" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await waitFor(() => expect(postCoach).toHaveBeenCalledTimes(1));
    expect(postCoach.mock.calls[0][0]).toMatchObject({
      mode: "ask",
      text: "I only have chicken and rice, what can I make",
    });
    expect(postCoach.mock.calls[0][0].context).toMatchObject({
      eaten: [],
      snackCount: 1,
    });
    await screen.findByText("Grilled, not fried, and ask for the sauce on the side.");
  });

  it("does not repeat a card she has already turned down", async () => {
    renderPanel({ postCoach: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askEat }));
    const first = await waitFor(() => {
      const titles = cardTitles();
      expect(titles.length).toBeGreaterThan(0);
      return titles;
    });

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.notThese }));
    await waitFor(() => {
      const next = latestCardTitles();
      expect(next.length).toBeGreaterThan(0);
      expect(next.every((title) => !first.includes(title))).toBe(true);
    });
    expect(first.every((title) => cardTitles().includes(title))).toBe(true);
  });
});

describe("what isn't the coach's goes to Callie", () => {
  it("hands the deflected question over with her own words in it", async () => {
    const onAskCallie = vi.fn();
    const postCoach = vi.fn();
    renderPanel({ postCoach, onAskCallie });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "why has the scale not moved in two weeks" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(COACH_DEFLECT.weight.line);
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "why has the scale not moved in two weeks",
    }));
    expect(onAskCallie).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: COACH_DEFLECT.weight.cta }));
    expect(onAskCallie).toHaveBeenCalledWith("why has the scale not moved in two weeks");
  });

  it("refuses the ones that matter without spending a request", async () => {
    const ordinary = [
      ["can I lower my calories", COACH_DEFLECT.ranges.line],
      ["when does my plan end", COACH_DEFLECT.admin.line],
      ["what workout should I do today", COACH_DEFLECT.offTopic.line],
    ];

    for (const [question, line] of ordinary) {
      const postCoach = vi.fn();
      renderPanel({ postCoach });

      fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), { target: { value: question } });
      fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

      await screen.findByText(line);
      expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
        mode: "ask",
        text: question,
      }));
      cleanup();
    }

    const postCoach = vi.fn();
    renderPanel({ postCoach });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I've been dizzy since this morning" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.medical.line);
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "I've been dizzy since this morning",
      localDate: localDateIso(),
    }));
    expect(COACH_DEFLECT.medical.line).toBe(
      "That's one for Callie, not me, and I don't want you waiting on it. Message her now.",
    );
    expect(COACH_DEFLECT.medical.line).not.toMatch(/call your doctor/i);
    expect(COACH_DEFLECT.emergency.line).toMatch(/call 911/);
    expect(COACH_DEFLECT.emergency.cta).toBe("Message Callie too");

    cleanup();
    const guiltCoach = vi.fn();
    renderPanel({ postCoach: guiltCoach });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I feel awful about what I ate" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.care.line);
    expect(guiltCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "I feel awful about what I ate",
      localDate: localDateIso(),
    }));
  });

  it("does not prepend the supply line when she only mentions nursing", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Eggs and toast.",
      meals: [{ name: "Eggs and toast", cal: 310, p: 18, c: 22, f: 14, desc: "Eggs and toast." }],
    }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat, I'm nursing" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findAllByText("Eggs and toast.");
    expect(screen.queryByText(COACH_COPY.nursingPreface)).toBeNull();
    expect(screen.queryByText(COACH_DEFLECT.supply.line)).toBeNull();
  });

  it("answers the next meal, then hands the guilt to Callie", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Chicken and rice.",
      meals: [],
      aside: "care",
    }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat for dinner, I feel awful about what I ate" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText("Chicken and rice.");
    await screen.findByText(COACH_DEFLECT.care.line);
    expect(screen.getByRole("button", { name: COACH_DEFLECT.care.cta })).toBeTruthy();
  });

  it("hands a supply question to Callie instead of answering around it", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat for breakfast if I'm nursing, will it affect my supply" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(COACH_DEFLECT.supply.line);
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "what should I eat for breakfast if I'm nursing, will it affect my supply",
      requestId: expect.any(String),
    }));
    expect(screen.queryByRole("button", { name: COACH_COPY.send })).toBeTruthy();
  });

  it("answers eating-out and skip-dinner in Callie's words, without a request", async () => {
    const postCoach = vi.fn();
    const onAppendMessage = vi.fn();
    renderPanel({ postCoach, onAppendMessage });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "should I skip dinner, I'm way over" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(COACH_COPY.teachNeverSkip);
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "should I skip dinner, I'm way over",
    }));

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "should I skip dinner, I'm way over" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    expect(screen.getByText(COACH_COPY.teachNeverSkipAgain)).toBeTruthy();
    expect(screen.getAllByText(COACH_COPY.teachNeverSkip)).toHaveLength(1);
    expect(COACH_COPY.teachNeverSkipAgain).not.toBe(COACH_COPY.teachNeverSkip);
    expect(postCoach).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "should I skip dinner, I'm way over" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.again.line);
    expect(postCoach).toHaveBeenCalledTimes(3);
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "should I skip dinner, I'm way over",
      escalate: "stuck",
      localDate: localDateIso(),
    }));
    const coachRecords = onAppendMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.role === "coach");
    expect(coachRecords.filter((message) => message.template === "local.teach")).toHaveLength(0);
    expect(coachRecords.some((message) => message.kind === "deflect" || message.template === "local.text")).toBe(false);
  });

  it("sends a pasted menu link to be read, and shows only what comes back", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "From the page: Chicken Taco Salad. Order what's printed, and ask for dressing or sauce on the side if it's creamy.",
      meals: [],
      mealSource: "menu",
    }));
    renderPanel({ postCoach });

    const ask = "https://www.itsjane.com/location/jane-on-fillmore/ Can you tell me what to eat from this menu";
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: ask },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(/From the page: Chicken Taco Salad/);
    expect(postCoach).toHaveBeenCalledTimes(1);
    expect(postCoach.mock.calls[0][0].mode).toBe("ask");
    expect(postCoach.mock.calls[0][0].text).toContain("itsjane.com");
    expect(screen.queryByText(COACH_COPY.teachMenuLink)).toBeNull();
    expect(screen.queryByText(/Jane Salad/i)).toBeNull();
  });

  it("asks for a photo when she says from this menu and pastes no link", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what can I eat from this menu" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(COACH_COPY.teachMenuLink);
    expect(postCoach).not.toHaveBeenCalled();
  });

  it("answers Italian and In-N-Out in her words, and sends Chipotle to the model", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Chicken, fajita veggies, and a little rice.",
      meals: [],
    }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I am going out to eat tonight for Italian. What can I eat?" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_COPY.teachItalian);
    expect(postCoach).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm going out to eat at inn n out. What should I get?" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_COPY.teachInNOut);
    expect(postCoach).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm going to Chipotle, what should I order" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText("Chicken, fajita veggies, and a little rice.");
    expect(postCoach).toHaveBeenCalledTimes(1);
  });

  it("skips the log-ahead sentence when she is not logging", async () => {
    renderPanel({ postCoach: vi.fn() });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "is pizza ok and I won't log this" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_COPY.teachRealFood);
    expect(document.body.textContent).not.toMatch(/log it ahead/);
  });

  it("does not say she skipped a meal when nothing is logged tonight", async () => {
    renderPanel({
      now: new Date("2026-09-05T01:30:00.000Z"),
      entries: [],
      totals: { cal: 0, p: 0, c: 0, f: 0 },
      onLoadThread: async () => [],
    });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toContain("I noticed you skipped a meal");
  });

  it("sends already-suggested names, including the model's last plates", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Turkey skillet tonight.",
      meals: [{ name: "Turkey skillet", cal: 430, p: 40, c: 28, f: 14, servings: 1 }],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    const firstPlate = cardTitles()[0];

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm tired, something easy with chicken" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText("Turkey skillet tonight.");
    expect(postCoach).toHaveBeenCalledTimes(1);
    expect(postCoach.mock.calls[0][0].context.alreadySuggested).toContain(firstPlate);
    expect(postCoach.mock.calls[0][0].context.turnedDown).toEqual([]);

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "something else easy, I'm still tired" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await waitFor(() => expect(postCoach).toHaveBeenCalledTimes(2));
    expect(postCoach.mock.calls[1][0].context.alreadySuggested).toContain("Turkey skillet");
    expect(postCoach.mock.calls[1][0].context.alreadySuggested).toContain(firstPlate);
    expect(postCoach.mock.calls[1][0].context.turnedDown).toEqual([]);
  });

  it("fills local plates when a text-only reply comes back with no cards", async () => {
    const postCoach = vi.fn(async () => ({ ok: true, reply: "", meals: [] }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm tired, something easy with chicken" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await waitFor(() => expect(latestCardTitles().length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText(COACH_COPY.cantSeeIt)).toBeNull();
  });

  it("only marks plates as turned down after she dismisses them", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Eggs and toast.",
      meals: [{ name: "Eggs and toast", cal: 420, p: 32, c: 28, f: 16, servings: 1 }],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    const firstPlate = cardTitles()[0];

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.notThese }));
    await waitFor(() => expect(cardTitles().some((name) => name !== firstPlate)).toBe(true));

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "something easy with chicken" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await waitFor(() => expect(postCoach).toHaveBeenCalledTimes(1));
    expect(postCoach.mock.calls[0][0].context.turnedDown).toContain(firstPlate);
    expect(postCoach.mock.calls[0][0].context.alreadySuggested).toContain(firstPlate);
  });
});

describe("coach card save contract", () => {
  it("stays idle when the log write returns undefined", async () => {
    const onLog = vi.fn(async () => undefined);
    render(<CoachMealCard card={CARD} onLog={onLog} />);

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.logIt }));

    await waitFor(() => expect(screen.getByText(COACH_COPY.logFailed)).toBeTruthy());
    expect(screen.getByRole("button", { name: COACH_COPY.logIt })).toBeTruthy();
    expect(screen.queryByText(COACH_COPY.loggedShort)).toBeNull();
  });

  it("stays idle when the log write returns false", async () => {
    const onLog = vi.fn(async () => false);
    render(<CoachMealCard card={CARD} onLog={onLog} />);

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.logIt }));

    await waitFor(() => expect(screen.getByText(COACH_COPY.logFailed)).toBeTruthy());
    expect(screen.queryByText(COACH_COPY.loggedShort)).toBeNull();
  });

  it("does not log twice while the first write is in flight", async () => {
    let resolveLog;
    const onLog = vi.fn(() => new Promise((resolve) => { resolveLog = resolve; }));
    render(<CoachMealCard card={CARD} onLog={onLog} />);

    const log = screen.getByRole("button", { name: COACH_COPY.logIt });
    fireEvent.click(log);
    fireEvent.click(log);
    expect(onLog).toHaveBeenCalledTimes(1);

    resolveLog(true);
    await waitFor(() => expect(screen.getByText(COACH_COPY.loggedShort)).toBeTruthy());
  });

  it("labels a coach-built meal as an estimate and a bank meal as neither", () => {
    const { rerender } = render(<CoachMealCard card={{ ...CARD, source: "menu" }} onLog={vi.fn()} />);
    expect(screen.getByText(COACH_COPY.estimateNote)).toBeTruthy();

    rerender(<CoachMealCard card={CARD} onLog={vi.fn()} />);
    expect(screen.queryByText(COACH_COPY.estimateNote)).toBeNull();
  });
});

describe("the coach only appears when it can help", () => {
  it("says so rather than guessing when her ranges aren't approved", () => {
    renderPanel({ macros: null });
    expect(screen.getByText(/unlocks once Callie approves/i)).toBeTruthy();
    expect(within(document.body).queryByRole("button", { name: COACH_COPY.askEat })).toBeNull();
  });
});

/**
 * A menu she photographs is tall and mostly white paper. As a plain flex child
 * it got squashed to a one-pixel sliver against the "Menu ready" line, so the
 * shot she just took looked like nothing had attached at all.
 */
describe("the photo she attached", () => {
  it("stays a square she can see, not a sliver", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    const file = new File(["x"], "menu.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    const img = await screen.findByAltText("Menu photo");
    expect(img.style.flexShrink).toBe("0");
    expect(img.style.flexBasis).toBe("44px");
    expect(img.style.border).not.toBe("");
  });

  it("lets her reach the photo library, not only the camera", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    const input = document.querySelector('input[type="file"]');
    expect(input.getAttribute("accept")).toBe("image/*");
    // `capture` sends iOS straight to the camera with no way back to a menu
    // she photographed earlier.
    expect(input.hasAttribute("capture")).toBe(false);
  });

  it("says the photo chips open a photo", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    expect(screen.getByRole("button", { name: "Photo of the menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo of my fridge" })).toBeTruthy();
    expect(screen.getByRole("button", { name: COACH_COPY.askKitchen })).toBeTruthy();
  });

  it("puts her own words in her bubble, not the chip's instruction", async () => {
    const postCoach = vi.fn(async () => ({ ok: true, reply: "Go for the salmon.", meals: [] }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    const file = new File(["x"], "menu.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    await screen.findByAltText("Menu photo");
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText("I'm eating out — here's the menu");
    expect(screen.queryByText("Photo of the menu", { selector: "div" })).toBeNull();
  });

  it("renders fallback plates when a photo comes back with cards", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Here's a next one.",
      meals: [{ name: "Turkey skillet", cal: 430, p: 40, c: 28, f: 14, servings: 1 }],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    const file = new File(["x"], "menu.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    await screen.findByAltText("Menu photo");
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText("Here's a next one.");
    expect(cardTitles().some((title) => title.includes("Turkey skillet"))).toBe(true);
    expect(screen.queryByText(COACH_COPY.cantSeeIt)).toBeNull();
  });

  it("drops a server peanut plate when her profile says peanuts", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Toast and peanut butter.",
      meals: [
        { name: "Toast and peanut butter", cal: 250, p: 10, c: 26, f: 12, desc: "Toast and peanut butter." },
        { name: "Rice and fruit", cal: 280, p: 6, c: 62, f: 1, desc: "Plain rice and fruit." },
      ],
    }));
    renderPanel({
      postCoach,
      profile: { ...PROFILE, allergens: ["peanuts"] },
      onLoadThread: async () => [],
    });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I only have toast, what can I make" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(/Rice and fruit|Here are a few/);
    expect(cardTitles().some((title) => /peanut/i.test(title))).toBe(false);
  });

  it("keeps a kitchen photo in her bubble and asks for home cooking", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "From what you have.",
      mealSource: "kitchen",
      meals: [
        { name: "Turkey skillet", cal: 430, p: 40, c: 28, f: 14, desc: "Ground turkey, peppers, and rice." },
        { name: "Yogurt bowl", cal: 280, p: 22, c: 30, f: 6, desc: "Greek yogurt, berries, and oats." },
      ],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askKitchen }));
    const file = new File(["x"], "fridge.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    await screen.findByAltText("Kitchen photo");
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "this is what's in my kitchen, what can i make tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await waitFor(() => expect(postCoach).toHaveBeenCalled());
    expect(postCoach.mock.calls[0][0].mode).toBe("kitchen");
    expect(screen.getAllByAltText("Kitchen photo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("this is what's in my kitchen, what can i make tonight")).toBeTruthy();
    expect(screen.queryByText(COACH_COPY.sourceMenu)).toBeNull();
    expect(screen.queryByText(COACH_COPY.seeOrder)).toBeNull();
  });

  it("renders cards that come back on a 429", async () => {
    const postCoach = vi.fn(async () => ({
      ok: false,
      status: 429,
      error: "rate_limited",
      message: "That's all the thinking I've got for today. Here's Turkey skillet.",
      meals: [{ name: "Turkey skillet", cal: 430, p: 40, c: 28, f: 14, servings: 1 }],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm tired, something easy with chicken" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(/That's all the thinking I've got for today/);
    expect(cardTitles().some((title) => title.includes("Turkey skillet"))).toBe(true);
  });
});

/**
 * The composer was sticky inside the shell's scroller, and the shell's padding
 * below it stayed a live window: 20px of cards could be watched sliding under
 * the composer on the way back up the thread. It sits outside the scrolling
 * area now, the same way Messages does it, so there is no strip to leak
 * through and nothing to pin.
 */
describe("the conversation scrolls, the composer does not", () => {
  it("keeps the composer out of the scrolling area", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    const scroller = document.querySelector("[data-coach-scroll]");
    expect(scroller.style.overflowY).toBe("auto");

    const composer = screen.getByLabelText(COACH_COPY.placeholder).closest("div").parentElement;
    expect(scroller.contains(composer)).toBe(false);
    expect(composer.style.flexShrink).toBe("0");
    // Sticky is what created the strip. It must not come back.
    expect(composer.style.position).toBe("");
  });

  it("puts the thread inside the scrolling area", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));

    const scroller = document.querySelector("[data-coach-scroll]");
    const card = screen.getByText(cardTitles()[0]);
    expect(scroller.contains(card)).toBe(true);
  });
});

/**
 * The app renders under StrictMode, which runs an effect, tears it down and
 * runs it again. Both halves of the open — answering, and coming back to
 * today's thread — went missing under it while every plain-render test here
 * stayed green, so the double-invoke has its own tests.
 */
describe("opening the coach twice over, the way React does", () => {
  const renderStrict = (props = {}) => render(
    <StrictMode>
      <CoachPanel
        profile={PROFILE}
        macros={MACROS}
        totals={TOTALS}
        entries={[]}
        plannedMeals={[]}
        mealHistoryByDate={{}}
        customMeals={[]}
        {...props}
      />
    </StrictMode>,
  );

  it("still answers on open", async () => {
    renderStrict({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
  });

  it("still comes back to today's thread", async () => {
    renderStrict({
      postCoach: vi.fn(),
      onLoadThread: async () => [
        { id: "r1", role: "mama", body: "what should I eat", kind: "text", payload: null },
        { id: "r2", role: "coach", body: "Earlier answer.", kind: "text", payload: null },
      ],
    });
    await screen.findByText("Earlier answer.");
  });

  it("answers once, not once per pass", async () => {
    const onAppendMessage = vi.fn();
    renderStrict({ postCoach: vi.fn(), onLoadThread: async () => [], onAppendMessage });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(onAppendMessage).toHaveBeenCalledTimes(1);
  });

  it("answers once her ranges arrive, even a paint late", async () => {
    // Stable across the rerender, the way App.jsx's useCallback is. A fresh
    // one each render would re-run the effect for the wrong reason and the
    // test would pass without proving anything.
    const onLoadThread = async () => [];
    const postCoach = vi.fn();
    const tree = (macros) => (
      <StrictMode>
        <CoachPanel
          profile={PROFILE}
          macros={macros}
          totals={TOTALS}
          entries={[]}
          plannedMeals={[]}
          mealHistoryByDate={{}}
          customMeals={[]}
          postCoach={postCoach}
          onLoadThread={onLoadThread}
        />
      </StrictMode>
    );

    const { rerender } = render(tree(null));
    expect(cardTitles()).toHaveLength(0);

    rerender(tree(MACROS));
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
  });
});

describe("pairCoachThread", () => {
  it("keeps each reply next to the question that produced it", () => {
    const rows = [
      { id: "m2", role: "mama", body: "second", requestId: "b" },
      { id: "c1", role: "coach", body: "first answer", requestId: "a" },
      { id: "m1", role: "mama", body: "first", requestId: "a" },
      { id: "c2", role: "coach", body: "second answer", requestId: "b" },
    ];
    expect(pairCoachThread(rows).map((row) => row.id)).toEqual(["m2", "c2", "m1", "c1"]);
  });

  it("falls back to arrival order for old rows without a request id", () => {
    const rows = [
      { id: "m1", role: "mama", body: "first" },
      { id: "c2", role: "coach", body: "second answer" },
      { id: "m2", role: "mama", body: "second" },
      { id: "c1", role: "coach", body: "first answer" },
    ];
    expect(pairCoachThread(rows).map((row) => row.id)).toEqual(["m1", "c2", "m2", "c1"]);
  });
});

describe("priority pass: persist, crisis, reload, load error", () => {
  it("keeps a sized title after a sanitized save and reload, and leaves a deleted My meal gone", async () => {
    const saved = sanitizeCoachCards([
      {
        id: "deleted-1",
        name: "Rosemary crackers",
        title: "Rosemary crackers",
        source: "my",
        tag: "My meals",
        servings: 1,
        cal: 200,
        p: 8,
        c: 20,
        f: 8,
        reason: "Fits.",
      },
      {
        id: "bank-1",
        name: "Halibut + rice",
        title: "Halibut + rice · 2 servings",
        source: "bank",
        tag: COACH_COPY.sourceBank,
        basedOn: "Halibut + rice",
        servings: 2,
        cal: 910,
        p: 88,
        c: 100,
        f: 14,
        reason: "Fits tonight.",
      },
    ]);
    expect(saved[1].title).toBe("Halibut + rice · 2 servings");
    const onLoadThread = vi.fn(async () => [
      {
        id: "r2",
        role: "coach",
        body: "Earlier answer.",
        kind: "cards",
        payload: { cards: saved },
      },
    ]);
    renderPanel({
      postCoach: vi.fn(),
      onLoadThread,
      customMeals: [{ id: "live-1", name: "Live custom meal" }],
    });
    await screen.findByText("Earlier answer.");
    expect(screen.queryByText("Rosemary crackers")).toBeNull();
    expect(screen.getByTestId("coach-card-title").textContent).toBe("Halibut + rice · 2 servings");
  });

  it("persists her question with a request id so the answer stays paired", async () => {
    const onAppendMessage = vi.fn();
    const postCoach = vi.fn();
    renderPanel({ postCoach, onAppendMessage });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "will this affect my milk supply" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.supply.line);
    expect(onAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: "mama",
      body: "will this affect my milk supply",
      payload: null,
      requestId: expect.any(String),
    }));
  });

  it("offers Remove once the insert returns an id", async () => {
    let n = 0;
    const onAppendMessage = vi.fn(async () => ({ id: `saved-${++n}` }));
    const onHideMessage = vi.fn(async () => true);
    renderPanel({ postCoach: vi.fn(), onAppendMessage, onHideMessage });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "will this affect my milk supply" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.supply.line);
    await waitFor(() => expect(screen.getAllByRole("button", { name: COACH_COPY.removeMessage }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: COACH_COPY.removeMessage }).at(-1));
    await waitFor(() => expect(onHideMessage).toHaveBeenCalledWith([expect.stringMatching(/^saved-\d+$/)]));
  });

  it("reports a failed crisis note to Sentry and still shows the emergency line", async () => {
    const postCoach = vi.fn(async () => ({ ok: false, status: 502 }));
    renderPanel({ postCoach });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I want to die" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_EMERGENCY_LINE);
    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalled());
  });

  it("recomputes Dinner when she taps a quick ask at 6:30pm", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T15:00:00.000Z"));
    function Harness() {
      const [now, setNow] = useState(() => new Date());
      return (
        <CoachPanel
          {...panelProps({
            now,
            onClockRefresh: (instant) => setNow(instant),
            onLoadThread: async () => [],
          })}
        />
      );
    }
    render(<Harness />);
    await screen.findByText(COACH_COPY.title);
    expect(document.body.textContent).toMatch(/Breakfast/);
    vi.setSystemTime(new Date("2026-09-05T01:30:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askEat }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Dinner · \d+ cal/));
    vi.useRealTimers();
  });

  it("shows the emergency line and Message Callie too for a crisis ask", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I want to die" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.emergency.line);
    expect(screen.getByRole("button", { name: COACH_DEFLECT.emergency.cta })).toBeTruthy();
    expect(postCoach).toHaveBeenCalledWith(expect.objectContaining({
      mode: "ask",
      text: "I want to die",
      requestId: expect.any(String),
    }));
  });

  it("retries a timeout with the same request id so it is not billed twice", async () => {
    const postCoach = vi.fn()
      .mockResolvedValueOnce({ ok: false, timeout: true, message: COACH_COPY.askTimeout })
      .mockResolvedValueOnce({ ok: true, reply: "Eggs and toast.", meals: [] });
    renderPanel({ postCoach });
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what can I make with leftover chicken" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    expect(await screen.findByText(COACH_COPY.askTimeout)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.retryAsk }));
    await screen.findByText("Eggs and toast.");
    expect(postCoach).toHaveBeenCalledTimes(2);
    expect(postCoach.mock.calls[0][0].requestId).toBe(postCoach.mock.calls[1][0].requestId);
    expect(postCoach.mock.calls[0][0].text).toBe("what can I make with leftover chicken");
  });

  it("shows a retry when today's thread fails to load", async () => {
    const onLoadThread = vi.fn(async () => {
      throw new Error("network");
    });
    renderPanel({ postCoach: vi.fn(), onLoadThread });
    expect(await screen.findByText(COACH_COPY.loadFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: COACH_COPY.retryLoad })).toBeTruthy();
    expect(cardTitles()).toHaveLength(0);
  });

  it("keeps earlier cards when the next reply arrives", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Later plates.",
      meals: [
        { name: "Turkey skillet", cal: 430, p: 40, c: 28, f: 14, desc: "Turkey and peppers." },
        { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, desc: "Salmon and rice." },
      ],
    }));
    renderPanel({
      postCoach,
      onLoadThread: async () => [
        {
          id: "c1",
          role: "coach",
          body: "Earlier.",
          kind: "cards",
          payload: {
            cards: [
              { name: "Pulled chicken tacos", title: "Pulled chicken tacos", source: "bank", tag: COACH_COPY.sourceBank, cal: 450, p: 35, c: 40, f: 14, servings: 1, reason: "Chicken and tortillas." },
              { name: "Halibut + rice", title: "Halibut + rice", source: "bank", tag: COACH_COPY.sourceBank, cal: 455, p: 44, c: 50, f: 7, servings: 1, reason: "Halibut and rice." },
            ],
          },
        },
      ],
    });
    await screen.findByText("Pulled chicken tacos");
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), { target: { value: "what can I make with leftover turkey and rice" } });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText("Later plates.");
    expect(screen.getByText("Pulled chicken tacos")).toBeTruthy();
    expect(cardTitles().some((title) => title.includes("Turkey skillet"))).toBe(true);
  });

  it("hands a purge question to Callie with no calorie line on the cards", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I've been making myself throw up after meals" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.disordered.line);
    expect(latestCardTitles().length).toBeGreaterThanOrEqual(2);
    const latestTurn = [...document.querySelectorAll("[data-coach-turn='coach']")].at(-1);
    expect(latestTurn?.textContent).not.toMatch(/\d+ cal ·/);
    expect(screen.queryByText(COACH_DISORDERED_LINE_NOTED)).toBeNull();
  });

  it("shows the noted disordered line only when the pin write succeeded", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      deflect: "disordered",
      noted: true,
      meals: [
        { name: "Rice and fruit", cal: 0, p: 0, c: 0, f: 0, hideMacros: true, desc: "Rice and fruit." },
        { name: "Cucumber and rice", cal: 0, p: 0, c: 0, f: 0, hideMacros: true, desc: "Cucumber and rice." },
      ],
    }));
    renderPanel({ postCoach, onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I only eat once a day so I lose faster" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DISORDERED_LINE_NOTED);
    expect(screen.queryByText(COACH_DEFLECT.disordered.line)).toBeNull();
  });

  it("hides numbers on careful cards in no-logging mode", async () => {
    renderPanel({ postCoach: vi.fn(), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "I'm not logging. should I take ibuprofen" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_DEFLECT.medication.line);
    expect(latestCardTitles().length).toBeGreaterThanOrEqual(2);
    const latestTurn = [...document.querySelectorAll("[data-coach-turn='coach']")].at(-1);
    expect(latestTurn?.textContent).not.toMatch(/\d+ cal ·/);
  });

  it("fills breakfast plates on a coffee teach that also asks for food, without a coach Remove", async () => {
    renderPanel({ postCoach: vi.fn(), onHideMessage: vi.fn(async () => true), onLoadThread: async () => [] });
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "can i have coffee while nursing? what should i eat with it in the morning" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));
    await screen.findByText(COACH_COPY.teachCoffee);
    expectDistinctMealCount(latestCardTitles());
    expect(latestCardTitles().join(" ")).toMatch(/egg|yogurt|toast|sausage|pancake|oat/i);
    expect(screen.queryByText(COACH_COPY.nursingPreface)).toBeNull();
    const removes = screen.queryAllByRole("button", { name: COACH_COPY.removeMessage });
    expect(removes).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\bRemove\b/);
  });

  it("removes a saved message through the hide RPC", async () => {
    const onHideMessage = vi.fn(async () => true);
    const onLoadThread = vi.fn(async () => [
      { id: "mama-1", role: "mama", body: "what should I eat", kind: "text", payload: null },
      { id: "coach-1", role: "coach", body: "Earlier answer.", kind: "text", payload: null },
    ]);
    renderPanel({ postCoach: vi.fn(), onLoadThread, onHideMessage });
    await screen.findByText("Earlier answer.");
    fireEvent.click(screen.getAllByRole("button", { name: COACH_COPY.removeMessage })[0]);
    await waitFor(() => expect(onHideMessage).toHaveBeenCalledWith(["mama-1"]));
    await waitFor(() => expect(screen.queryByText("what should I eat")).toBeNull());
  });
});
