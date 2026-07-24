import { useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { GroceryListPanel } from "./GroceryListPanel";
import { withRecipeDetail, mealToCard } from "../content/recipeDetails";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";
import {
  PLAN_DAYS,
  PLAN_SLOTS,
  SLOT_LABEL,
  emptyWeekPlan,
  normalizeWeekDays,
  countPlannedMeals,
  addMealToDay,
  removeMealById,
  replaceMealById,
  moveMeal,
  setMealQty,
  recipeToPlanMeal,
  customMealToPlanMeal,
  aiIdeaToPlanMeal,
  cloneDaysToPlan,
  bankRecipesForSlot,
  sumDayTotals,
  scaledMealMacros,
  targetBands,
  dayInRange,
  dayAllInRange,
} from "../utils/weekPlan";

/**
 * Flexible week planner — empty board by default.
 * Add from Callie's bank, My meals, AI describe, or AI slot options.
 * Suggest my week (full AI fill) stays available to evaluate.
 */
export function WeekPlanner({
  profile,
  macros,
  days,
  source,
  saving = false,
  suggestBusy = false,
  customMeals = [],
  onChangeDays,
  onSuggestAiWeek,
  onMealIdea,
  onSave,
  onSaveCustomMeal,
  onSaveFoodPrefs,
  onLog,
}) {
  const planned = normalizeWeekDays(days);
  const mealCount = countPlannedMeals(planned);
  const bands = targetBands(macros);
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

  const hasPrefs = !!(profile?.prefB || profile?.prefL || profile?.prefD || profile?.prefS);

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

  const clearWeek = () => {
    setError("");
    applyDays(emptyWeekPlan(), "blank");
    setMessage("Cleared — board is empty so you can rebuild.");
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
        applyDays(cloneDaysToPlan(result.days), "ai");
        setMessage(result.summary || "AI week ready — tweak servings until the day chips go green.");
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

  const placeMeal = (meal) => {
    if (!picker) return;
    if (picker.replaceId) {
      applyDays(replaceMealById(planned, picker.replaceId, meal), "manual");
    } else {
      applyDays(addMealToDay(planned, picker.day, meal), "manual");
    }
    closePicker();
  };

  const chooseRecipe = (recipe) => {
    if (!picker) return;
    const slot =
      picker.slot && picker.slot !== "any"
        ? picker.slot
        : String(recipe.cat || "snack").toLowerCase();
    placeMeal(recipeToPlanMeal(recipe, slot));
  };

  const chooseCustom = (custom) => {
    if (!picker) return;
    const slot = picker.slot && picker.slot !== "any" ? picker.slot : "snack";
    placeMeal(customMealToPlanMeal(custom, slot));
  };

  const chooseAiMeal = async (idea, { saveToMine = false } = {}) => {
    if (!picker) return;
    const slot =
      picker.slot && picker.slot !== "any"
        ? picker.slot
        : String(idea.slot || "dinner").toLowerCase();
    const meal = aiIdeaToPlanMeal(idea, slot);
    if (saveToMine && onSaveCustomMeal) {
      await onSaveCustomMeal({
        name: meal.name,
        cal: meal.cal,
        p: meal.p,
        c: meal.c,
        f: meal.f,
      });
      setMessage(`Added to ${picker.day} and saved to My meals.`);
    } else {
      setMessage(`Added to ${picker.day}.`);
    }
    placeMeal(meal);
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
          Start empty, add meals day by day, nudge servings until each day lands in your ranges, then shop.
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
            Each day on the board shows whether you’re in range. Bump servings or swap meals until the chips go green.
            {` · ${daysInRangeCount}/7 days in range right now`}
          </p>
        </Card>
      )}

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <PillBtn accent onClick={() => openAdd(activeDay, "any")}>+ Add meal</PillBtn>
          <PillBtn onClick={onAiSuggest} disabled={suggestBusy || !macros}>
            {suggestBusy ? "Suggesting…" : "Suggest my week (AI)"}
          </PillBtn>
          <PillBtn onClick={clearWeek}>Clear all</PillBtn>
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>
          {mealCount} meal{mealCount === 1 ? "" : "s"} on your plan
          {bands ? ` · ${daysInRangeCount}/7 days in range` : ""}
          {wide ? " · drag cards between days" : " · use Move on a meal"}
        </div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
          <b style={{ color: T.ink }}>+ Add meal</b> opens Callie’s bank, My meals, or AI for that slot.
          <b style={{ color: T.ink }}> Suggest my week</b> fills the whole board from Foods I love + your ranges (optional — try it when you want).
        </div>
        {!macros && (
          <div style={{ fontSize: 12.5, color: T.amber, marginTop: 10, lineHeight: 1.45 }}>
            AI unlocks after Callie approves your macros. Bank and My meals work now.
          </div>
        )}
        {!hasPrefs && macros && (
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.45 }}>
            Tip: fill <b style={{ color: T.ink }}>Foods I love</b> above so AI options match what you actually eat.
          </div>
        )}
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

      {picker && (
        <MealPickerModal
          macros={macros}
          day={picker.day}
          slot={picker.slot}
          replacing={!!picker.replaceId}
          customMeals={customMeals}
          onClose={closePicker}
          onPickRecipe={chooseRecipe}
          onPickCustom={chooseCustom}
          onPickAi={chooseAiMeal}
          onMealIdea={onMealIdea}
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
  const [prefS, setPrefS] = useState(profile?.prefS || "");
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setPrefB(profile?.prefB || "");
    setPrefL(profile?.prefL || "");
    setPrefD(profile?.prefD || "");
    setPrefS(profile?.prefS || "");
  }, [profile?.prefB, profile?.prefL, profile?.prefD, profile?.prefS]);

  const dirty =
    (prefB || "") !== (profile?.prefB || "")
    || (prefL || "") !== (profile?.prefL || "")
    || (prefD || "") !== (profile?.prefD || "")
    || (prefS || "") !== (profile?.prefS || "");

  const hasAny = !!(profile?.prefB || profile?.prefL || profile?.prefD || profile?.prefS
    || prefB || prefL || prefD || prefS);

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setErr("");
    try {
      await onSave({ prefB, prefL, prefD, prefS });
      setSavedMsg("Saved — Suggest my week and AI meal options will use these.");
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
              ? "Pre-filled from intake. Suggest my week and AI slot options use these notes."
              : "Add what you actually like. AI uses these (plus your ranges) when it builds meals."}
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
            profile?.prefS && `S: ${profile.prefS}`,
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
          <label style={labelStyle}>
            Snacks
            <input
              style={inputStyle}
              value={prefS}
              onChange={(e) => setPrefS(e.target.value)}
              placeholder="yogurt, apple + PB, protein shake…"
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
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 2 }}>Servings to log</div>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4, lineHeight: 1.35 }}>
          Scales macros only — ingredients stay at one serving
        </div>
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
          {batch && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Ingredients · batch cook</div>
              <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 6, lineHeight: 1.4 }}>
                Full cook for the family batch.
              </div>
              <IngList items={batch} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
              Ingredients · one serving
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 6, lineHeight: 1.4 }}>
              {qty !== 1
                ? `Base recipe. Macros above are for ${qty}× to log — this list stays the written serving.`
                : batch
                  ? "What goes on the logged plate from that batch."
                  : "Base recipe amounts for one serving."}
            </div>
            <IngList items={serving} />
          </div>
          {steps.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Steps</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ol>
            </div>
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


function MealPickerModal({
  macros,
  day,
  slot,
  replacing,
  customMeals = [],
  onClose,
  onPickRecipe,
  onPickCustom,
  onPickAi,
  onMealIdea,
}) {
  const initialSlot = slot === "any" ? null : slot;
  const [view, setView] = useState("hub"); // hub | bank | mine | describe | options
  const [slotPick, setSlotPick] = useState(initialSlot);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [describeMeal, setDescribeMeal] = useState(null);
  const [optionMeals, setOptionMeals] = useState([]);
  const [saveMine, setSaveMine] = useState(true);

  const effectiveSlot = slotPick || (slot !== "any" ? slot : null);
  const bank = useMemo(
    () => bankRecipesForSlot(effectiveSlot || "any"),
    [effectiveSlot],
  );
  const title =
    effectiveSlot
      ? `${replacing ? "Swap" : "Add"} ${SLOT_LABEL[effectiveSlot] || "meal"} · ${day}`
      : `${replacing ? "Swap meal" : "Add meal"} · ${day}`;

  const goHub = () => {
    setView("hub");
    setErr("");
    setDescribeMeal(null);
    setOptionMeals([]);
    setBusy(false);
  };

  const runDescribe = async () => {
    if (!onMealIdea) return;
    const useSlot = effectiveSlot || "dinner";
    setBusy(true);
    setErr("");
    setDescribeMeal(null);
    try {
      const result = await onMealIdea({
        mode: "describe",
        slot: useSlot,
        description: description.trim(),
      });
      if (result?.error) {
        setErr(result.error);
        return;
      }
      if (result?.meal) setDescribeMeal(result.meal);
      else setErr("No meal came back — try again with a bit more detail.");
    } catch (e) {
      setErr(e.message || "Couldn’t generate that meal.");
    } finally {
      setBusy(false);
    }
  };

  const runOptions = async () => {
    if (!onMealIdea) return;
    if (!effectiveSlot) {
      setErr("Pick breakfast, lunch, dinner, or snack first — then generate options.");
      return;
    }
    setBusy(true);
    setErr("");
    setOptionMeals([]);
    try {
      const result = await onMealIdea({ mode: "options", slot: effectiveSlot });
      if (result?.error) {
        setErr(result.error);
        return;
      }
      const list = Array.isArray(result?.meals) ? result.meals : [];
      if (!list.length) {
        setErr("No options came back — try again in a moment.");
        return;
      }
      setOptionMeals(list.slice(0, 3));
    } catch (e) {
      setErr(e.message || "Couldn’t generate options.");
    } finally {
      setBusy(false);
    }
  };

  const slotChooser = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
      {PLAN_SLOTS.map((s) => (
        <ActionPill
          key={s}
          accent={effectiveSlot === s}
          onClick={() => setSlotPick(s)}
        >
          {SLOT_LABEL[s]}
        </ActionPill>
      ))}
    </div>
  );

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
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              {view === "hub"
                ? "Bank, My meals, or AI for this slot"
                : view === "bank"
                  ? "Callie’s recipe bank"
                  : view === "mine"
                    ? "Your saved macros meals"
                    : view === "describe"
                      ? "Describe what you want — AI builds one meal"
                      : "2–3 options from your tastes + Callie’s guide"}
            </div>
          </div>
          <ActionPill onClick={onClose}>Close</ActionPill>
        </div>

        {view !== "hub" && (
          <div style={{ marginBottom: 12 }}>
            <ActionPill onClick={goHub}>← Back</ActionPill>
          </div>
        )}

        {view === "hub" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!effectiveSlot && (
              <>
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 4 }}>
                  Optional: pick a slot first (needed for “Generate options”).
                </div>
                {slotChooser}
              </>
            )}
            <HubBtn
              title="Callie’s bank"
              sub="Proven recipes with ingredients for grocery"
              onClick={() => setView("bank")}
            />
            <HubBtn
              title="My meals"
              sub={customMeals.length ? `${customMeals.length} saved · macros only` : "Empty until you save one"}
              onClick={() => setView("mine")}
            />
            <HubBtn
              title="Describe a meal (AI)"
              sub="Type what you want — drops into this day with a Save to My meals option"
              disabled={!macros}
              onClick={() => { setView("describe"); setErr(""); setDescribeMeal(null); }}
            />
            <HubBtn
              title="Generate options for me (AI)"
              sub={effectiveSlot
                ? `2–3 ${SLOT_LABEL[effectiveSlot]} ideas from Foods I love`
                : "Pick a slot above, then generate 2–3 to choose from"}
              disabled={!macros}
              onClick={() => {
                if (!effectiveSlot) {
                  setErr("Pick breakfast, lunch, dinner, or snack first.");
                  return;
                }
                setView("options");
                setErr("");
                setOptionMeals([]);
              }}
            />
            {!macros && (
              <div style={{ fontSize: 12.5, color: T.amber, lineHeight: 1.45 }}>
                AI unlocks after Callie approves your macros.
              </div>
            )}
            {err && <div style={{ fontSize: 12.5, color: T.amber }}>{err}</div>}
          </div>
        )}

        {view === "bank" && (
          <>
            {!initialSlot && slotChooser}
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft, margin: "4px 0 8px" }}>
              Callie&apos;s bank{effectiveSlot ? ` · ${SLOT_LABEL[effectiveSlot]}` : ""}
            </div>
            {bank.map((recipe) => (
              <PickerRow key={recipe.name} recipe={recipe} onPick={onPickRecipe} />
            ))}
          </>
        )}

        {view === "mine" && (
          <>
            {!initialSlot && (
              <>
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 6 }}>
                  Which slot should this land in?
                </div>
                {slotChooser}
              </>
            )}
            {!customMeals.length ? (
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
                No saved meals yet. After an AI add, leave Save to My meals on — or save from Today logging.
              </div>
            ) : (
              customMeals.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPickCustom(m)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 12px",
                    marginBottom: 8,
                    borderRadius: 12,
                    border: `1.5px solid ${T.border}`,
                    background: "#fff",
                    cursor: "pointer",
                    fontFamily: F,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{m.name}</div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                    {m.cal} cal · {m.p}P · {m.c}C · {m.f}F · macros only
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {view === "describe" && (
          <>
            {!initialSlot && (
              <>
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 6 }}>Slot for this meal</div>
                {slotChooser}
              </>
            )}
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 10 }}>
              What do you want?
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. high-protein taco bowl with chicken and salsa, not too heavy"
                rows={3}
                style={{
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
                  resize: "vertical",
                }}
              />
            </label>
            <Btn
              onClick={runDescribe}
              disabled={busy || description.trim().length < 3}
              style={{ width: "100%", marginBottom: 10 }}
            >
              {busy ? "Building meal…" : "Generate meal"}
            </Btn>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={saveMine}
                onChange={(e) => setSaveMine(e.target.checked)}
              />
              Save to My meals when I add it
            </label>
            {err && <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8 }}>{err}</div>}
            {describeMeal && (
              <AiMealPreview
                meal={describeMeal}
                onAdd={() => onPickAi(describeMeal, { saveToMine: saveMine })}
              />
            )}
          </>
        )}

        {view === "options" && (
          <>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.45 }}>
              Generating for <b style={{ color: T.ink }}>{SLOT_LABEL[effectiveSlot] || "meal"}</b> using Foods I love + Callie’s healthy-macro guide.
            </div>
            {!optionMeals.length && (
              <Btn onClick={runOptions} disabled={busy || !effectiveSlot} style={{ width: "100%", marginBottom: 10 }}>
                {busy ? "Generating…" : "Generate 2–3 options"}
              </Btn>
            )}
            {!!optionMeals.length && (
              <Btn ghost onClick={runOptions} disabled={busy} style={{ width: "100%", marginBottom: 10 }}>
                {busy ? "Generating…" : "Regenerate options"}
              </Btn>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={saveMine}
                onChange={(e) => setSaveMine(e.target.checked)}
              />
              Save the one I pick to My meals
            </label>
            {err && <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8 }}>{err}</div>}
            {optionMeals.map((m, i) => (
              <AiMealPreview
                key={`${m.name}-${i}`}
                meal={m}
                onAdd={() => onPickAi(m, { saveToMine: saveMine })}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function HubBtn({ title, sub, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 14px",
        borderRadius: 14,
        border: `1.5px solid ${T.border}`,
        background: disabled ? T.track : "#fff",
        cursor: disabled ? "default" : "pointer",
        fontFamily: F,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{title}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
    </button>
  );
}

function AiMealPreview({ meal, onAdd }) {
  const [open, setOpen] = useState(false);
  const ings = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = Array.isArray(meal.steps) ? meal.steps : [];
  return (
    <div
      style={{
        border: `1.5px solid ${T.border}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        background: T.accentSoft,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, textTransform: "uppercase" }}>
        {SLOT_LABEL[String(meal.slot || "").toLowerCase()] || "Meal"}
        {meal.basedOn ? ` · based on ${meal.basedOn}` : " · custom AI"}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginTop: 2 }}>{meal.name}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
        {meal.cal} cal · {meal.p}P · {meal.c}C · {meal.f}F
      </div>
      {meal.desc && (
        <div style={{ fontSize: 12.5, color: T.ink, marginTop: 6, lineHeight: 1.4 }}>{meal.desc}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <Btn small onClick={onAdd}>Add to plan</Btn>
        {(ings.length > 0 || steps.length > 0) && (
          <ActionPill onClick={() => setOpen((o) => !o)}>{open ? "Hide recipe" : "Show recipe"}</ActionPill>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          {ings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Ingredients · one serving</div>
              <IngList items={ings} />
            </div>
          )}
          {steps.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Steps</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
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
