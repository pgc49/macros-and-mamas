import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { withRecipeDetail } from "../content/recipeDetails";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";

function IngList({ items }) {
  if (!items?.length) {
    return <div style={{ fontSize: 13.5, color: T.inkSoft }}>No structured ingredient list yet.</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
      {items.map((ing, i) => (
        <li key={i} style={{ marginBottom: 3 }}>
          <b>{ing.amount}</b> {ing.item}
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
  const batch = r.batch?.length ? r.batch : null;
  const serving = r.serving?.length ? r.serving : (r.ingredients || []);
  const steps = r.steps || [];
  const servings = snapServings(qty);
  const scaled = scaleMealForLog(r, servings);

  const logBtn = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onLog?.(scaleMealForLog(r, servings));
        setQty(1);
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
        cursor: "pointer",
      }}
    >
      + Log
    </button>
  );

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        background: T.card,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
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
            {cat}{serves > 1 ? ` · batch serves ${serves}` : ""}{open ? " · hide recipe" : " · open recipe"}
          </div>
          <div style={{ fontFamily: FD, fontSize: 18, margin: "2px 0 4px", color: T.ink }}>{r.name}</div>
        </button>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {showLog && <div style={{ marginBottom: 8 }}>{logBtn}</div>}
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
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 2 }}>
              {servings === 1 ? "per serving" : `${servings}× to log`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{scaled.cal} cal</div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
              <span style={{ color: T.accentDeep, fontWeight: 700 }}>P {scaled.p}g</span>
              {" · "}C {scaled.c}g · F {scaled.f}g
            </div>
          </button>
        </div>
      </div>

      {showLog && (
        <div
          style={{
            padding: "0 16px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>Servings to log</div>
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, maxWidth: 220, lineHeight: 1.35 }}>
              Scales macros only — recipe amounts stay at one serving
            </div>
          </div>
          <ServingStepper value={servings} onChange={setQty} compact />
        </div>
      )}

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
                Full cook for about {serves} servings (family batch).
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
