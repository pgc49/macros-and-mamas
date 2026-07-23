import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";

/**
 * Compact row: meal name, scaled macros, 0.25 serving stepper, + Log.
 * Used for My meals and Today → My plan lists.
 */
export function LoggableMealRow({
  meal,
  via = "recipe",
  onLog,
  onRemove,
  accent = false,
}) {
  const [qty, setQty] = useState(1);
  const servings = snapServings(qty);
  const scaled = scaleMealForLog(meal, servings);

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
        <button
          type="button"
          onClick={() => {
            onLog?.({ ...scaled, via });
            setQty(1);
          }}
          style={{
            fontFamily: F,
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1.5px solid ${T.accent}`,
            background: accent ? "#fff" : T.accentSoft,
            color: T.accentDeep,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          + Log
        </button>
      </div>
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
              textDecoration: "underline",
              fontFamily: F,
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
