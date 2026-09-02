import { CONFIG, hasPublicUrl } from "../config";
import { T, F, FD } from "../theme/tokens";
import { RECIPES, PANTRY_ITEMS, PANTRY_GROUPS } from "../content/data";
import { addDaysIso, fmtRange, formatLongDay, isTodayIso, weekdayKey, wkStartOf } from "../utils/dates";
import { Shell, Card, Chip, Btn, RangeBand, rangeState } from "../components/ui";
import { MealSlotFilterBar } from "../components/MealSlotFilterBar";
import { formatRangeProgress } from "../utils/rangeProgress";
import { MealLogCard } from "../components/MealLogCard";
import { MealRecipeCard } from "../components/MealRecipeCard";
import { WaterLogCard } from "../components/WaterLogCard";
import { GoalsCard } from "../components/GoalsCard";
import { ProgressCharts } from "../components/ProgressCharts";
import { WeighInCard } from "../components/WeighInCard";
import { HomeScreenTip } from "../components/HomeScreenTip";
import { NotificationsTip } from "../components/NotificationsTip";
import { MondayVoiceDropBanner } from "../components/MondayVoiceDropBanner";
import { AppUpdateBanner } from "../components/AppUpdateBanner";
import { LoggableMealRow } from "../components/LoggableMealRow";
import { MyMealsAddSheet } from "../components/MyMealsAddSheet";
import { WeekPlanner } from "../components/WeekPlanner";
import { FoodPrefsEditor } from "../components/FoodPrefsEditor";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { TechHelpFooter } from "../components/TechHelpFooter";
import { MessagesPanel } from "../components/MessagesPanel";
import { mealToCard } from "../content/recipeDetails";
import { countPlannedMeals, targetBands } from "../utils/weekPlan";
import {
  filterMealsByRemaining,
  formatRoomLeft,
  roomLeftFromTotals,
} from "../utils/eatingOutImpact";
import {
  filterMealsByQuery,
  isMealsDecideFilter,
  isMealsTabSlotFilter,
  MEALS_DECIDE_FILTER,
  MEALS_TAB_SECTIONS,
  MEALS_TAB_SLOT_FILTERS,
  mealMatchesQuery,
  uniqueMealsByName,
} from "../utils/mealSearch";
import { db } from "../db/db";
import { guessSlotFromTime, normalizeSlot } from "../utils/mealSlots";
import { applySlotDraft, customMealId, customMealKey, slotOnlySavePayload } from "../utils/customMeals";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function customMealSavedSlot(meal) {
  return normalizeSlot(meal?.slot || meal?.cat);
}

function tapUnlessMoved(onTap, threshold = 10) {
  let x = 0;
  let y = 0;
  return {
    onPointerDown: (e) => {
      x = e.clientX;
      y = e.clientY;
    },
    onClick: (e) => {
      if (Math.abs(e.clientX - x) > threshold || Math.abs(e.clientY - y) > threshold) {
        e.preventDefault();
        return;
      }
      onTap(e);
    },
  };
}

const MyMealLogRow = memo(function MyMealLogRow({
  meal,
  draftSlot,
  savedSlot,
  onSlotDraft,
  onLog,
  onRemove,
  onSaveIngredients,
}) {
  const idRef = useRef(customMealId(meal));
  const key = customMealKey({ id: idRef.current || meal.id, name: meal.name });
  const handleDraft = useCallback((next) => {
    onSlotDraft(key, next, savedSlot);
  }, [key, savedSlot, onSlotDraft]);
  return (
    <LoggableMealRow
      meal={meal}
      slotValue={draftSlot}
      via="custom"
      accent
      onLog={onLog}
      onRemove={onRemove}
      onSlotDraftChange={handleDraft}
      onSaveIngredients={onSaveIngredients}
    />
  );
});

