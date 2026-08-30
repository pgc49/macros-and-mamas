import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import { AiMealPreview } from "./AiMealPreview";
import { RecipeCreator } from "./RecipeCreator";
import { SlotChips } from "./SlotChips";
import { MEAL_SLOTS, SLOT_LABEL, guessSlotFromTime, normalizeSlot } from "../utils/mealSlots";
import { recipeNoteFromMeal } from "../utils/planMealShape";
import { uniqueCustomMealName } from "../utils/weekPlan";

/**
 * My meals → "+ Add meal" sheet.
 * Three paths: paste a recipe, describe one meal (AI), or generate 2–3 options (AI).
 * Everything lands in My meals (not the week plan).
 */
export function MyMealsAddSheet({
  macros,
  customMeals = [],
  onClose,
  onEstimateRecipe,
  onSaveCustomMeal,
  onMealIdea,
}) {
  const [view, setView] = useState("hub"); // hub | create | describe | options
  const [slot, setSlot] = useState(() => guessSlotFromTime() || "lunch");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [describeMeal, setDescribeMeal] = useState(null);
  const [optionMeals, setOptionMeals] = useState([]);
  const closeTimerRef = useRef(null);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = (ms = 900) => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => onClose?.(), ms);
  };

  const goHub = () => {
    setView("hub");
    setErr("");
    setFlash("");
    setDescribeMeal(null);
    setOptionMeals([]);
    setBusy(false);
  };

  const saveAiToMine = async (idea) => {
    if (!idea || !onSaveCustomMeal) return false;
    const ingredients = recipeNoteFromMeal(idea);
    const saved = await onSaveCustomMeal({
      name: uniqueCustomMealName(idea.name, customMeals),
      cal: Number(idea.cal) || 0,
      p: Number(idea.p) || 0,
      c: Number(idea.c) || 0,
      f: Number(idea.f) || 0,
      serves: Number(idea.servings) || 1,
      slot: normalizeSlot(slot) || normalizeSlot(idea.slot),
      ...(ingredients ? { ingredients } : {}),
    });
    if (!saved) {
      setErr("Couldn't save that meal — try again.");
      return false;
    }
    setFlash(`Saved “${saved.name}” to My meals.`);
    setDescribeMeal(null);
    setOptionMeals([]);
    scheduleClose(900);
    return true;
  };

  const runDescribe = async () => {
    if (!onMealIdea) return;
    setBusy(true);
    setErr("");
    setDescribeMeal(null);
    try {
      const result = await onMealIdea({
        mode: "describe",
        slot: normalizeSlot(slot) || "dinner",
        description: description.trim(),
      });
      if (result?.error) {
        setErr(result.error);
      } else if (result?.meal) {
        setDescribeMeal(result.meal);
      } else {
        setErr("No meal came back — try again with a bit more detail.");
      }
    } catch (e) {
      setErr(e.message || "Couldn't build that meal.");
    } finally {
      setBusy(false);
    }
  };

  const runOptions = async () => {
    if (!onMealIdea) return;
    const useSlot = normalizeSlot(slot);
    if (!useSlot || !MEAL_SLOTS.includes(useSlot)) {
      setErr("Pick breakfast, lunch, dinner, or snack first.");
      return;
    }
    setBusy(true);
    setErr("");
    setOptionMeals([]);
    try {
      const result = await onMealIdea({ mode: "options", slot: useSlot });
      if (result?.error) {
        setErr(result.error);
      } else if (Array.isArray(result?.meals) && result.meals.length) {
        setOptionMeals(result.meals);
      } else {
        setErr("No options came back — try again in a moment.");
      }
    } catch (e) {
      setErr(e.message || "Couldn't generate options.");
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    view === "hub"
      ? "Paste a recipe or let AI draft one for My meals"
      : view === "create"
        ? "Paste ingredients — set servings — save per-serving macros"
        : view === "describe"
          ? "Type what you want — AI builds one meal to save"
          : "2–3 ideas from Foods I love + Callie’s guide";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(40, 24, 32, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
        boxSizing: "border-box",
      }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(92dvh, 720px)",
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: "18px 18px 0 0",
          padding: "16px 16px calc(88px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -8px 40px rgba(40, 24, 32, 0.18)",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 20 }}>Add meal</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: F,
              fontSize: 12,
              fontWeight: 700,
              padding: "7px 12px",
              borderRadius: 999,
              border: `1.5px solid ${T.border}`,
              background: "#fff",
              color: T.accentDeep,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {view !== "hub" && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={goHub}
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 12px",
                borderRadius: 999,
                border: `1.5px solid ${T.border}`,
                background: "#fff",
                color: T.accentDeep,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          </div>
        )}

        {flash && (
          <div style={{ fontSize: 13, color: T.sage, fontWeight: 700, marginBottom: 10 }}>{flash}</div>
        )}

        {view === "hub" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <HubBtn
              title="Create a recipe"
              sub="Paste one you found, set how many it serves, save per-serving macros"
              onClick={() => { setView("create"); setErr(""); setFlash(""); }}
            />
            <HubBtn
              title="Describe a meal (AI)"
              sub="Type what you want — saves straight to My meals"
              disabled={!macros}
              onClick={() => {
                setView("describe");
                setErr("");
                setFlash("");
                setDescribeMeal(null);
              }}
            />
            <HubBtn
              title="Generate options for me (AI)"
              sub="Pick a slot, then generate 2–3 ideas to save"
              disabled={!macros}
              onClick={() => {
                setView("options");
                setErr("");
                setFlash("");
                setOptionMeals([]);
              }}
            />
            {!macros && (
              <div style={{ fontSize: 12.5, color: T.amber, lineHeight: 1.45 }}>
                AI unlocks after Callie approves your macros. Create a recipe still works.
              </div>
            )}
            {err && <div style={{ fontSize: 12.5, color: T.amber }}>{err}</div>}
          </div>
        )}

        {view === "create" && (
          <RecipeCreator
            embedded
            defaultSlot={slot}
            onEstimateRecipe={onEstimateRecipe}
            onSaveCustomMeal={onSaveCustomMeal}
            saveLabel="Save to My meals"
            onSaved={() => {
              setFlash("Saved to My meals.");
              scheduleClose(700);
            }}
            onCancel={goHub}
          />
        )}

        {view === "describe" && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 6 }}>
                Save as
              </div>
              <SlotChips value={slot} onChange={setSlot} compact />
            </div>
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
            {err && <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8 }}>{err}</div>}
            {describeMeal && (
              <AiMealPreview
                meal={describeMeal}
                addLabel="Save to My meals"
                onAdd={() => saveAiToMine(describeMeal)}
              />
            )}
          </>
        )}

        {view === "options" && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 6 }}>
                Generate for
              </div>
              <SlotChips value={slot} onChange={setSlot} compact />
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.45 }}>
              Ideas for <b style={{ color: T.ink }}>{SLOT_LABEL[slot] || "meal"}</b> using Foods I love + Callie’s guide.
            </div>
            {!optionMeals.length && (
              <Btn onClick={runOptions} disabled={busy || !slot} style={{ width: "100%", marginBottom: 10 }}>
                {busy ? "Generating…" : "Generate 2–3 options"}
              </Btn>
            )}
            {!!optionMeals.length && (
              <Btn ghost onClick={runOptions} disabled={busy} style={{ width: "100%", marginBottom: 10 }}>
                {busy ? "Generating…" : "Regenerate options"}
              </Btn>
            )}
            {err && <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8 }}>{err}</div>}
            {optionMeals.map((m, i) => (
              <AiMealPreview
                key={`${m.name}-${i}`}
                meal={m}
                addLabel="Save to My meals"
                onAdd={() => saveAiToMine(m)}
              />
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
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
