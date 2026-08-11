import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";
import { guessSlotFromTime, normalizeSlot } from "../utils/mealSlots";
import { SlotChips } from "./SlotChips";

/**
 * Compact row: meal name, scaled macros, slot chips, serving stepper, Add to Today.
 * Optional ingredients expand for My meals.
 */
export function LoggableMealRow({
  meal,
  via = "recipe",
  onLog,
  onRemove,
  onSaveIngredients,
  accent = false,
  /** Show breakfast/lunch/dinner/snack chips before Add (default on). */
  showSlotPicker = true,
}) {
  const initialSlot = normalizeSlot(meal.slot || meal.cat) || guessSlotFromTime();
  const [qty, setQty] = useState(1);
  const [slot, setSlot] = useState(initialSlot);
  const [phase, setPhase] = useState("idle"); // idle | busy | done
  const [showRecipe, setShowRecipe] = useState(false);
  const [ingDraft, setIngDraft] = useState(String(meal.ingredients || ""));
  const [ingBusy, setIngBusy] = useState(false);
  const [ingNote, setIngNote] = useState("");

  const servings = snapServings(qty);
  const scaled = scaleMealForLog(meal, servings);
  const hasIngredients = Boolean(String(meal.ingredients || "").trim());
  const canEditIngredients = typeof onSaveIngredients === "function";

  const label =
    phase === "idle" ? "Add to Today"
      : phase === "busy" ? "Adding…"
        : "Added ✓";

  const handleLog = async () => {
    if (phase === "busy" || phase === "done") return;
    setPhase("busy");
    try {
      const ok = await onLog?.({
        ...scaled,
        via,
        slot: showSlotPicker ? slot : (meal.slot || meal.cat || slot),
      });
      if (ok === false) {
        setPhase("idle");
        return;
      }
      setPhase("done");
      setQty(1);
      window.setTimeout(() => setPhase("idle"), 2000);
    } catch {
      setPhase("idle");
    }
  };

  const saveIngredients = async () => {
    if (!canEditIngredients || ingBusy) return;
    setIngBusy(true);
    setIngNote("");
    try {
      const saved = await onSaveIngredients({
        ...meal,
        ingredients: ingDraft.trim(),
      });
      if (saved === false || saved == null) {
        setIngNote("Couldn't save — try again");
        return;
      }
      setIngNote("Saved");
      window.setTimeout(() => setIngNote(""), 2000);
    } catch {
      setIngNote("Couldn't save — try again");
    } finally {
      setIngBusy(false);
    }
  };

  return (
    <div
      style={{
        border: `1.5px solid ${accent ? T.accent : T.border}`,
        borderRadius: 12,
        background: accent ? T.accentSoft : T.card,
        padding: "12px 14px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FD, fontSize: 17, color: T.ink }}>{meal.name}</div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
            {scaled.cal} cal · P {scaled.p}g · C {scaled.c}g · F {scaled.f}g
            {servings !== 1 ? ` · ${servings}×` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button
            type="button"
            disabled={phase === "busy" || phase === "done"}
            onClick={handleLog}
            style={{
              fontFamily: F,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 12px",
              borderRadius: 999,
              border: `1.5px solid ${T.accent}`,
              background: accent ? "#fff" : T.accentSoft,
              color: T.accentDeep,
              cursor: phase === "busy" || phase === "done" ? "default" : "pointer",
              flexShrink: 0,
              opacity: phase === "busy" ? 0.7 : 1,
            }}
          >
            {label}
          </button>
        </div>
      </div>

      {showSlotPicker && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 6 }}>
            Add to
          </div>
          <SlotChips value={slot} onChange={setSlot} compact />
        </div>
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 10,
        flexWrap: "wrap",
      }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>Servings</span>
          <ServingStepper value={servings} onChange={setQty} compact />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(hasIngredients || canEditIngredients) && (
            <button
              type="button"
              onClick={() => {
                setShowRecipe((v) => !v);
                setIngDraft(String(meal.ingredients || ""));
                setIngNote("");
              }}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: T.accentDeep,
                cursor: "pointer",
                fontFamily: F,
                fontWeight: 700,
              }}
            >
              {showRecipe ? "Hide recipe" : (hasIngredients ? "Recipe" : "Add recipe note")}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: T.inkSoft,
                cursor: "pointer",
                fontFamily: F,
                fontWeight: 600,
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {showRecipe && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          {canEditIngredients ? (
            <>
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>
                What’s in one serving? One ingredient per line (e.g. 150g yogurt).
              </div>
              <textarea
                value={ingDraft}
                onChange={(e) => setIngDraft(e.target.value)}
                rows={4}
                placeholder={"150g Greek yogurt\n40g granola\n75g berries"}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: F,
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${T.border}`,
                  resize: "vertical",
                  background: "#fff",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={ingBusy}
                  onClick={saveIngredients}
                  style={{
                    fontFamily: F,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1.5px solid ${T.accent}`,
                    background: T.accentSoft,
                    color: T.accentDeep,
                    cursor: ingBusy ? "default" : "pointer",
                    opacity: ingBusy ? 0.7 : 1,
                  }}
                >
                  {ingBusy ? "Saving…" : "Save recipe note"}
                </button>
                {ingNote && (
                  <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{ingNote}</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {String(meal.ingredients || "").trim() || "No recipe note saved for this meal."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
