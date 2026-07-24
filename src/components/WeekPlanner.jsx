import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { GroceryListPanel } from "./GroceryListPanel";
import { suggestRecipesForSlot, suggestWeekFromBank } from "../utils/suggestFromPrefs";
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
  recipeToPlanMeal,
  cloneDaysToPlan,
  bankRecipesForSlot,
  sumDayTotals,
} from "../utils/weekPlan";

/**
 * Flexible week planner — start from default / blank / AI / tastes,
 * then add·remove·swap freely (multiple snacks ok). Desktop: drag between days.
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
  coachPlan = null,
  onLog,
}) {
  const planned = normalizeWeekDays(days);
  const mealCount = countPlannedMeals(planned);
  const isEmpty = mealCount === 0;
  const [activeDay, setActiveDay] = useState(PLAN_DAYS[0]);
  const [picker, setPicker] = useState(null); // { day, slot, replaceId? }
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropDay, setDropDay] = useState(null);
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 900px)").matches : false,
  );

  const hasCoach = Array.isArray(coachPlan?.days) && coachPlan.days.length > 0;
  const hasPrefs = !!(profile?.prefB || profile?.prefL || profile?.prefD);

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
    const t = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(t);
  }, [message]);

  const applyDays = (next, nextSource = "manual") => {
    onChangeDays?.(normalizeWeekDays(next), nextSource);
  };

  const startDefault = () => {
    setError("");
    applyDays(defaultSampleWeek(), "manual");
    setMessage("Started with Callie’s sample Mon–Sun — remove, swap, or add anything.");
  };

  const startBlank = () => {
    setError("");
    applyDays(emptyWeekPlan(), "manual");
    setMessage("Clean sheet — add meals from the bank day by day.");
  };

  const fillFromBankPrefs = () => {
    setError("");
    applyDays(suggestWeekFromBank(profile || {}), "manual");
    setMessage(hasPrefs
      ? "Filled from the bank using your taste notes — edit freely."
      : "Filled a week from Callie’s bank — edit freely.");
  };

  const fillFromCoach = () => {
    if (!hasCoach) return;
    setError("");
    applyDays(cloneDaysToPlan(coachPlan.days), "coach_seed");
    setMessage("Started from Callie’s plan — tweak freely.");
  };

  const clearWeek = () => {
    setError("");
    applyDays(emptyWeekPlan(), "manual");
    setMessage("Week cleared — blank slate.");
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
        setMessage(result.summary || "AI week ready — add, remove, or move meals before you shop.");
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

  const removeMeal = (mealId) => {
    applyDays(removeMealById(planned, mealId), "manual");
  };

  const moveToDay = (mealId, toDay) => {
    applyDays(moveMeal(planned, mealId, toDay), "manual");
  };

  const onDragStart = (e, mealId) => {
    setDragId(mealId);
    e.dataTransfer.setData("text/plain", mealId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    setDragId(null);
    setDropDay(null);
  };

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

  return (
    <div style={{ marginBottom: 18 }}>
      <Card style={{ marginBottom: 12, padding: 14, background: T.accentSoft, border: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.accentDeep, marginBottom: 4 }}>
          Meals → This week
        </div>
        <div style={{ fontFamily: FD, fontSize: 22, marginBottom: 4, color: T.ink }}>Your week planner</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: 0 }}>
          Customize Mon–Sun like a board: start from the sample week or a blank sheet, then add /
          remove / swap meals (extra snacks are fine). On a bigger screen, drag meals between days;
          on phone, use Move and Remove.
        </p>
      </Card>

      {isEmpty ? (
        <Card style={{ marginBottom: 14, padding: 16 }}>
          <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 6 }}>How do you want to start?</div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 14px" }}>
            Grocery only builds after you put meals on the plan — nothing is assumed until you choose.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Btn onClick={startDefault} style={{ width: "100%" }}>
              Start with default Mon–Sun
            </Btn>
            <Btn ghost onClick={startBlank} style={{ width: "100%" }}>
              Start blank — add from the bank
            </Btn>
            <Btn ghost onClick={fillFromBankPrefs} style={{ width: "100%" }}>
              {hasPrefs ? "Fill from my tastes" : "Fill from Callie’s bank"}
            </Btn>
            <Btn ghost onClick={onAiSuggest} disabled={suggestBusy || !macros} style={{ width: "100%" }}>
              {suggestBusy ? "Suggesting…" : "AI: suggest my week"}
            </Btn>
            {hasCoach && (
              <Btn ghost onClick={fillFromCoach} style={{ width: "100%" }}>
                Use Callie’s published plan
              </Btn>
            )}
          </div>
          {!macros && (
            <div style={{ fontSize: 12.5, color: T.amber, marginTop: 12, lineHeight: 1.45 }}>
              AI unlocks after Callie approves your ranges. Default / blank / bank work now.
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 10 }}>{error}</div>}
        </Card>
      ) : (
        <Card style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <Btn small onClick={() => openAdd(activeDay, "any")}>
              + Add meal
            </Btn>
            <Btn small ghost onClick={onAiSuggest} disabled={suggestBusy || !macros}>
              {suggestBusy ? "Suggesting…" : "AI re-suggest"}
            </Btn>
            <Btn small ghost onClick={fillFromBankPrefs}>
              {hasPrefs ? "Refill from tastes" : "Refill from bank"}
            </Btn>
            <Btn small ghost onClick={startDefault}>
              Reset to default week
            </Btn>
            {hasCoach && (
              <Btn small ghost onClick={fillFromCoach}>
                Callie’s plan
              </Btn>
            )}
            <Btn small ghost onClick={clearWeek}>
              Clear all
            </Btn>
            <Btn small ghost onClick={() => onSave?.()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Btn>
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft }}>
            {mealCount} meal{mealCount === 1 ? "" : "s"} on your plan
            {source === "ai" ? " · from AI" : source === "coach_seed" ? " · from Callie" : ""}
            {wide ? " · drag a card onto another day to move it" : " · tap Move to shift a meal to another day"}
          </div>
          {message && (
            <div style={{ fontSize: 12.5, color: "#3E5A46", background: T.sageSoft, borderRadius: 10, padding: "8px 10px", marginTop: 10 }}>
              {message}
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{error}</div>}
        </Card>
      )}

      {!isEmpty && (
        <>
          <GroceryListPanel
            weekDays={planned}
            emptyHint="Add meals to your plan first — then your grocery list shows up here."
          />

          {wide ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(140px, 1fr))",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 8,
              }}
            >
              {planned.map((day) => (
                <DayColumn
                  key={day.day}
                  day={day}
                  highlight={dropDay === day.day}
                  dragId={dragId}
                  onDragOver={onDayDragOver}
                  onDrop={onDayDrop}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onAdd={(slot) => openAdd(day.day, slot)}
                  onReplace={(meal) => openReplace(day.day, meal)}
                  onRemove={removeMeal}
                  onLog={onLog}
                  showMove={false}
                />
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
                {PLAN_DAYS.map((d) => {
                  const count = countPlannedMeals([planned.find((x) => x.day === d) || { meals: [] }]);
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
                        border: `1.5px solid ${active ? T.accent : T.border}`,
                        background: active ? T.accentSoft : "#fff",
                        color: active ? T.accentDeep : T.ink,
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {d}{count ? ` · ${count}` : ""}
                    </button>
                  );
                })}
              </div>
              {planned.filter((d) => d.day === activeDay).map((day) => (
                <DayColumn
                  key={day.day}
                  day={day}
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
                  onLog={onLog}
                  showMove
                  mobile
                />
              ))}
            </>
          )}
        </>
      )}

      {isEmpty && (
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 2px", lineHeight: 1.45 }}>
          Tip: after you start a plan, grocery opens above the board. Only meals you keep are shopped.
        </p>
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

function DayColumn({
  day,
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
  onLog,
  showMove,
  mobile = false,
}) {
  const totals = sumDayTotals(day.meals || []);
  return (
    <div
      onDragOver={(e) => onDragOver(e, day.day)}
      onDrop={(e) => onDrop(e, day.day)}
      style={{
        background: highlight ? T.sageSoft : T.card,
        border: `1.5px solid ${highlight ? T.sage : T.border}`,
        borderRadius: 14,
        padding: mobile ? 12 : 8,
        minHeight: mobile ? undefined : 280,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: FD, fontSize: mobile ? 22 : 16 }}>{day.day}</div>
        {(day.meals || []).length > 0 && (
          <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, marginTop: 2 }}>
            {totals.cal} · {totals.p}P/{totals.c}C/{totals.f}F
          </div>
        )}
        {day.theme ? (
          <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, lineHeight: 1.3 }}>{day.theme}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            onMove={showMove ? (to) => onMove(meal.id, to) : null}
            currentDay={day.day}
            onLog={onLog}
            compact={!mobile}
          />
        ))}
      </div>

      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        <AddChip label="+ Meal" onClick={() => onAdd("any")} />
        {PLAN_SLOTS.map((slot) => (
          <AddChip key={slot} label={`+ ${SLOT_LABEL[slot].slice(0, 1)}`} title={`Add ${SLOT_LABEL[slot]}`} onClick={() => onAdd(slot)} />
        ))}
      </div>
    </div>
  );
}

function AddChip({ label, title, onClick }) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      style={{
        fontFamily: F,
        fontSize: 11,
        fontWeight: 700,
        padding: "5px 8px",
        borderRadius: 8,
        border: `1px dashed ${T.border}`,
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
  onMove,
  currentDay,
  onLog,
  compact,
}) {
  const slot = SLOT_LABEL[String(meal.slot || "").toLowerCase()] || "Meal";
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, meal.id)}
      onDragEnd={onDragEnd}
      style={{
        background: dragging ? T.accentSoft : "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: compact ? "8px 8px" : "10px 10px",
        cursor: draggable ? "grab" : "default",
        opacity: dragging ? 0.7 : 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: T.accentDeep }}>
        {slot}
      </div>
      <div style={{ fontSize: compact ? 12.5 : 14, fontWeight: 700, color: T.ink, lineHeight: 1.3, marginTop: 2 }}>
        {meal.name}
      </div>
      <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>
        {Math.round(meal.cal || 0)} · {Math.round(meal.p || 0)}P/{Math.round(meal.c || 0)}C/{Math.round(meal.f || 0)}F
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        <button type="button" onClick={onReplace} style={linkBtn}>Swap</button>
        <button type="button" onClick={onRemove} style={linkBtn}>Remove</button>
        {onMove && (
          <button type="button" onClick={() => setMoveOpen((o) => !o)} style={linkBtn}>
            Move
          </button>
        )}
        {onLog && !compact && (
          <button
            type="button"
            onClick={() => onLog({
              name: meal.name,
              cal: meal.cal,
              p: meal.p,
              c: meal.c,
              f: meal.f,
              via: "recipe",
            })}
            style={linkBtn}
          >
            + Log
          </button>
        )}
      </div>
      {moveOpen && onMove && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {PLAN_DAYS.filter((d) => d !== currentDay).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { onMove(d); setMoveOpen(false); }}
              style={{
                fontFamily: F,
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.accentSoft,
                color: T.accentDeep,
                cursor: "pointer",
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const linkBtn = {
  fontFamily: F,
  fontSize: 11.5,
  fontWeight: 700,
  color: T.accentDeep,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 0",
};

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

  // When "any", also show top taste matches across categories
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
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              Suggested from your tastes, then Callie’s bank
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...linkBtn, fontSize: 14 }}>Close</button>
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
