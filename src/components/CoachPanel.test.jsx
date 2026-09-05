// @vitest-environment jsdom
/**
 * The coach's promises, held to by test:
 *
 *  - the question she asks most is answered on the device, with no network
 *  - a question that isn't the coach's is handed to Callie in her own words
 *  - a card that fails to save never looks like a logged meal
 *  - the coach doesn't hand back a card she has already turned down
 */

import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { CoachPanel } from "./CoachPanel";
import { CoachMealCard } from "./CoachMealCard";
import { COACH_COPY, COACH_DEFLECT } from "../content/coachVoice";

// jsdom has no canvas, so the real downscale resolves null and no preview
// would ever render here.
const downscaleMock = vi.hoisted(() => vi.fn(async () => "QUJD"));
vi.mock("../utils/imageDownscale", () => ({ downscaleImage: downscaleMock }));

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

  it("gives her cards for What should I eat? without calling the model", async () => {
    const postCoach = vi.fn();
    renderPanel({ postCoach, onLoadThread: async () => [] });
    const opening = await waitFor(() => {
      const titles = cardTitles();
      expect(titles.length).toBeGreaterThan(0);
      return titles.length;
    });

    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.askEat }));

    await waitFor(() => expect(cardTitles().length).toBeGreaterThan(opening));
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
    expect(screen.queryByRole("button", { name: "What's in my kitchen" })).toBeNull();
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
