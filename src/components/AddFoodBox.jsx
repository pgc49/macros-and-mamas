import { T, F } from "../theme/tokens";

/**
 * "I added something to this meal" input.
 *
 * Used in two places: under an AI draft before it is saved, and inside a
 * logged row afterwards. Both exist so taking the coach's suggestion never
 * means deleting the meal and starting the estimate over.
 */
export function AddFoodBox({
  value,
  onChange,
  onSubmit,
  busy = false,
  error = "",
  label = "Added something?",
  hint = "",
  placeholder = "e.g. a cup of Greek yogurt",
  cta = "Update",
  busyLabel = "Adding…",
}) {
  const ready = String(value || "").trim().length > 0 && !busy;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 6, lineHeight: 1.45 }}>{hint}</div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ready) {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          style={{
            flex: 1,
            minWidth: 150,
            padding: "9px 11px",
            fontSize: 14,
            border: `1.5px solid ${T.border}`,
            borderRadius: 10,
            fontFamily: F,
            background: "#fff",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSubmit?.()}
          style={{
            fontFamily: F,
            fontSize: 12.5,
            fontWeight: 700,
            padding: "8px 14px",
            borderRadius: 999,
            border: `1.5px solid ${T.accent}`,
            background: ready ? T.accent : "#D9C4CE",
            color: "#fff",
            cursor: ready ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? busyLabel : cta}
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: T.amber, marginTop: 6, lineHeight: 1.45 }}>{error}</div>
      )}
    </div>
  );
}
