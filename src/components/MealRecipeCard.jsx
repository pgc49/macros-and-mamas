import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { withRecipeDetail } from "../content/recipeDetails";

function Section({ title, hint, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>{title}</div>
      {hint ? (
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.4, marginBottom: 6 }}>{hint}</div>
      ) : (
        <div style={{ marginBottom: 6 }} />
      )}
      {children}
    </div>
  );
}

function IngList({ items }) {
  if (!items?.length) {
    return <div style={{ fontSize: 13.5, color: T.inkSoft }}>See macros above.</div>;
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
 * Expandable meal/recipe card — shared by default Meals bank and personalized plans.
 * Open layout: Recipe (batch) → Steps → Serving size (plate that matches macros).
 */
export function MealRecipeCard({ meal, onLog, showLog = true }) {
  const [open, setOpen] = useState(false);
  const r = withRecipeDetail(meal);
  const cat = r.cat || r.slot || "Meal";
  const serves = Number(r.serves) || 1;
  const batch = r.batch?.length ? r.batch : null;
  const serving = r.serving?.length ? r.serving : (r.ingredients || []);
  const steps = r.steps || [];

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
            {cat}{serves > 1 ? ` · recipe serves ${serves}` : ""}
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
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 2 }}>per serving</div>
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
            <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 0" }}>
              Based on Callie&apos;s <b style={{ color: T.ink }}>{r.basedOn}</b>
            </div>
          )}

          <Section
            title="Recipe"
            hint={
              batch
                ? `Full cook — quantities for ${serves} servings (family batch).`
                : serves > 1
                  ? `Makes about ${serves} servings.`
                  : "What to cook / assemble for this meal."
            }
          >
            <IngList items={batch || serving} />
          </Section>

          <Section title="Steps" hint="Cook it through, then plate your serving below.">
            {steps.length ? (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{s}</li>
                ))}
              </ol>
            ) : (
              <div style={{ fontSize: 13.5, color: T.inkSoft }}>Follow the amounts in Recipe, then plate your Serving size.</div>
            )}
          </Section>

          <Section
            title="Serving size"
            hint="Plate this much to match the macros shown (what + Log adds to your day)."
          >
            <IngList items={serving} />
          </Section>

          {showLog && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>{logBtn}</div>
          )}
        </div>
      )}
    </div>
  );
}
