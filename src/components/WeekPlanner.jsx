import { useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { GroceryListPanel } from "./GroceryListPanel";
import { withRecipeDetail, mealToCard } from "../content/recipeDetails";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";
import { suggestRecipesForSlot } from "../utils/suggestFromPrefs";
import {
  PLAN_DAYS,
  PLAN_SLOTS,
  SLOT_LABEL,
  emptyWeekPlan,
  defaultSampleWeek,
  normalizeWeekDays,
  countPlannedMeals,
  addMealToDay,
  removeMealById,
  replaceMealById,
  moveMeal,
  setMealQty,
  recipeToPlanMeal,
  cloneDaysToPlan,
  bankRecipesForSlot,
  sumDayTotals,
  scaledMealMacros,
  targetBands,
  dayInRange,
  dayAllInRange,
} from "../utils/weekPlan";

/**
 * Flexible week planner — start from default / blank / AI / tastes,
 * then add·remove·swap·scale servings. Desktop: drag between days.
 */
export function WeekPlanner({
  profile,
  macros,
  days,
  source,
  saving = false,
  suggestBusy = false,
  onChangeDays,
  onSuggestAiWeek,
  onSave,
  onSaveFoodPrefs,
  coachPlan = null,
  onLog,
}) {
  const planned = normalizeWeekDays(days);
  const mealCount = countPlannedMeals(planned);
  const bands = targetBands(macros);
  const [boardOpen, setBoardOpen] = useState(() => mealCount > 0 || source === "blank");
  const [activeDay, setActiveDay] = useState(PLAN_DAYS[0]);
  const [picker, setPicker] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropDay, setDropDay] = useState(null);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const groceryRef = useRef(null);
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 900px)").matches : false,
  );

  const showBoard = boardOpen || mealCount > 0;
  const hasCoach = Array.isArray(coachPlan?.days) && coachPlan.days.length > 0;
  const hasPrefs = !!(profile?.prefB || profile?.prefL || profile?.prefD);

  useEffect(() => {
    if (mealCount > 0 || source === "blank") setBoardOpen(true);
  }, [mealCount, source]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const t = window.setTimeout(() => setMessage(""), 4500);
    return () => window.clearTimeout(t);
  }, [message]);

  const applyDays = (next, nextSource = "manual") => {
    onChangeDays?.(normalizeWeekDays(next), nextSource);
  };

  const openBoard = (next, nextSource, msg) => {
    setError("");
    setBoardOpen(true);
    applyDays(next, nextSource);
    if (msg) setMessage(msg);
  };

  const startDefault = () => {
    openBoard(
      defaultSampleWeek(),
      "manual",
      "Started with Callie’s sample Mon–Sun — remove, swap, or bump servings to hit your ranges.",
    );
  };

  const startBlank = () => {
    openBoard(
      emptyWeekPlan(),
      "blank",
      "Blank week open — tap + Meal on any day to add from the bank.",
    );
  };

  const fillFromCoach = () => {
    if (!hasCoach) return;
    openBoard(cloneDaysToPlan(coachPlan.days), "coach_seed", "Started from Callie’s plan — tweak freely.");
  };

  const clearWeek = () => {
    openBoard(emptyWeekPlan(), "blank", "Cleared — still on the board so you can rebuild.");
  };

  const onAiSuggest = async () => {
    setError("");
    try {
      const result = await onSuggestAiWeek?.();
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.days) {
        openBoard(
          cloneDaysToPlan(result.days),
          "ai",
          result.summary || "AI week ready — tweak servings until the day chips go green.",
        );
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t suggest a week right now.");
    }
  };

  const openAdd = (dayKey, slot = "any") => setPicker({ day: dayKey, slot, replaceId: null });
  const openReplace = (dayKey, meal) =>
    setPicker({ day: dayKey, slot: meal.slot || "any", replaceId: meal.id });
  const closePicker = () => setPicker(null);

  const chooseRecipe = (recipe) => {
    if (!picker) return;
    const slot =
      picker.slot && picker.slot !== "any"
        ? picker.slot
        : String(recipe.cat || "snack").toLowerCase();
    const meal = recipeToPlanMeal(recipe, slot);
    if (picker.replaceId) {
      applyDays(replaceMealById(planned, picker.replaceId, meal), "manual");
    } else {
      applyDays(addMealToDay(planned, picker.day, meal), "manual");
    }
    closePicker();
  };

  const removeMeal = (mealId) => applyDays(removeMealById(planned, mealId), "manual");
  const moveToDay = (mealId, toDay) => applyDays(moveMeal(planned, mealId, toDay), "manual");
  const changeQty = (mealId, qty) => applyDays(setMealQty(planned, mealId, qty), "manual");

  const scrollToGrocery = () => {
    setGroceryOpen(true);
    window.setTimeout(() => {
      groceryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const saveWeek = async () => {
    await onSave?.();
    setMessage(
      mealCount > 0
        ? "Week saved. Grocery list below updates live as you edit — open it anytime."
        : "Week saved (still empty).",
    );
    if (mealCount > 0) scrollToGrocery();
  };

  const onDragStart = (e, mealId) => {
    setDragId(mealId);
    e.dataTransfer.setData("text/plain", mealId);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => { setDragId(null); setDropDay(null); };
  const onDayDragOver = (e, dayKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropDay(dayKey);
  };
  const onDayDrop = (e, dayKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDropDay(null);
    setDragId(null);
    if (id) moveToDay(id, dayKey);
  };

  const daysInRangeCount = bands
    ? planned.filter((d) => d.meals?.length && dayAllInRange(dayInRange(sumDayTotals(d.meals), bands))).length
    : 0;

  return (
    <div style={{ marginBottom: 18 }}>
      <Card style={{ marginBottom: 12, padding: 14, background: T.accentSoft, border: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.accentDeep, marginBottom: 4 }}>
          Meals → This week
        </div>
        <div style={{ fontFamily: FD, fontSize: 22, marginBottom: 4, color: T.ink }}>Your week planner</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: 0 }}>
          Build Mon–Sun, nudge servings until each day lands in your ranges, then shop.
          Grocery updates automatically as you add or remove meals.
        </p>
      </Card>

      <FoodPrefsEditor profile={profile} onSave={onSaveFoodPrefs} />

      {bands && (
        <Card style={{ marginBottom: 12, padding: 14, background: T.sageSoft, border: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.35, textTransform: "uppercase", color: "#3E5A46", marginBottom: 6 }}>
            Your daily ranges
          </div>
          <div style={{ fontFamily: FD, fontSize: 18, color: T.ink, lineHeight: 1.35 }}>
            {bands.calLo}–{bands.calHi} cal
            <span style={{ color: T.inkSoft, fontFamily: F, fontSize: 14 }}> · </span>
            {bands.pLo}–{bands.pHi}P
            <span style={{ color: T.inkSoft, fontFamily: F, fontSize: 14 }}> · </span>
            {bands.cLo}–{bands.cHi}C
            <span style={{ color: T.inkSoft, fontFamily: F, fontSize: 14 }}> · </span>
            {bands.fLo}–{bands.fHi}F
          </div>
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "8px 0 0", lineHeight: 1.45 }}>
            Each day on the board shows whether you’re in range. Bump servings or swap meals until the chips go green — same idea as Callie’s custom meal-plan review.
            {showBoard ? ` · ${daysInRangeCount}/7 days in range right now` : ""}
          </p>
        </Card>
      )}

      {!showBoard ? (
        <Card style={{ marginBottom: 14, padding: 16 }}>
          <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 6 }}>How do you want to start?</div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 14px" }}>
            One smart fill option: AI uses your <b style={{ color: T.ink }}>Foods I love</b> notes plus your ranges and Callie’s bank. Or start default / blank and build by hand.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Btn onClick={onAiSuggest} disabled={suggestBusy || !macros} style={{ width: "100%" }}>
              {suggestBusy ? "Suggesting…" : "Suggest my week (AI + foods I love)"}
            </Btn>
            <Btn ghost onClick={startDefault} style={{ width: "100%" }}>
              Start with default Mon–Sun
            </Btn>
            <Btn ghost onClick={startBlank} style={{ width: "100%" }}>
              Start blank — add from the bank
            </Btn>
            {hasCoach && (
              <Btn ghost onClick={fillFromCoach} style={{ width: "100%" }}>
                Use Callie’s published plan
              </Btn>
            )}
          </div>
          {!macros && (
            <div style={{ fontSize: 12.5, color: T.amber, marginTop: 12, lineHeight: 1.45 }}>
              AI unlocks after Callie approves your macros. Default / blank work now.
            </div>
          )}
          {!hasPrefs && macros && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.45 }}>
              Tip: fill <b style={{ color: T.ink }}>Foods I love</b> above before AI suggest so the week matches what you actually eat.
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 10 }}>{error}</div>}
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 12, padding: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <PillBtn accent onClick={() => openAdd(activeDay, "any")}>+ Add meal</PillBtn>
              <PillBtn onClick={onAiSuggest} disabled={suggestBusy || !macros}>
                {suggestBusy ? "Suggesting…" : "Suggest my week (AI)"}
              </PillBtn>
              <PillBtn onClick={startDefault}>Reset to default week</PillBtn>
              {hasCoach && <PillBtn onClick={fillFromCoach}>Callie’s plan</PillBtn>}
              <PillBtn onClick={clearWeek}>Clear all</PillBtn>
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>
              {mealCount} meal{mealCount === 1 ? "" : "s"} on your plan
              {bands ? ` · ${daysInRangeCount}/7 days in range` : ""}
              {wide ? " · drag cards between days" : " · use Move on a meal"}
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
              <b style={{ color: T.ink }}>Suggest my week</b> is the only AI fill — it reads Foods I love + your ranges + Callie’s recipes.
              When you + Add a meal, “Suggested for you” is a simple keyword match from the bank (no AI).
            </div>
            {message && (
              <div style={{ fontSize: 12.5, color: "#3E5A46", background: T.sageSoft, borderRadius: 10, padding: "8px 10px", marginTop: 10 }}>
                {message}
              </div>
            )}
            {error && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{error}</div>}
          </Card>

          <div ref={groceryRef}>
            <GroceryListPanel
              weekDays={planned}
              open={groceryOpen}
              onOpenChange={setGroceryOpen}
              emptyHint="Add meals to your plan — grocery updates live as you go."
              ctaLabel="View grocery list"
            />
          </div>

          {wide ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(150px, 1fr))",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 8,
              }}
            >
              {planned.map((day) => (
                <DayColumn
                  key={day.day}
                  day={day}
                  bands={bands}
                  highlight={dropDay === day.day}
                  dragId={dragId}
                  onDragOver={onDayDragOver}
                  onDrop={onDayDrop}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onAdd={(slot) => openAdd(day.day, slot)}
                  onReplace={(meal) => openReplace(day.day, meal)}
                  onRemove={removeMeal}
                  onQty={changeQty}
                  onLog={onLog}
                  showMove={false}
                />
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
                {PLAN_DAYS.map((d) => {
                  const dayRow = planned.find((x) => x.day === d) || { meals: [] };
                  const count = dayRow.meals?.length || 0;
                  const totals = sumDayTotals(dayRow.meals || []);
                  const ir = bands && count ? dayInRange(totals, bands) : null;
                  const ok = dayAllInRange(ir);
                  const active = d === activeDay;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setActiveDay(d)}
                      style={{
                        flex: "0 0 auto",
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1.5px solid ${active ? T.accent : ok ? T.sage : T.border}`,
                        background: active ? T.accentSoft : ok ? T.sageSoft : "#fff",
                        color: active ? T.accentDeep : ok ? "#3E5A46" : T.ink,
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {d}{count ? ` · ${count}` : ""}{ok ? " ✓" : ir && count ? " !" : ""}
                    </button>
                  );
                })}
              </div>
              {planned.filter((d) => d.day === activeDay).map((day) => (
                <DayColumn
                  key={day.day}
                  day={day}
                  bands={bands}
                  highlight={false}
                  dragId={null}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onAdd={(slot) => openAdd(day.day, slot)}
                  onReplace={(meal) => openReplace(day.day, meal)}
                  onRemove={removeMeal}
                  onMove={moveToDay}
                  onQty={changeQty}
                  onLog={onLog}
                  showMove
                  mobile
                />
              ))}
            </>
          )}

          <Card style={{ marginTop: 14, padding: 14 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Done planning?</div>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 12px" }}>
              Grocery already recalculates as you edit. Save locks this week in; then open the list to copy for shopping.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Btn onClick={saveWeek} disabled={saving}>
                {saving ? "Saving…" : "Save week"}
              </Btn>
              <Btn ghost onClick={scrollToGrocery} disabled={!mealCount}>
                View grocery list
              </Btn>
            </div>
          </Card>
        </>
      )}

      {picker && (
        <MealPickerModal
          profile={profile}
          day={picker.day}
          slot={picker.slot}
          replacing={!!picker.replaceId}
          onClose={closePicker}
          onPick={chooseRecipe}
        />
      )}
    </div>
  );
}

function FoodPrefsEditor({ profile, onSave }) {
  const [open, setOpen] = useState(false);
  const [prefB, setPrefB] = useState(profile?.prefB || "");
  const [prefL, setPrefL] = useState(profile?.prefL || "");
  const [prefD, setPrefD] = useState(profile?.prefD || "");
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setPrefB(profile?.prefB || "");
    setPrefL(profile?.prefL || "");
    setPrefD(profile?.prefD || "");
  }, [profile?.prefB, profile?.prefL, profile?.prefD]);

  const dirty =
    (prefB || "") !== (profile?.prefB || "")
    || (prefL || "") !== (profile?.prefL || "")
    || (prefD || "") !== (profile?.prefD || "");

  const hasAny = !!(profile?.prefB || profile?.prefL || profile?.prefD || prefB || prefL || prefD);

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setErr("");
    try {
      await onSave({ prefB, prefL, prefD });
      setSavedMsg("Saved — AI suggest and meal-picker suggestions will use these.");
      window.setTimeout(() => setSavedMsg(""), 3500);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Couldn’t save preferences.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 12, padding: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          fontFamily: F,
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontFamily: FD, fontSize: 18, color: T.ink }}>Foods I love</div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>
            {hasAny
              ? "Pre-filled from intake. AI suggest + “Suggested for you” in the meal picker both use these notes."
              : "Add what you actually like. AI suggest reads these (plus your ranges) when it builds a week."}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, flexShrink: 0 }}>
          {open ? "Hide ▴" : "Edit ▾"}
        </span>
      </button>

      {!open && hasAny && (
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.45 }}>
          {[
            profile?.prefB && `B: ${profile.prefB}`,
            profile?.prefL && `L: ${profile.prefL}`,
            profile?.prefD && `D: ${profile.prefD}`,
          ].filter(Boolean).join(" · ")}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>
            Breakfast
            <input
              style={inputStyle}
              value={prefB}
              onChange={(e) => setPrefB(e.target.value)}
              placeholder="smoothies, oatmeal, eggs…"
            />
          </label>
          <label style={labelStyle}>
            Lunch
            <input
              style={inputStyle}
              value={prefL}
              onChange={(e) => setPrefL(e.target.value)}
              placeholder="big salads, leftovers, wraps…"
            />
          </label>
          <label style={labelStyle}>
            Dinner
            <input
              style={inputStyle}
              value={prefD}
              onChange={(e) => setPrefD(e.target.value)}
              placeholder="tacos, salmon, asian flavors…"
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
            <Btn small onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save foods I love"}
            </Btn>
            {savedMsg && !dirty && (
              <span style={{ fontSize: 12.5, color: "#3E5A46" }}>{savedMsg}</span>
            )}
            {dirty && (
              <span style={{ fontSize: 12.5, color: T.inkSoft }}>Unsaved changes</span>
            )}
          </div>
          {err && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </Card>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: T.inkSoft,
  marginBottom: 10,
};

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  fontSize: 15,
  fontFamily: F,
  border: `1.5px solid ${T.border}`,
  borderRadius: 12,
  background: "#fff",
  color: T.ink,
  boxSizing: "border-box",
};

function PillBtn({ children, onClick, disabled, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F,
        fontSize: 12.5,
        fontWeight: 700,
        padding: "8px 14px",
        borderRadius: 999,
        border: `1.5px solid ${accent ? T.accent : T.border}`,
        background: accent ? T.accent : "#fff",
        color: accent ? "#fff" : T.accentDeep,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function MacroChip({ label, value, ok }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        background: ok === true ? T.sageSoft : ok === false ? T.amberSoft : T.track,
        color: ok === true ? "#3E5A46" : ok === false ? T.amber : T.inkSoft,
      }}
    >
      {label} {value}{ok === true ? " ✓" : ok === false ? " ✗" : ""}
    </span>
  );
}

function DayColumn({
  day,
  bands,
  highlight,
  dragId,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onAdd,
  onReplace,
  onRemove,
  onMove,
  onQty,
  onLog,
  showMove,
  mobile = false,
}) {
  const totals = sumDayTotals(day.meals || []);
  const ir = bands && (day.meals || []).length ? dayInRange(totals, bands) : null;
  const ok = dayAllInRange(ir);

  return (
    <div
      onDragOver={(e) => onDragOver(e, day.day)}
      onDrop={(e) => onDrop(e, day.day)}
      style={{
        background: highlight ? T.sageSoft : T.card,
        border: `1.5px solid ${highlight ? T.sage : ok ? T.sage : T.border}`,
        borderRadius: 14,
        padding: mobile ? 12 : 8,
        minHeight: mobile ? undefined : 280,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: FD, fontSize: mobile ? 22 : 16 }}>{day.day}</span>
          {ok === true && (
            <span style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>in range</span>
          )}
          {ok === false && (
            <span style={{ fontSize: 11, fontWeight: 700, color: T.amber }}>out of range</span>
          )}
        </div>
        {day.theme ? (
          <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, lineHeight: 1.3 }}>{day.theme}</div>
        ) : null}
        {(day.meals || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            <MacroChip label="cal" value={totals.cal} ok={ir?.cal} />
            <MacroChip label="P" value={`${totals.p}g`} ok={ir?.p} />
            <MacroChip label="C" value={`${totals.c}g`} ok={ir?.c} />
            <MacroChip label="F" value={`${totals.f}g`} ok={ir?.f} />
          </div>
        )}
        {bands && (day.meals || []).length > 0 && (
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 4 }}>
            Target {bands.calLo}–{bands.calHi} cal · {bands.pLo}–{bands.pHi}P · {bands.cLo}–{bands.cHi}C · {bands.fLo}–{bands.fHi}F
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(day.meals || []).map((meal) => (
          <PlanMealTile
            key={meal.id}
            meal={meal}
            dragging={dragId === meal.id}
            draggable={!mobile}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onReplace={() => onReplace(meal)}
            onRemove={() => onRemove(meal.id)}
            onQty={(q) => onQty(meal.id, q)}
            onMove={showMove ? (to) => onMove(meal.id, to) : null}
            currentDay={day.day}
            onLog={onLog}
            compact={!mobile}
          />
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <AddChip label="+ Meal" onClick={() => onAdd("any")} />
        {PLAN_SLOTS.map((slot) => (
          <AddChip key={slot} label={`+ ${SLOT_LABEL[slot]}`} onClick={() => onAdd(slot)} />
        ))}
      </div>
    </div>
  );
}

function AddChip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: F,
        fontSize: 11.5,
        fontWeight: 700,
        padding: "7px 10px",
        borderRadius: 999,
        border: `1.5px dashed ${T.border}`,
        background: "#fff",
        color: T.inkSoft,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function PlanMealTile({
  meal,
  dragging,
  draggable,
  onDragStart,
  onDragEnd,
  onReplace,
  onRemove,
  onQty,
  onMove,
  currentDay,
  onLog,
  compact,
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const slot = SLOT_LABEL[String(meal.slot || "").toLowerCase()] || "Meal";
  const qty = snapServings(meal.qty ?? 1);
  const scaled = scaledMealMacros(meal);
  // Hydrate from bank by name/basedOn — don't let empty plan arrays block ingredients
  const card = mealToCard({
    ...meal,
    basedOn: meal.basedOn || meal.name,
    ingredients: meal.ingredients?.length ? meal.ingredients : undefined,
    serving: meal.serving?.length ? meal.serving : undefined,
    steps: meal.steps?.length >= 4 ? meal.steps : undefined,
    batch: meal.batch?.length ? meal.batch : undefined,
  });
  const detail = withRecipeDetail({
    name: meal.basedOn || meal.name,
    basedOn: meal.basedOn || meal.name,
    cat: card.cat,
  });
  const serving = (card.serving?.length ? card.serving : null)
    || (detail.serving?.length ? detail.serving : null)
    || (card.ingredients?.length ? card.ingredients : null)
    || [];
  const steps = (card.steps?.length ? card.steps : null) || detail.steps || [];
  const batch = (card.batch?.length ? card.batch : null) || (detail.batch?.length ? detail.batch : null);
  const hasRecipe = serving.length > 0 || steps.length > 0 || !!meal.desc;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, meal.id)}
      onDragEnd={onDragEnd}
      style={{
        background: dragging ? T.accentSoft : "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: compact ? "10px 10px" : "12px 12px",
        cursor: draggable ? "grab" : "default",
        opacity: dragging ? 0.7 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => hasRecipe && setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: hasRecipe ? "pointer" : "default",
          fontFamily: F,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: T.accentDeep }}>
          {slot}{hasRecipe ? (open ? " · hide recipe" : " · tap for recipe") : ""}
        </div>
        <div style={{ fontSize: compact ? 13 : 14.5, fontWeight: 700, color: T.ink, lineHeight: 1.3, marginTop: 2 }}>
          {meal.name}
        </div>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
          {scaled.cal} · {scaled.p}P/{scaled.c}C/{scaled.f}F
          {qty !== 1 ? ` · ${qty}×` : ""}
        </div>
      </button>

      <div
        style={{ marginTop: 8 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>Servings</div>
        <ServingStepper value={qty} onChange={onQty} compact />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <ActionPill onClick={onReplace}>Swap</ActionPill>
        <ActionPill onClick={onRemove}>Remove</ActionPill>
        {onMove && (
          <ActionPill onClick={() => setMoveOpen((o) => !o)}>Move</ActionPill>
        )}
        {onLog && (
          <ActionPill
            accent
            onClick={() => onLog(scaleMealForLog({
              name: meal.name,
              cal: meal.cal,
              p: meal.p,
              c: meal.c,
              f: meal.f,
              via: "recipe",
            }, qty))}
          >
            + Log
          </ActionPill>
        )}
      </div>

      {moveOpen && onMove && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {PLAN_DAYS.filter((d) => d !== currentDay).map((d) => (
            <ActionPill key={d} onClick={() => { onMove(d); setMoveOpen(false); }}>{d}</ActionPill>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          {(meal.desc || card.desc) && (
            <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 10px" }}>
              {meal.desc || card.desc}
            </p>
          )}
          {batch && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Ingredients · batch cook</div>
              <IngList items={batch} />
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, margin: batch ? "10px 0 4px" : "0 0 4px" }}>
            Ingredients · {qty === 1 ? "one serving" : `${qty}× serving`}
          </div>
          <IngList items={serving} />
          {steps.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>Steps</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function IngList({ items }) {
  if (!items?.length) {
    return (
      <div style={{ fontSize: 12.5, color: T.inkSoft }}>
        No structured ingredient list for this meal yet — macros above still apply.
      </div>
    );
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
      {items.map((ing, i) => (
        <li key={i} style={{ marginBottom: 2 }}>
          <b>{ing.amount}</b> {ing.item}
        </li>
      ))}
    </ul>
  );
}

function ActionPill({ children, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1.5px solid ${accent ? T.accent : T.border}`,
        background: accent ? T.accentSoft : "#fff",
        color: T.accentDeep,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MealPickerModal({ profile, day, slot, replacing, onClose, onPick }) {
  const slotKey = slot === "any" ? "any" : slot;
  const suggested = useMemo(
    () => suggestRecipesForSlot(profile || {}, slotKey === "any" ? "snack" : slotKey, { limit: 5 }),
    [profile, slotKey],
  );
  const bank = useMemo(() => bankRecipesForSlot(slotKey), [slotKey]);
  const suggestedNames = new Set(suggested.map((s) => s.recipe.name));
  const rest = bank.filter((r) => !suggestedNames.has(r.name));
  const title =
    slotKey === "any"
      ? `${replacing ? "Swap meal" : "Add meal"} · ${day}`
      : `${replacing ? "Swap" : "Add"} ${SLOT_LABEL[slotKey] || "meal"} · ${day}`;

  const crossSuggest = useMemo(() => {
    if (slotKey !== "any") return [];
    const seen = new Set();
    const out = [];
    for (const s of PLAN_SLOTS) {
      for (const hit of suggestRecipesForSlot(profile || {}, s, { limit: 2 })) {
        if (hit.score > 0 && !seen.has(hit.recipe.name)) {
          seen.add(hit.recipe.name);
          out.push(hit);
        }
      }
    }
    return out.slice(0, 6);
  }, [profile, slotKey]);

  const showSuggest = slotKey === "any" ? crossSuggest : suggested.filter((s) => s.score > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(40, 24, 32, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 12,
      }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 18,
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 20 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>Suggested from your tastes, then Callie’s bank</div>
          </div>
          <ActionPill onClick={onClose}>Close</ActionPill>
        </div>

        {showSuggest.length > 0 && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.accentDeep, marginBottom: 8 }}>
              Suggested for you
            </div>
            {showSuggest.map(({ recipe, reason }) => (
              <PickerRow key={recipe.name} recipe={recipe} reason={reason} onPick={onPick} accent />
            ))}
          </>
        )}

        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft, margin: "14px 0 8px" }}>
          Callie&apos;s bank{slotKey !== "any" ? ` · ${SLOT_LABEL[slotKey]}` : ""}
        </div>
        {(showSuggest.length && slotKey !== "any" ? rest : bank).map((recipe) => (
          <PickerRow key={recipe.name} recipe={recipe} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function PickerRow({ recipe, reason, onPick, accent }) {
  return (
    <button
      type="button"
      onClick={() => onPick(recipe)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 12px",
        marginBottom: 8,
        borderRadius: 12,
        border: `1.5px solid ${accent ? T.accent : T.border}`,
        background: accent ? T.accentSoft : "#fff",
        cursor: "pointer",
        fontFamily: F,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, textTransform: "uppercase" }}>
        {recipe.cat}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{recipe.name}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
        {recipe.cal} cal · {recipe.p}P · {recipe.c}C · {recipe.f}F
        {reason ? ` · ${reason}` : ""}
      </div>
    </button>
  );
}
