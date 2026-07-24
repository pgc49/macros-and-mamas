import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { MealRecipeCard } from "./MealRecipeCard";
import { GroceryListPanel } from "./GroceryListPanel";
import { mealToCard } from "../content/recipeDetails";
import { suggestRecipesForSlot, suggestWeekFromBank } from "../utils/suggestFromPrefs";
import {
  PLAN_DAYS,
  PLAN_SLOTS,
  SLOT_LABEL,
  emptyWeekPlan,
  normalizeWeekDays,
  countPlannedMeals,
  mealForSlot,
  setSlotMeal,
  recipeToPlanMeal,
  cloneDaysToPlan,
  bankRecipesForSlot,
  sumDayTotals,
} from "../utils/weekPlan";

/**
 * Client weekly meal planner.
 * She commits meals to slots → grocery list builds from those only.
 * Suggestions: taste-matched bank picks + optional AI week + coach seed.
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
  const [activeDay, setActiveDay] = useState(PLAN_DAYS[0]);
  const [picker, setPicker] = useState(null); // { day, slot }
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const day = planned.find((d) => d.day === activeDay) || planned[0];
  const hasCoach = Array.isArray(coachPlan?.days) && coachPlan.days.length > 0;
  const hasPrefs = !!(profile?.prefB || profile?.prefL || profile?.prefD);

  useEffect(() => {
    if (!message) return undefined;
    const t = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(t);
  }, [message]);

  const applyDays = (next, nextSource) => {
    onChangeDays?.(normalizeWeekDays(next), nextSource);
  };

  const fillFromBankPrefs = () => {
    setError("");
    const next = suggestWeekFromBank(profile || {});
    applyDays(next, "manual");
    setMessage(hasPrefs
      ? "Filled from Callie's bank using your taste notes."
      : "Filled a sample week from Callie's bank — edit anything.");
  };

  const fillFromCoach = () => {
    if (!hasCoach) return;
    setError("");
    applyDays(cloneDaysToPlan(coachPlan.days), "coach_seed");
    setMessage("Started from Callie's plan — tweak freely.");
  };

  const clearWeek = () => {
    setError("");
    applyDays(emptyWeekPlan(), "manual");
    setMessage("Week cleared.");
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
        setMessage(result.summary || "AI week ready — edit anything before you shop.");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t suggest a week right now.");
    }
  };

  const openPicker = (dayKey, slot) => setPicker({ day: dayKey, slot });
  const closePicker = () => setPicker(null);

  const chooseRecipe = (recipe) => {
    if (!picker) return;
    const meal = recipeToPlanMeal(recipe, picker.slot);
    applyDays(setSlotMeal(planned, picker.day, picker.slot, meal), source === "ai" ? "manual" : (source || "manual"));
    closePicker();
  };

  const clearSlot = (dayKey, slot) => {
    applyDays(setSlotMeal(planned, dayKey, slot, null), "manual");
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Plan this week</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
          Pick what you&apos;ll actually cook. Grocery list only includes meals you add —
          nothing assumed from the sample bank.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <Btn small onClick={onAiSuggest} disabled={suggestBusy || !macros}>
            {suggestBusy ? "Suggesting…" : "AI: suggest my week"}
          </Btn>
          <Btn small ghost onClick={fillFromBankPrefs}>
            {hasPrefs ? "Fill from my tastes" : "Fill from bank"}
          </Btn>
          {hasCoach && (
            <Btn small ghost onClick={fillFromCoach}>
              Use Callie&apos;s plan
            </Btn>
          )}
          {mealCount > 0 && (
            <Btn small ghost onClick={clearWeek}>
              Clear week
            </Btn>
          )}
          <Btn small ghost onClick={() => onSave?.()} disabled={saving}>
            {saving ? "Saving…" : "Save plan"}
          </Btn>
        </div>

        {!macros && (
          <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8, lineHeight: 1.45 }}>
            AI week suggestions unlock after Callie approves your ranges. You can still plan from the bank now.
          </div>
        )}
        {hasPrefs && (
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 4, lineHeight: 1.45 }}>
            Using your loves
            {profile.prefB ? ` · breakfast: ${profile.prefB}` : ""}
            {profile.prefL ? ` · lunch: ${profile.prefL}` : ""}
            {profile.prefD ? ` · dinner: ${profile.prefD}` : ""}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: T.inkSoft }}>
          {mealCount === 0
            ? "No meals planned yet — add slots below or tap a suggest button."
            : `${mealCount} meal${mealCount === 1 ? "" : "s"} on your plan`}
          {source === "ai" ? " · from AI" : source === "coach_seed" ? " · from Callie" : ""}
        </div>
        {message && (
          <div style={{ fontSize: 12.5, color: "#3E5A46", background: T.sageSoft, borderRadius: 10, padding: "8px 10px", marginTop: 10 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{error}</div>
        )}
      </Card>

      <GroceryListPanel
        weekDays={planned}
        personalized
        emptyHint="Add meals to your plan first — then your grocery list shows up here."
      />

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

      {day && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: FD, fontSize: 22 }}>{day.day}</span>
              {day.theme ? (
                <span style={{ fontSize: 13, color: T.inkSoft, marginLeft: 8 }}>{day.theme}</span>
              ) : null}
            </div>
            {day.meals?.length > 0 && (
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700 }}>
                {sumDayTotals(day.meals).cal} cal · {sumDayTotals(day.meals).p}P · {sumDayTotals(day.meals).c}C · {sumDayTotals(day.meals).f}F
              </div>
            )}
          </div>

          {PLAN_SLOTS.map((slot) => {
            const meal = mealForSlot(day, slot);
            return (
              <div key={slot} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: T.accentDeep, marginBottom: 6 }}>
                  {SLOT_LABEL[slot]}
                </div>
                {meal ? (
                  <div>
                    <MealRecipeCard meal={mealToCard(meal)} onLog={onLog} />
                    <div style={{ display: "flex", gap: 8, marginTop: -4, marginBottom: 8 }}>
                      <button type="button" onClick={() => openPicker(day.day, slot)} style={linkBtn}>
                        Swap
                      </button>
                      <button type="button" onClick={() => clearSlot(day.day, slot)} style={linkBtn}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openPicker(day.day, slot)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: `1.5px dashed ${T.border}`,
                      background: "#fff",
                      cursor: "pointer",
                      fontFamily: F,
                      fontSize: 14,
                      color: T.inkSoft,
                    }}
                  >
                    + Add {SLOT_LABEL[slot].toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {picker && (
        <MealPickerModal
          profile={profile}
          day={picker.day}
          slot={picker.slot}
          onClose={closePicker}
          onPick={chooseRecipe}
        />
      )}
    </div>
  );
}

const linkBtn = {
  fontFamily: F,
  fontSize: 12.5,
  fontWeight: 700,
  color: T.accentDeep,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px 0",
};

function MealPickerModal({ profile, day, slot, onClose, onPick }) {
  const suggested = useMemo(
    () => suggestRecipesForSlot(profile || {}, slot, { limit: 5 }),
    [profile, slot],
  );
  const bank = useMemo(() => bankRecipesForSlot(slot), [slot]);
  const suggestedNames = new Set(suggested.map((s) => s.recipe.name));
  const rest = bank.filter((r) => !suggestedNames.has(r.name));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pick ${SLOT_LABEL[slot]} for ${day}`}
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
            <div style={{ fontFamily: FD, fontSize: 20 }}>{SLOT_LABEL[slot]} · {day}</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>Suggested from your tastes, then the full bank</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...linkBtn, fontSize: 14 }}>Close</button>
        </div>

        {suggested.some((s) => s.score > 0) && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.accentDeep, marginBottom: 8 }}>
              Suggested for you
            </div>
            {suggested.filter((s) => s.score > 0).map(({ recipe, reason }) => (
              <PickerRow key={recipe.name} recipe={recipe} reason={reason} onPick={onPick} accent />
            ))}
          </>
        )}

        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft, margin: "14px 0 8px" }}>
          Callie&apos;s bank
        </div>
        {(suggested.some((s) => s.score > 0) ? rest : bank).map((recipe) => (
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
      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{recipe.name}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
        {recipe.cal} cal · {recipe.p}P · {recipe.c}C · {recipe.f}F
        {reason ? ` · ${reason}` : ""}
      </div>
    </button>
  );
}
