import { useState } from "react";
import { T, F, FD } from "../theme/tokens";

const STORAGE_KEY = "mm_homescreen_tip_dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode / blocked storage — still hide for this session */
  }
}

/** Compact one-time tip: Add to Home Screen. Gone forever after dismiss. */
export function HomeScreenTip() {
  const [visible, setVisible] = useState(() => !wasDismissed());

  if (!visible) return null;

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Add to Home Screen tip"
      style={{
        position: "relative",
        background: T.accentSoft,
        borderRadius: 12,
        padding: "10px 40px 10px 12px",
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        style={{
          position: "absolute",
          top: 4,
          right: 6,
          border: "none",
          background: "transparent",
          color: T.inkSoft,
          fontSize: 22,
          lineHeight: 1,
          cursor: "pointer",
          padding: "6px 8px",
          fontFamily: F,
        }}
      >
        ×
      </button>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.04,
          textTransform: "uppercase",
          color: T.accentDeep,
          marginBottom: 2,
        }}
      >
        Tip · phone & desktop
      </div>
      <div style={{ fontFamily: FD, fontSize: 15, lineHeight: 1.25, marginBottom: 4 }}>
        Add to your home screen
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: T.inkSoft }}>
        Best on your phone: Safari or Chrome → Share →{" "}
        <b style={{ color: T.ink }}>Add to Home Screen</b>. Instant icon, no App Store.
      </p>
      <button
        type="button"
        onClick={dismiss}
        style={{
          marginTop: 8,
          border: "none",
          background: T.accent,
          color: "#fff",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 12,
          padding: "7px 12px",
          borderRadius: 999,
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