/** Portal to body — Shell overflow traps position:fixed unless the bar leaves the scroll box. */
function SaveAllDock({ children }) {
  const [bottom, setBottom] = useState(72);
  useEffect(() => {
    const el = document.querySelector(".mam-tabbar");
    if (!el) {
      setBottom(0);
      return undefined;
    }
    const sync = () => setBottom(Math.ceil(el.getBoundingClientRect().height));
    sync();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-my-meals-save-all
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom,
        zIndex: 40,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{
        pointerEvents: "auto",
        maxWidth: 560,
        width: "100%",
        padding: "0 16px 8px",
        boxSizing: "border-box",
      }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ClientApp({
  tab, setTab,
  profile, macros,
  totals, waterOz,
  estimateBusy, estimate,
  analyzePhoto, analyzeText, confirmEstimate, discardEstimate,
  logManualMeal, logRecipe, todayLog, deleteMealEntry, updateMealEntry,
  mealLogDate, mealLogWeekStart, mealLogsByDate, selectMealLogDate, changeMealWeek,
  waterLogsByDate, waterBusy, onAddWater, onUndoWater, onChangeBottleOz,
  viewWk, setViewWk, curWk, editPast, setEditPast,
  checksByWeek, toggleCheck, goalItems = [],
  onAddCustomGoal, onUpdateCustomGoal, onArchiveCustomGoal,
  adherenceFor, progWeekNum, earliestWk, programStartWeek = null,
  weighins, logWeighin, deleteWeighin, weeklyRate, trends,
  macroHistory, waterHistory = [],
  mealFilter, setMealFilter,
  mealPlanMode = "default",
  publishedPlan = null,
  customMeals = [],
  onSaveCustomMeal,
  onDeleteCustomMeal,
  onEstimateRefine,
  onEstimateRecipe,
  weekPlanDays = [],
  weekPlanSource = "manual",
  weekPlanWeekStart,
  weekPlanSaving = false,
  weekPlanSuggestBusy = false,
  planMealsForLogDate = [],
  logFlash = "",
  onWeekPlanChange,
  onChangeWeekPlanWeek,
  onHomescreenTipDismissed,
  onSuggestAiWeek,
  onMealIdea,
  onSaveFoodPrefs,
  onOpenDecide,
  userId = null,
  unreadMessages = 0,
  onUnreadMessagesChange,
}) {
  const [pantryGroup, setPantryGroup] = useState("all");
  const [mealQuery, setMealQuery] = useState("");
  const [slotFilterOpen, setSlotFilterOpen] = useState(false);
  const [fitsRemainingOnly, setFitsRemainingOnly] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [myMealsAddOpen, setMyMealsAddOpen] = useState(false);
  const [pendingSlots, setPendingSlots] = useState({});
  const pendingSlotsRef = useRef(pendingSlots);
  const [saveAllBusy, setSaveAllBusy] = useState(false);
  const [saveAllNote, setSaveAllNote] = useState("");
  const personalized = mealPlanMode === "personalized" && publishedPlan?.days?.length;
  const flatPersonalized = personalized
    ? publishedPlan.days.flatMap((d) => (d.meals || []).map((m) => mealToCard(m)))
    : [];
  const dayBands = targetBands(macros);
  const remainingRoom = roomLeftFromTotals(totals, dayBands).remaining;
  const canFilterFits = Boolean(macros && remainingRoom);
  const applyFitsFilter = (list) => (
    fitsRemainingOnly && remainingRoom ? filterMealsByRemaining(list, remainingRoom) : list
  );
  const pantryVisible = applyFitsFilter((pantryGroup === "all"
    ? PANTRY_ITEMS
    : PANTRY_ITEMS.filter((item) => item.group === pantryGroup)
  ).filter((item) => mealMatchesQuery(item, mealQuery)));
  const bankSource = personalized ? uniqueMealsByName(flatPersonalized) : RECIPES;
  const prevTabRef = useRef(tab);
  const crossedToMeals = tab === "meals" && prevTabRef.current !== "meals";
  if (prevTabRef.current !== tab) prevTabRef.current = tab;
  // Same-paint Decide when crossing into Meals — do not setState during render
  // (that updates the parent while ClientApp is rendering). openTab / the
  // first-mount effect sync mealFilter after the event.
  const viewFilter = crossedToMeals ? MEALS_DECIDE_FILTER : mealFilter;

  const isBankFilter = viewFilter === "All meals"
    || viewFilter === "Breakfast"
    || viewFilter === "Lunch"
    || viewFilter === "Dinner"
    || viewFilter === "Snack"
    || viewFilter === "Treats";
  const mealsSlotValue = isMealsTabSlotFilter(viewFilter)
    ? viewFilter
    : viewFilter === "My meals"
      ? "My meals"
      : "All meals";
  const showMealsSearch = isBankFilter || viewFilter === "My meals" || viewFilter === "Pantry";
  const onDecideHome = isMealsDecideFilter(viewFilter);
  const decideSlotAsk = ({
    breakfast: "Know what breakfast is yet? I'll size it to what's left.",
    lunch: "Know what lunch is yet? I'll size it to what's left.",
    dinner: "Know what dinner is yet? I'll size it to what's left.",
    snack: "Know what a snack is yet? I'll size it to what's left.",
  })[guessSlotFromTime()] || "I'll size this slot to what's left today.";
  const openDecideExperience = () => {
    if (onOpenDecide) onOpenDecide();
    else setTab("today");
  };
  const visibleBank = applyFitsFilter(bankSource.filter((m) => {
    if (viewFilter !== "All meals" && (m.cat || "") !== viewFilter) return false;
    return mealMatchesQuery(m, mealQuery);
  }));
  const visibleCustomMeals = applyFitsFilter(filterMealsByQuery(customMeals, mealQuery));
  const pendingSlotCount = Object.keys(pendingSlots).length;

  const draftSlotFor = (meal) => pendingSlots[customMealKey(meal)] ?? customMealSavedSlot(meal);

  const writePendingSlots = (next) => {
    pendingSlotsRef.current = next;
    setPendingSlots(next);
  };

  const setMealSlotDraft = useCallback((key, nextSlot, savedSlot) => {
    if (!key) return;
    setSaveAllNote("");
    const next = applySlotDraft(pendingSlotsRef.current, key, nextSlot, savedSlot);
    if (next === pendingSlotsRef.current) return;
    writePendingSlots(next);
  }, []);

  const landedOnMealsRef = useRef(false);
  useEffect(() => {
    if (tab !== "meals") {
      landedOnMealsRef.current = false;
      return;
    }
    if (landedOnMealsRef.current) return;
    landedOnMealsRef.current = true;
    setMealFilter(MEALS_DECIDE_FILTER);
    setMealQuery("");
    setSlotFilterOpen(false);
    setFitsRemainingOnly(false);
    setMyMealsAddOpen(false);
  }, [tab, setMealFilter]);

  const openTab = (nextTab) => {
    if (nextTab === "meals") {
      landedOnMealsRef.current = false;
      setMealFilter(MEALS_DECIDE_FILTER);
      setMealQuery("");
      setSlotFilterOpen(false);
      setFitsRemainingOnly(false);
      setMyMealsAddOpen(false);
    }
    setTab(nextTab);
  };

  const persistCustomMealSlot = (meal, slot) => {
    const payload = slotOnlySavePayload(meal, slot);
    if (!payload) return null;
    return onSaveCustomMeal?.(payload, { keepOrder: true, slotOnly: true });
  };

  const saveAllMyMealSlots = async () => {
    if (saveAllBusy || !pendingSlotCount) return;
    const entries = Object.entries(pendingSlots);
    if (!entries.length) return;
    setSaveAllBusy(true);
    setSaveAllNote("");
    const confirmed = [];
    let failed = false;
    // Sequential + id-only so parallel name upserts cannot retag the wrong row.
    for (const [key, slot] of entries) {
      const meal = customMeals.find((m) => customMealKey(m) === key);
      if (!meal || !customMealId(meal)) {
        failed = true;
        continue;
      }
      try {
        const saved = await persistCustomMealSlot(meal, slot);
        if (saved != null && saved !== false) confirmed.push({ key, slot });
        else failed = true;
      } catch {
        failed = true;
      }
    }
    const next = { ...pendingSlotsRef.current };
    for (const { key, slot } of confirmed) {
      if (next[key] === slot) delete next[key];
    }
    writePendingSlots(next);
    const remaining = Object.keys(next).length;
    if (failed) {
      setSaveAllNote("Couldn't save some slots — try again");
    } else if (remaining === 0) {
      setSaveAllNote("Saved");
      window.setTimeout(() => {
        setSaveAllNote((note) => (note === "Saved" ? "" : note));
      }, 2000);
    }
    setSaveAllBusy(false);
  };
  const searchingMeals = Boolean(String(mealQuery || "").trim());
  const fitsEmptyHint = fitsRemainingOnly
    ? " Nothing here fits your remaining macros — turn the filter off to browse everything."
    : "";
  const plannedCount = countPlannedMeals(weekPlanDays);
  const hi = (n, d = 10) => n + d;
  const hasElectrolytes = hasPublicUrl(CONFIG.FULLSCRIPT_ELECTROLYTES);
  const hasSleep = hasPublicUrl(CONFIG.FULLSCRIPT_SLEEP);
  const hasDigestion = hasPublicUrl(CONFIG.FULLSCRIPT_DIGESTION);
  const hasAnySupport = hasElectrolytes || hasSleep || hasDigestion;
  const viewingToday = isTodayIso(mealLogDate || todayLog?.date);
  const todayWeekday = weekdayKey();
  const pLo = macros?.protein ?? 0;
  const pHi = hi(pLo);
  const cLo = macros?.carbs ?? 0;
  const cHi = hi(cLo);
  const fLo = macros?.fat ?? 0;
  const fHi = hi(fLo);
  const calLo = macros?.cal ?? 0;
  const calHi = calLo + 150;
  const pSt = rangeState(totals?.p, pLo, pHi);
  const cSt = rangeState(totals?.c, cLo, cHi);
  const fSt = rangeState(totals?.f, fLo, fHi);
  const calSt = rangeState(totals?.cal, calLo, calHi);
  const calProgress = formatRangeProgress(totals?.cal, calLo, calHi, " cal");
  const anyOver = [pSt, cSt, fSt, calSt].includes("over");
  const daysWithEntries = Object.fromEntries(
    Object.entries(mealLogsByDate || {}).map(([d, list]) => [d, (list || []).length > 0]),
  );
  const mealEarliestWeek = (() => {
    const fromChecks = earliestWk || wkStartOf();
    const floor = addDaysIso(wkStartOf(), -7 * 52);
    return fromChecks < floor ? fromChecks : floor;
  })();
  const tabBar = (
    <nav
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
        padding: "12px 12px 4px",
        maxWidth: 560,
        margin: "0 auto",
        boxSizing: "border-box",
        width: "100%",
      }}
      aria-label="Main"
    >
      {[["today", "Today"], ["meals", "Meals"], ["progress", "Progress"], ["messages", "Messages"]].map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => openTab(k)}
          style={{
            fontFamily: F,
            fontSize: 13.5,
            fontWeight: 700,
            padding: "14px 14px",
            minHeight: 48,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: tab === k ? T.accentSoft : "transparent",
            color: tab === k ? T.accentDeep : T.inkSoft,
            position: "relative",
          }}
        >
          {l}
          {k === "messages" && unreadMessages > 0 && (
            <span style={{
              position: "absolute",
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              borderRadius: 99,
              background: T.accent,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "18px",
              padding: "0 5px",
              boxSizing: "border-box",
            }}
            >
              {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <Shell bottomBar={tabBar} hideBottomBar={tab === "messages" && composerFocused}>
      {tab === "today" && macros && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>
            {profile.name ? `Hi ${profile.name}.` : "Your ranges."}
          </h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
            {viewingToday
              ? "Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win."
              : `Ranges below show ${formatLongDay(mealLogDate)} — switch days in the meal log to compare.`}
          </p>

          <AppUpdateBanner />
          <MondayVoiceDropBanner />
          <HomeScreenTip
            profileDismissedAt={profile.homescreenTipDismissedAt}
            onDismissPersist={async () => {
              const result = await db.dismissHomescreenTip();
              onHomescreenTipDismissed?.(result.homescreenTipDismissedAt);
            }}
          />
          <NotificationsTip
            cohortLabel={profile.cohort_label}
            onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
          />

          {logFlash ? (
            <Card style={{ marginBottom: 10, padding: 12, background: T.sageSoft, border: "none" }}>
              <div style={{ fontSize: 13.5, color: "#3E5A46", fontWeight: 700 }}>{logFlash}</div>
            </Card>
          ) : null}

          <Card style={{ marginBottom: 4 }}>
            <RangeBand label="Protein" lo={pLo} hi={pHi} eaten={totals.p} />
            <RangeBand label="Carbs" lo={cLo} hi={cHi} eaten={totals.c} />
            <RangeBand label="Fat" lo={fLo} hi={fHi} eaten={totals.f} />
            <div style={{ borderTop: `1px dashed ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                color: calSt === "over" ? T.amber : calSt === "in" ? T.sage : T.inkSoft,
                lineHeight: 1.35,
              }}>
                {!calProgress && "Calories land around"}
                {calProgress?.state === "under" && <>Calories · {Math.round(totals.cal)} · {calProgress.detail}</>}
                {calProgress?.state === "in" && <>Calories · {Math.round(totals.cal)} · ✓ · {calProgress.detail}</>}
                {calProgress?.state === "over" && <>Calories · {Math.round(totals.cal)} · {calProgress.detail}</>}
              </span>
              <span style={{ fontFamily: FD, fontSize: 22, color: calSt === "in" ? "#3E5A46" : T.ink, flexShrink: 0 }}>
                {calLo}–{calHi}
              </span>
            </div>
            {anyOver && (
              <div style={{ marginTop: 10, fontSize: 12, color: T.amber, lineHeight: 1.5 }}>
                Over on something today? Happens. Tomorrow start fresh.
              </div>
            )}
          </Card>

          <MealLogCard
            macros={macros}
            recipes={
              personalized
                ? flatPersonalized.map((m) => ({
                  name: m.name,
                  cal: m.cal,
                  p: m.p,
                  c: m.c,
                  f: m.f,
                }))
                : RECIPES
            }
            plannedMeals={planMealsForLogDate}
            customMeals={customMeals}
            busy={estimateBusy}
            estimate={estimate}
            onAnalyzePhoto={analyzePhoto}
            onAnalyzeText={analyzeText}
            onConfirmEstimate={confirmEstimate}
            onDiscardEstimate={discardEstimate}
            onManualLog={logManualMeal}
            onLogRecipe={logRecipe}
            onSaveCustomMeal={onSaveCustomMeal}
            onEstimateRefine={onEstimateRefine}
            onMealIdea={onMealIdea}
            todayLog={todayLog}
            onUpdateEntry={updateMealEntry}
            onDeleteEntry={deleteMealEntry}
            mealLogDate={mealLogDate}
            mealLogWeekStart={mealLogWeekStart}
            daysWithEntries={daysWithEntries}
            onSelectMealDate={selectMealLogDate}
            onChangeMealWeek={(ws) => changeMealWeek(ws)}
            earliestWeekStart={mealEarliestWeek}
          />

          <WaterLogCard
            date={mealLogDate || todayLog?.date}
            goalOz={waterOz}
            bottleOz={profile.bottleOz || 24}
            entries={(waterLogsByDate || {})[mealLogDate || todayLog?.date] || []}
            busy={waterBusy}
            onAdd={onAddWater}
            onUndo={onUndoWater}
            onChangeBottle={onChangeBottleOz}
            electrolytesUrl={hasElectrolytes ? CONFIG.FULLSCRIPT_ELECTROLYTES : null}
          />

          {(() => {
            const isCur = viewWk === curWk;
            const editable = isCur || editPast;
            const vChecks = checksByWeek[viewWk] || {};
            const vAdh = adherenceFor(viewWk);
            const navBtn = (dir, disabled) => (
              <button disabled={disabled} onClick={() => { setViewWk(addDaysIso(viewWk, 7 * dir)); setEditPast(false); }} style={{
                width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${disabled ? T.track : T.border}`,
                background: "#fff", color: disabled ? "#D8CCD1" : T.ink, fontSize: 16, cursor: disabled ? "default" : "pointer",
              }}>{dir < 0 ? "‹" : "›"}</button>
            );
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 4px" }}>
                  <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: 0 }}>
                    Week {progWeekNum(viewWk)} <span style={{ fontFamily: F, fontSize: 13, color: T.inkSoft }}>· {fmtRange(viewWk)}{isCur ? " · this week" : ""}</span>
                  </h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    {navBtn(-1, viewWk <= earliestWk)}
                    {navBtn(1, isCur)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px", gap: 10 }}>
                  <p style={{ fontSize: 13, color: T.inkSoft, margin: 0, flex: 1 }}>
                    {isCur
                      ? "Tap the days as you go. Add your own goals below — Callie's stay put."
                      : editPast
                        ? "Unlocked — fill in what you actually did, then lock it back up."
                        : "A look back. Forgot to log a day? Unlock it below."}
                  </p>
                  {!isCur && (
                    <button onClick={() => setEditPast(!editPast)} style={{
                      fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                      padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${T.accent}`,
                      background: editPast ? T.accent : "transparent", color: editPast ? "#fff" : T.accent,
                    }}>{editPast ? "🔓 Done editing" : "🔒 Edit this week"}</button>
                  )}
                </div>

                <GoalsCard
                  items={goalItems}
                  weekStart={viewWk}
                  isCurrentWeek={isCur}
                  editable={editable}
                  checks={vChecks}
                  waterOz={waterOz}
                  todayWeekday={todayWeekday}
                  onToggle={toggleCheck}
                  onAddCustom={onAddCustomGoal}
                  onUpdateCustom={onUpdateCustomGoal}
                  onArchiveCustom={onArchiveCustomGoal}
                />
                <div style={{ padding: "12px 4px 0", fontSize: 13, color: T.inkSoft }}>
                  {isCur ? "Week so far: " : "This week finished at: "}
                  <b style={{ color: vAdh >= 70 ? T.sage : T.ink }}>{vAdh}%</b> — progress, not perfection.
                </div>
              </>
            );
          })()}

          <Card style={{ marginTop: 12, background: T.sageSoft, border: "none" }}>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "#3E5A46" }}>
              <b>Morning sunlight + one or two walks</b> aren't extras — they steady your cortisol and your cravings. Ten minutes outside before scrolling.
            </div>
          </Card>
          <TechHelpFooter />
        </>
      )}

      {tab === "meals" && (
        <>
          {logFlash ? (
            <Card style={{ marginBottom: 10, padding: 12, background: T.sageSoft, border: "none" }}>
              <div style={{ fontSize: 13.5, color: "#3E5A46", fontWeight: 700 }}>{logFlash}</div>
            </Card>
          ) : null}

          {onDecideHome ? (
            <>
              <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>
                Help me decide
              </h2>
              <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
                Knows your prefs, your saved meals, your log.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setMealFilter(MEALS_DECIDE_FILTER);
                  setMealQuery("");
                  setSlotFilterOpen(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  margin: "4px 0 8px",
                  fontFamily: F,
                  fontSize: 13,
                  fontWeight: 700,
                  color: T.accentDeep,
                  cursor: "pointer",
                }}
              >
                Help me decide
              </button>
              {viewFilter !== "Plan" && viewFilter !== "Food prefs" && (
                <>
                  <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>
                    {viewFilter === "My meals"
                      ? "My meals"
                      : viewFilter === "Pantry"
                        ? "Pantry staples"
                        : viewFilter === "All meals"
                          ? "All meals"
                          : "Recipe bank"}
                  </h2>
                  <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
                    {viewFilter === "My meals"
                      ? "Saved meals for one-tap logging — add a few, then hop to Today when you’re ready."
                      : viewFilter === "Pantry"
                        ? "Callie’s cheat-sheet brands & staples — fruit, yogurt, bars, proteins. Tap Add to Today as many times as you need."
                        : viewFilter === "All meals"
                          ? "Search Callie’s recipes, or pick a slot. Tap Add to Today — you stay here so you can keep going."
                          : "Browse Callie’s recipes by slot. Tap Add to Today for each meal — you stay here so you can keep going."}
                  </p>
                </>
              )}
            </>
          )}

          <div
            data-meals-sections
            style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "nowrap", overflowX: "auto" }}
          >
            {MEALS_TAB_SECTIONS.map((section) => {
              const active = viewFilter === section.id;
              const label = section.id === "Plan" && plannedCount
                ? `${section.label} · ${plannedCount}`
                : section.label;
              return (
                <Chip
                  key={section.id}
                  compact
                  active={active}
                  onClick={() => {
                    setMealFilter(active ? "All meals" : section.id);
                    setMealQuery("");
                    setSlotFilterOpen(false);
                  }}
                >
                  {label}
                </Chip>
              );
            })}
          </div>

          {onDecideHome && (
            <div data-meals-decide-entry>
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, color: T.ink, lineHeight: 1.5, marginBottom: 12 }}>
                  {decideSlotAsk}
                </div>
                <Btn onClick={openDecideExperience}>Help me decide</Btn>
              </Card>
            </div>
          )}

          {showMealsSearch && (
            <>
              <MealSlotFilterBar
                query={mealQuery}
                onQueryChange={setMealQuery}
                placeholder={viewFilter === "My meals" ? "Search my meals" : "Search meals"}
                filters={MEALS_TAB_SLOT_FILTERS}
                value={mealsSlotValue}
                onChange={(next) => {
                  setMealFilter(next);
                  if (next === "Pantry") setPantryGroup("all");
                }}
                allValue={viewFilter === "My meals" ? "My meals" : "All meals"}
                open={slotFilterOpen}
                onOpenChange={setSlotFilterOpen}
                fitsActive={fitsRemainingOnly}
                onFitsChange={canFilterFits ? ((on) => setFitsRemainingOnly(Boolean(on))) : undefined}
              />
              {fitsRemainingOnly && remainingRoom && (
                <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "-4px 0 12px", lineHeight: 1.45 }}>
                  Room left after today’s log: {formatRoomLeft(remainingRoom)} to your day high.
                </p>
              )}
            </>
          )}

          {viewFilter === "Plan" && (
            <ErrorBoundary
              name="WeekPlanner"
              title="Plan my week hit a snag"
              message="Today, recipes, and Progress still work. Try refreshing — if it keeps happening, force-close the home-screen app and reopen, then ping Callie."
            >
              <WeekPlanner
                profile={profile}
                macros={macros}
                days={weekPlanDays}
                source={weekPlanSource}
                weekStart={weekPlanWeekStart || wkStartOf()}
                saving={weekPlanSaving}
                suggestBusy={weekPlanSuggestBusy}
                customMeals={customMeals}
                onChangeDays={onWeekPlanChange}
                onChangeWeek={onChangeWeekPlanWeek}
                onSuggestAiWeek={onSuggestAiWeek}
                onMealIdea={onMealIdea}
                onSaveCustomMeal={onSaveCustomMeal}
                onEstimateRecipe={onEstimateRecipe}
                onLog={logRecipe}
              />
            </ErrorBoundary>
          )}

          {viewFilter === "Food prefs" && (
            <FoodPrefsEditor profile={profile} onSave={onSaveFoodPrefs} />
          )}

          {viewFilter === "My meals" && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                data-add-meal=""
                {...tapUnlessMoved(() => setMyMealsAddOpen(true))}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1.5px dashed ${T.accent}`,
                  background: "#fff",
                  color: T.accentDeep,
                  fontFamily: F,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: 12,
                  touchAction: "manipulation",
                }}
              >
                ＋ Add meal
                <div style={{ fontWeight: 500, fontSize: 11.5, color: T.inkSoft, marginTop: 3 }}>
                  Create a recipe, describe a meal, or generate options
                </div>
              </button>
              {myMealsAddOpen && (
                <MyMealsAddSheet
                  macros={macros}
                  customMeals={customMeals}
                  onClose={(e) => {
                    e?.preventDefault?.();
                    e?.stopPropagation?.();
                    window.setTimeout(() => setMyMealsAddOpen(false), 0);
                  }}
                  onEstimateRecipe={onEstimateRecipe}
                  onSaveCustomMeal={onSaveCustomMeal}
                  onMealIdea={onMealIdea}
                />
              )}
              {!customMeals.length ? (
                <Card>
                  <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
                    Nothing saved yet. Tap <b style={{ color: T.ink }}>＋ Add meal</b> to paste a recipe or let AI draft one — or save from Today logging / Weekly Planner.
                  </div>
                </Card>
              ) : !visibleCustomMeals.length ? (
                <Card>
                  <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
                    {searchingMeals
                      ? `No saved meals match “${mealQuery.trim()}”.`
                      : "No saved meals in this list."}
                    {fitsEmptyHint}
                  </div>
                </Card>
              ) : (
                <>
                  {visibleCustomMeals.map((m) => {
                    const rowKey = customMealKey(m);
                    const draftSlot = draftSlotFor(m);
                    const savedSlot = customMealSavedSlot(m);
                    return (
                      <MyMealLogRow
                        key={rowKey}
                        meal={m}
                        draftSlot={draftSlot}
                        savedSlot={savedSlot}
                        onSlotDraft={setMealSlotDraft}
                        onLog={logRecipe}
                        onRemove={() => onDeleteCustomMeal?.(m.id)}
                        onSaveIngredients={async (meal) => {
                          const saved = await onSaveCustomMeal?.({
                            id: m.id,
                            name: meal.name,
                            cal: meal.cal,
                            p: meal.p,
                            c: meal.c,
                            f: meal.f,
                            serves: meal.serves,
                            ingredients: meal.ingredients,
                            slot: savedSlot || m.slot || m.cat,
                          }, { keepOrder: true });
                          if (saved != null && saved !== false) {
                            if (rowKey in pendingSlotsRef.current) {
                              const next = { ...pendingSlotsRef.current };
                              delete next[rowKey];
                              writePendingSlots(next);
                            }
                          }
                          return saved;
                        }}
                      />
                    );
                  })}
                  <div data-pending-slots={JSON.stringify(pendingSlots)} hidden />
                  {visibleCustomMeals.length > 0 ? (
                    <div aria-hidden="true" style={{ height: pendingSlotCount > 0 || saveAllNote ? 72 : 0 }} />
                  ) : null}
                  {(pendingSlotCount > 0 || saveAllNote) ? (
                    <SaveAllDock>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: T.accentSoft,
                          border: `1.5px solid ${T.accent}`,
                          boxShadow: "0 -8px 20px rgba(51, 39, 46, 0.08)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          {pendingSlotCount > 0 ? (
                            <div style={{ fontWeight: 700, fontSize: 13, color: T.accentDeep }}>
                              {pendingSlotCount === 1 ? "1 meal slot changed" : `${pendingSlotCount} meal slots changed`}
                            </div>
                          ) : null}
                          {saveAllNote ? (
                            <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginTop: pendingSlotCount ? 2 : 0 }}>
                              {saveAllNote}
                            </div>
                          ) : null}
                        </div>
                        {pendingSlotCount > 0 ? (
                          <button
                            type="button"
                            disabled={saveAllBusy}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              saveAllMyMealSlots();
                            }}
                            style={{
                              fontFamily: F,
                              fontSize: 13,
                              fontWeight: 700,
                              padding: "7px 14px",
                              borderRadius: 999,
                              border: `1.5px solid ${T.accent}`,
                              background: "#fff",
                              color: T.accentDeep,
                              cursor: saveAllBusy ? "default" : "pointer",
                              flexShrink: 0,
                              opacity: saveAllBusy ? 0.7 : 1,
                            }}
                          >
                            {saveAllBusy ? "Saving…" : "Save all"}
                          </button>
                        ) : null}
                      </div>
                    </SaveAllDock>
                  ) : null}
                </>
              )}
            </div>
          )}

          {viewFilter === "Pantry" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <Chip active={pantryGroup === "all"} onClick={() => setPantryGroup("all")}>All</Chip>
                {PANTRY_GROUPS.map((g) => (
                  <Chip key={g.id} active={pantryGroup === g.id} onClick={() => setPantryGroup(g.id)}>
                    {g.label}
                  </Chip>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
                Per-serving estimates from Callie’s brands & pantry cheat sheet. Serving sizes match the sheet.
              </p>
              {((searchingMeals || fitsRemainingOnly) && !pantryVisible.length) ? (
                <Card>
                  <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
                    {searchingMeals
                      ? `No pantry items match “${mealQuery.trim()}”. Try a name or brand, or pick All.`
                      : "No pantry items in this list."}
                    {fitsEmptyHint}
                  </div>
                </Card>
              ) : pantryVisible.map((item) => (
                <LoggableMealRow
                  key={item.name}
                  meal={item}
                  via="recipe"
                  showSlotPicker={false}
                  onLog={logRecipe}
                />
              ))}
            </div>
          )}

          {isBankFilter && (searchingMeals || fitsRemainingOnly) && !visibleBank.length && (
            <Card>
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
                {searchingMeals
                  ? `No recipes match “${mealQuery.trim()}”. Try a name or ingredient, or pick a slot.`
                  : "No recipes in this list."}
                {fitsEmptyHint}
              </div>
            </Card>
          )}

          {isBankFilter && visibleBank.map((m, idx) => (
            <MealRecipeCard key={`${m.name}-${idx}`} meal={m} onLog={logRecipe} />
          ))}
          <TechHelpFooter />
        </>
      )}

      {tab === "messages" && (
        <>
          <ErrorBoundary
            name="CustomerMessages"
            title="Messages hit a snag"
            message="Your conversations are safe. Try again here — Today and the rest of the app still work."
            resetKeys={[userId, tab]}
          >
            <MessagesPanel
              userId={userId}
              onUnreadChange={onUnreadMessagesChange}
              onComposerFocusChange={setComposerFocused}
            />
          </ErrorBoundary>
          {!composerFocused && <TechHelpFooter />}
        </>
      )}

      {tab === "progress" && (
        <>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "6px 0 14px" }}>
            Pick a day, log your weight, edit anytime — same rhythm as meal logging. The trend matters; any single number doesn't.
          </p>

          <WeighInCard
            weighins={weighins}
            goalWeight={profile.goalWeight}
            weeklyRate={weeklyRate}
            onSave={logWeighin}
            onDelete={deleteWeighin}
            earliestWeekStart={mealEarliestWeek}
          />

          <ProgressCharts
            macros={macros}
            macroHistory={macroHistory}
            waterHistory={waterHistory}
            waterGoalOz={waterOz}
            checksByWeek={checksByWeek}
            goalItems={goalItems}
            curWk={curWk}
            earliestWk={earliestWk}
            programStartWeek={programStartWeek}
          />

          {!trends.locked && trends.items?.length > 0 && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>By goal</div>
              <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
                How each habit is landing across your finished weeks — including any YOURS goals you added.
              </p>
              {trends.items.map((i) => (
                <div key={i.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ color: T.ink, fontWeight: 600 }}>{i.label}</span>
                    <span style={{ color: T.inkSoft }}>
                      {i.strength
                        ? `${i.avgSessions.toFixed(1)}× / wk (goal ${i.nTarget || 3})`
                        : `${i.pct}%`}
                    </span>
                  </div>
                  <div style={{ height: 6, background: T.track, borderRadius: 99 }}>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 99,
                        width: `${i.strength ? Math.min((i.avgSessions / (i.nTarget || 3)) * 100, 100) : i.pct}%`,
                        background: (i.strength ? i.avgSessions >= (i.nTarget || 3) : i.pct >= 70) ? T.sage : T.accent,
                      }}
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Before + after photos</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
              Week 1 and week 8: same outfit, same spot, same lighting, front and side. Faces optional. The most transformed mama in this founding group wins Callie's Gut Reset Guide.
            </div>
          </Card>

          {hasAnySupport && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Need extra support?</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                {hasSleep && <><a href={CONFIG.FULLSCRIPT_SLEEP} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Sleep support →</a><br /></>}
                {hasDigestion && <><a href={CONFIG.FULLSCRIPT_DIGESTION} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Digestion support →</a><br /></>}
                {hasElectrolytes && <a href={CONFIG.FULLSCRIPT_ELECTROLYTES} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Electrolytes →</a>}
              </div>
            </Card>
          )}
          <TechHelpFooter />
        </>
      )}
    </Shell>
  );
}
