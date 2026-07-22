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

/** One-time visual tip: Add to Home Screen. Gone forever after dismiss. */
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
        borderRadius: 14,
        padding: "12px 36px 12px 14px",
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
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.04,
          textTransform: "uppercase",
          color: T.accentDeep,
          marginBottom: 4,
        }}
      >
        Getting started
      </div>

      <div style={{ fontFamily: FD, fontSize: 17, lineHeight: 1.25, marginBottom: 6 }}>
        Put Macros and Mamas on your home screen
      </div>

      <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.4, color: T.inkSoft }}>
        It&apos;ll feel like an app — tap the icon anytime and you&apos;re back in your dashboard. No App Store.
      </p>

      <ol
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 12.5,
          lineHeight: 1.45,
          color: T.ink,
        }}
      >
        <li style={{ marginBottom: 3 }}>
          <b>iPhone:</b> Safari → Share → <b>Add to Home Screen</b>
        </li>
        <li>
          <b>Android:</b> Chrome menu → <b>Install app</b> or Add to Home screen
        </li>
      </ol>

      <button
        type="button"
        onClick={dismiss}
        style={{
          marginTop: 10,
          border: "none",
          background: T.accent,
          color: "#fff",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 13,
          padding: "8px 14px",
          borderRadius: 999,
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
