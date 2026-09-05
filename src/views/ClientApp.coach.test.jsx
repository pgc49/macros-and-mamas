// @vitest-environment jsdom
/**
 * How the coach sits in the app: it only shows up once Callie has approved
 * her ranges, and handing a question to Callie puts her in Messages with the
 * question already typed — never sent for her, and never by a bot account.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "qa@example.com" },
    profile: { name: "QA" },
    isAdmin: false,
  }),
}));

vi.mock("../components/MessagesPanel", () => ({
  MessagesPanel: ({ initialDraft }) => <div data-testid="messages-draft">{initialDraft}</div>,
}));

import { ClientApp } from "./ClientApp";
import { COACH_COPY, COACH_DEFLECT } from "../content/coachVoice";
import { localDateIso, wkStartOf } from "../utils/dates";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => {};
// The coach only speaks about today, so the fixture has to actually be today.
const TODAY = localDateIso();
const WEEK = wkStartOf();

function renderApp(props = {}) {
  let tab = props.tab || "today";
  let draft = "";
  const setTab = vi.fn((next) => { tab = next; });
  const onAskCallie = vi.fn((text) => { draft = text; });

  const view = render(
    <MemoryRouter>
      <ClientApp
        tab={tab}
        setTab={setTab}
        profile={{ name: "QA" }}
        macros={{ protein: 140, carbs: 160, fat: 55, cal: 1750 }}
        totals={{ p: 42, c: 55, f: 16, cal: 520 }}
        waterOz={80}
        estimateBusy={false}
        estimate={null}
        analyzePhoto={noop}
        analyzeText={noop}
        confirmEstimate={noop}
        discardEstimate={noop}
        logManualMeal={noop}
        logRecipe={noop}
        todayLog={{ date: TODAY, entries: [] }}
        deleteMealEntry={noop}
        updateMealEntry={noop}
        mealLogDate={TODAY}
        mealLogWeekStart={WEEK}
        mealLogsByDate={{}}
        selectMealLogDate={noop}
        changeMealWeek={noop}
        waterLogsByDate={{}}
        waterBusy={false}
        onAddWater={noop}
        onUndoWater={noop}
        onChangeBottleOz={noop}
        viewWk={WEEK}
        setViewWk={noop}
        curWk={WEEK}
        editPast={false}
        setEditPast={noop}
        checksByWeek={{}}
        toggleCheck={noop}
        adherenceFor={() => 0}
        progWeekNum={() => 1}
        earliestWk={WEEK}
        weighins={[]}
        logWeighin={noop}
        deleteWeighin={noop}
        weeklyRate={0}
        trends={{ locked: true, items: [] }}
        macroHistory={[]}
        mealFilter="All meals"
        setMealFilter={noop}
        customMeals={[]}
        onAskCallie={onAskCallie}
        {...props}
      />
    </MemoryRouter>,
  );
  return { view, setTab, onAskCallie, getTab: () => tab, getDraft: () => draft };
}

describe("where the coach shows up", () => {
  it("adds the tab and the Today entry point once her ranges exist", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Coach" })).toBeTruthy();
    expect(screen.getByText(COACH_COPY.entryTitle)).toBeTruthy();
  });

  it("stays out of the way when Callie hasn't approved ranges yet", () => {
    renderApp({ macros: null });
    expect(screen.queryByRole("button", { name: "Coach" })).toBeNull();
    expect(screen.queryByText(COACH_COPY.entryTitle)).toBeNull();
  });

  it("keeps every tab label on one line when the coach makes five", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = Array.from(nav.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["Today", "Meals", "Coach", "Progress", "Messages"]);
    for (const button of nav.querySelectorAll("button")) {
      expect(button.style.whiteSpace).toBe("nowrap");
    }
  });

  it("gives the five tabs the width the phone has", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Main" });
    // Fixed padding left a 430px phone with 110px unused around a huddle of
    // small text in the middle. jsdom has no layout, so the contract under
    // test is that the buttons are allowed to grow.
    for (const button of nav.querySelectorAll("button")) {
      expect(button.style.flex).toBe("1 1 auto");
      expect(button.style.fontSize).toBe("13.5px");
    }
  });

  it("locks the coach's height like Messages, and leaves other tabs scrolling", () => {
    // Both chat tabs fill the leftover viewport so the composer stays put.
    // The page scroller must not scroll, or the composer goes with it.
    const { view } = renderApp({ tab: "coach" });
    expect(document.querySelector("[data-shell-content]").dataset.lockScroll).toBe("true");
    expect(document.querySelector("[data-shell-fill]")).toBeTruthy();
    view.unmount();

    renderApp({ tab: "today" });
    expect(document.querySelector("[data-shell-content]").dataset.lockScroll).toBeUndefined();
    expect(document.querySelector("[data-shell-fill]")).toBeNull();
  });

  it("opens the coach from the Today card", () => {
    const { setTab } = renderApp();
    fireEvent.click(screen.getByText(COACH_COPY.entryTitle).closest("button"));
    expect(setTab).toHaveBeenCalledWith("coach");
  });
});

describe("handing a question to Callie", () => {
  it("moves her to Messages with the question waiting in the composer", async () => {
    const postCoach = vi.fn(async () => ({ ok: true, deflect: "ranges", meals: [] }));
    const { setTab, onAskCallie } = renderApp({ tab: "coach", postCoach });

    fireEvent.change(screen.getByLabelText(COACH_COPY.placeholder), {
      target: { value: "can my calories go up" },
    });
    fireEvent.click(screen.getByRole("button", { name: COACH_COPY.send }));

    await screen.findByText(COACH_DEFLECT.ranges.line);
    fireEvent.click(screen.getByRole("button", { name: COACH_DEFLECT.ranges.cta }));

    expect(onAskCallie).toHaveBeenCalledWith("can my calories go up");
    expect(setTab).toHaveBeenCalledWith("messages");
  });

  it("puts the draft in the composer rather than sending it", () => {
    renderApp({ tab: "messages", messagesDraft: "Hi Callie — a question from the coach: can my calories go up" });
    expect(screen.getByTestId("messages-draft").textContent)
      .toBe("Hi Callie — a question from the coach: can my calories go up");
  });
});
