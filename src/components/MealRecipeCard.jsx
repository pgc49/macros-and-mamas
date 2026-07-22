import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { withRecipeDetail } from "../content/recipeDetails";

/**
 * Expandable meal/recipe card — shared by default Meals bank and personalized plans.
 * Collapsed: name + macros. Open: ingredients, steps. + Log when showLog.
 */
export function MealRecipeCard({ meal, onLog, showLog = true }) {
  const [open, setOpen] = useState(false);
  const r = withRecipeDetail(meal);
  const cat = r.cat || r.slot || "Meal";

  const logBtn = (
    <button
      type="button"
      onClick={() => onLog?.(r)}
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
            {cat}{r.serves > 1 ? ` · serves ${r.serves}` : ""}
          </div>
          <div style={{ fontFamily: FD, fontSize: 18, margin: "2px 0 4px", color: T.ink }}>{r.name}</div>
          {r.desc ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>{r.desc}</div>
          ) : null}
          <div style={{ fontSize: 12, color: T.accent, fontWeight: 700, marginTop: 6 }}>
            {open ? "Hide ▴" : "Open recipe ▾"}
          </div>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{Math.round(r.cal || 0)} cal</div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
              <span style={{ color: T.accentDeep, fontWeight: 700 }}>P {Math.round(r.p || 0)}g</span>
              {" · "}C {Math.round(r.c || 0)}g · F {Math.round(r.f || 0)}g
            </div>
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px dashed ${T.border}` }}>
          {r.basedOn && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 8px" }}>
              Based on Callie&apos;s <b style={{ color: T.ink }}>{r.basedOn}</b>
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 6px" }}>Ingredients</div>
          {(r.ingredients || []).length ? (
            <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5, color: T.ink }}>
              {r.ingredients.map((ing, i) => (
                <li key={i}>
                  <b>{ing.amount}</b> {ing.item}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 12 }}>{r.desc || "See macros above."}</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Steps</div>
          {(r.steps || []).length ? (
            <ol style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
              {r.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{s}</li>
              ))}
            </ol>
          ) : (
            <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 12 }}>Follow the ingredient amounts above.</div>
          )}
          {showLog && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>{logBtn}</div>
          )}
        </div>
      )}
    </div>
  );
}
