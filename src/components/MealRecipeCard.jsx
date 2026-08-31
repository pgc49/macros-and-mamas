import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { withRecipeDetail } from "../content/recipeDetails";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";
import { guessSlotFromTime, normalizeSlot } from "../utils/mealSlots";
import { SlotChips } from "./SlotChips";

function IngList({ items }) {
  const lines = Array.isArray(items) ? items : [];
  if (!lines.length) {
    return <div style={{ fontSize: 13.5, color: T.inkSoft }}>No structured ingredient list yet.</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
      {lines.map((ing, i) => (
        <li key={i} style={{ marginBottom: 3 }}>
          <b>{ing?.amount}</b> {ing?.item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Expandable meal/recipe card — Meals bank + personalized plans.
 * Open: batch cook (if any) → one-serving ingredients → steps.
 * Serving stepper scales macros for logging only — ingredient list stays base recipe.
 */
export function MealRecipeCard({ meal, onLog, showLog = true }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const r = withRecipeDetail(meal);
  const cat = r.cat || r.slot || "Meal";
  const serves = Number(r.serves) || 1;
  const batch = Array.isArray(r.batch) && r.batch.length ? r.batch : null;
  const serving = Array.isArray(r.serving) && r.serving.length
    ? r.serving
    : (Array.isArray(r.ingredients) ? r.ingredients : []);
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const servings = snapServings(qty);
  const scaled = scaleMealForLog(r, servings);
  const isDinner = String(cat).toLowerCase() === "dinner";
  const batchLabel = serves > 1
    ? (isDinner ? ` · batch · serves ${serves}` : ` · batch serves ${serves}`)
    : "";
  const [slot, setSlot] = useState(
    () => normalizeSlot(r.slot || r.cat) || guessSlotFromTime(),
  );

  const [logPhase, setLogPhase] = useState("idle");
  const logBtn = (
    <button
      type="button"
      disabled={logPhase === "busy" || logPhase === "done"}
      onClick={async (e) => {
        e.stopPropagation();
        if (logPhase !== "idle") return;
        setLogPhase("busy");
        try {
          const ok = await onLog?.(scaleMealForLog({
            ...r,
            via: "recipe",
            slot,
            fromPlanner: true,
          }, servings));
          if (ok === false) {
            setLogPhase("idle");
            return;
          }
          setQty(1);
          setLogPhase("done");
          window.setTimeout(() => setLogPhase("idle"), 2000);
        } catch {
          setLogPhase("idle");
        }
      }}
      style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1.5px solid ${T.accent}`,
        background: T.accentSoft,
        color: T.accentDeep,
        cursor: logPhase === "busy" || logPhase === "done" ? "default" : "pointer",
        opacity: logPhase === "busy" ? 0.7 : 1,
      }}
    >
      {logPhase === "idle" && "Add to Today"}
      {logPhase === "busy" && "Adding…"}
      {logPhase === "done" && "Added ✓"}
    </button>
  );

  return (
    <div
      data-meal-recipe-card=""
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        background: T.card,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 14px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              fontFamily: F,
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.8, textTransform: "uppercase" }}>
              {cat}{batchLabel}{open ? " · hide recipe" : " · open recipe"}
            </div>
            <div style={{ fontFamily: FD, fontSize: 18, margin: "2px 0 0", color: T.ink, lineHeight: 1.25 }}>{r.name}</div>
          </button>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            {showLog && <div style={{ marginBottom: 4 }}>{logBtn}</div>}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                fontFamily: F,
                color: "inherit",
                textAlign: "right",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>
                {scaled.cal} cal
                {servings !== 1 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft }}> · {servings}×</span>
                ) : null}
              </div>
              <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1, lineHeight: 1.25 }}>
                <span style={{ color: T.accentDeep, fontWeight: 700 }}>P {scaled.p}g</span>
                {" · "}C {scaled.c}g · F {scaled.f}g
              </div>
            </button>
          </div>
        </div>

        {showLog && (
          <div data-meal-recipe-log="" style={{ marginTop: 8 }}>
            <SlotChips value={slot} onChange={setSlot} compact fill />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 8,
              }}
            >
              <div
                data-servings-hint=""
                title="Scales macros only — recipe amounts stay at one serving"
                style={{
                  fontSize: 11,
                  color: T.inkSoft,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  minWidth: 0,
                }}
              >
                Servings to log
                <span style={{ fontWeight: 500 }}> · macros only; recipe stays 1 serving</span>
              </div>
              <ServingStepper value={servings} onChange={setQty} compact />
            </div>
          </div>
        )}
      </div>

      {open && (
        <div style={{ padding: "12px 16px 16px", borderTop: `1px dashed ${T.border}` }}>
          {r.basedOn && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>
              Based on Callie&apos;s <b style={{ color: T.ink }}>{r.basedOn}</b>
            </div>
          )}

          {batch && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                Ingredients · batch cook
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.4, marginBottom: 6 }}>
                Full cook for about {serves} plates (family batch). Macros below are one logged plate.
              </div>
              <IngList items={batch} />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>
              Ingredients · one serving
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.4, marginBottom: 6 }}>
              {batch
                ? "What goes on the logged plate from that batch."
                : "Base recipe amounts. If you ate more, bump Servings to log — macros update; this list stays the recipe."}
            </div>
            <IngList items={serving} />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>Steps</div>
            <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.4, marginBottom: 6 }}>
              Cook it through, then plate the logged serving.
            </div>
            {steps.length ? (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{s}</li>
                ))}
              </ol>
            ) : (
              <div style={{ fontSize: 13.5, color: T.inkSoft }}>Follow the amounts above, then plate your serving.</div>
            )}
          </div>

          {showLog && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>{logBtn}</div>
          )}
        </div>
      )}
    </div>
  );
}
