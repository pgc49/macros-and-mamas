// @vitest-environment jsdom
/**
 * The coach's promises, held to by test:
 *
 *  - the question she asks most is answered on the device, with no network
 *  - a question that isn't the coach's is handed to Callie in her own words
 *  - a card that fails to save never looks like a logged meal
 *  - the coach doesn't hand back a card she has already turned down
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { CoachPanel } from "./CoachPanel";
import { CoachMealCard } from "./CoachMealCard";
import { COACH_COPY, COACH_DEFLECT } from "../content/coachVoice";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MACROS = { cal: 1750, protein: 140, carbs: 160, fat: 55 };
const TOTALS = { cal: 520, p: 42, c: 55, f: 16 };
const PROFILE = { first_name: "QA" };

const CARD = {
  kind: "meal",
  name: "Chicken bowl",
  title: "Chicken bowl",
  tag: "Callie's bank",
  source: "bank",
  cal: 430,
  p: 45,
  c: 30,
  f: 12,
  servings: 1,
  reason: "Gets protein into range. Fits everything else.",
};

function renderPanel(props = {}) {
  return render(
    <CoachPanel
      profile={PROFILE}
      macros={MACROS}
      totals={TOTALS}
      entries={[]}
      plannedMeals={[]}
      mealHistoryByDate={{}}
      customMeals={[]}
      {...props}
    />,
  );
}

const cardTitles = () => screen.queryAllByTestId("coach-card-title").map((n) => n.textContent);

describe("the coach answers on the device", () => {
  it("gives her cards for What should I eat? without calling the model", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach });

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askEat }));

    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
    expect(postCoach).not.toHaveBeenCalled();
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

  it("sends a question it can't answer itself to the model", async () => {
    const postCoach = vi.fn(async () => ({ ok: true, reply: "Grilled, not fried, and ask for the sauce on the side.", meals: [] }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "is Chipotle ok tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await waitFor(() => expect(postCoach).toHaveBeenCalledTimes(1));
    expect(postCoach.mock.calls[0][0]).toMatchObject({ mode: "ask", text: "is Chipotle ok tonight" });
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
    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(first.length));

    const second = cardTitles().slice(first.length);
    expect(second.length).toBeGreaterThan(0);
    for (const title of second) expect(first).not.toContain(title);
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
    expect(postCoach).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: COACH_DEFLECT.weight.cta }));
    expect(onAskCallie).toHaveBeenCalledWith("why has the scale not moved in two weeks");
  });

  it("refuses the ones that matter without spending a request", async () => {
    const cases = [
      ["I've been dizzy since this morning", COACH_DEFLECT.care.line],
      ["can I lower my calories", COACH_DEFLECT.ranges.line],
      ["when does my plan end", COACH_DEFLECT.admin.line],
      ["what workout should I do today", COACH_DEFLECT.offTopic.line],
    ];

    for (const [question, line] of cases) {
      const postCoach = vi.fn();
      renderPanel({ postCoach });

      fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), { target: { value: question } });
      fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

      await screen.findByText(line);
      expect(postCoach).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("still answers the food part when the question also touched supply", async () => {
    const postCoach = vi.fn(async () => ({
      ok: true,
      reply: "Eggs and toast with a yogurt on the side.",
      meals: [],
      aside: "supply",
    }));
    renderPanel({ postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "what should I eat for breakfast if I'm nursing, will it affect my supply" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText("Eggs and toast with a yogurt on the side.");
    expect(screen.getByText(COACH_DEFLECT.care.line)).toBeTruthy();
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
