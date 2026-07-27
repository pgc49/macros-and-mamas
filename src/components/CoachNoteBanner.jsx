import { useState } from "react";
import { T, F } from "../theme/tokens";

/**
 * Callie's note on Today — dismissible. Reappears when she saves a new note.
 */
export function CoachNoteBanner({ note, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const text = String(note || "").trim();
  if (!text) return null;

  const dismiss = async () => {
    if (busy || !onDismiss) return;
    setBusy(true);
    try {
      await onDismiss();
    } catch (e) {
      console.error("dismiss coach note failed", e);
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      style={{
        position: "relative",
        background: T.accentSoft,
        border: `1.5px solid ${T.accent}`,
        borderRadius: 14,
        padding: "14px 40px 14px 14px",
        marginBottom: 12,
      }}
    >
      <div style={{
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: T.accentDeep,
        marginBottom: 6,
      }}
      >
        Note from Callie
      </div>
      <div style={{
        fontFamily: F,
        fontSize: 14.5,
        lineHeight: 1.55,
        color: T.ink,
        whiteSpace: "pre-wrap",
      }}
      >
        {text}
      </div>
      <button
        type="button"
        aria-label="Dismiss Callie’s note"
        onClick={dismiss}
        disabled={busy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: T.inkSoft,
          fontFamily: F,
          fontSize: 18,
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
          lineHeight: 1,
          opacity: busy ? 0.5 : 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
