import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { ServingStepper, scaleMealForLog, snapServings } from "../utils/servings";

/**
 * Compact row: meal name, scaled macros, 0.25 serving stepper, Add to Today.
 * Used for My meals and Today → My plan lists.
 */
export function LoggableMealRow({
  meal,
  via = "recipe",
  onLog,
  onRemove,
  accent = false,
  confirmLog = false,
}) {
  const [qty, setQty] = useState(1);
  const [phase, setPhase] = useState("idle"); // idle | confirm | busy | done
  const servings = snapServings(qty);
  const scaled = scaleMealForLog(meal, servings);
  const slot = meal.slot
    ? String(meal.slot).charAt(0).toUpperCase() + String(meal.slot).slice(1)
    : null;

  const label =
    phase === "idle" ? "Add to Today"
      : phase === "confirm" ? "Confirm?"
        : phase === "busy" ? "Adding…"
          : "Added ✓";

  const handleLog = async () => {
    if (phase === "busy" || phase === "done") return;
    if (confirmLog && phase === "idle") {
      setPhase("confirm");
      return;
    }
    setPhase("busy");
    try {
      const ok = await onLog?.({ ...scaled, via });
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
          {slot && (
            <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, textTransform: "uppercase", marginBottom: 2 }}>
              {slot}
            </div>
          )}
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
          {phase === "confirm" && (
            <button
              type="button"
              onClick={() => setPhase("idle")}
              style={{
                background: "none",
                border: "none",
                fontSize: 11.5,
                color: T.inkSoft,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              Cancel
            </button>
          )}
        </div>
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
              fontFamily: F,
              fontWeight: 600,
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
