import { T, F } from "../theme/tokens";

/** Snap to 0.25 servings, clamp to a sensible range. */
export function snapServings(qty, { min = 0.25, max = 4, step = 0.25 } = {}) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 1;
  const snapped = Math.round(n / step) * step;
  return Math.min(max, Math.max(min, Math.round(snapped * 100) / 100));
}

/** Scale meal macros by serving quantity for logging. */
export function scaleMealForLog(meal, qty = 1) {
  const servings = snapServings(qty);
  const mul = (v) => Math.round((Number(v) || 0) * servings);
  const baseName = String(meal?.name || "Meal").replace(/\s·\s[\d.]+×$/, "");
  return {
    ...meal,
    name: servings === 1 ? baseName : `${baseName} · ${formatServings(servings)}×`,
    cal: mul(meal.cal),
    p: mul(meal.p),
    c: mul(meal.c),
    f: mul(meal.f),
    servingsLogged: servings,
  };
}

export function formatServings(qty) {
  const n = snapServings(qty);
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Compact − / qty / + control for 0.25 serving steps.
 * stopPropagation so it doesn't toggle parent cards.
 */
export function ServingStepper({
  value = 1,
  onChange,
  min = 0.25,
  max = 4,
  step = 0.25,
  compact = false,
}) {
  const qty = snapServings(value, { min, max, step });
  const bump = (dir) => {
    onChange?.(snapServings(qty + dir * step, { min, max, step }));
  };
  const btn = {
    width: compact ? 28 : 32,
    height: compact ? 28 : 32,
    borderRadius: 8,
    border: `1.5px solid ${T.border}`,
    background: "#fff",
    color: T.ink,
    fontFamily: F,
    fontSize: compact ? 16 : 18,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    padding: 0,
  };
  return (
    <div
      role="group"
      aria-label="Servings"
      onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6 }}
    >
      <button
        type="button"
        aria-label="Fewer servings"
        disabled={qty <= min}
        onClick={() => bump(-1)}
        style={{ ...btn, opacity: qty <= min ? 0.4 : 1 }}
      >
        −
      </button>
      <div style={{
        minWidth: compact ? 36 : 44,
        textAlign: "center",
        fontFamily: F,
        fontSize: compact ? 12.5 : 13,
        fontWeight: 700,
        color: T.ink,
      }}
      >
        {formatServings(qty)}×
      </div>
      <button
        type="button"
        aria-label="More servings"
        disabled={qty >= max}
        onClick={() => bump(1)}
        style={{ ...btn, opacity: qty >= max ? 0.4 : 1 }}
      >
        +
      </button>
    </div>
  );
}
