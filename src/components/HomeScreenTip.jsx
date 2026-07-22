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

/** One-time tip matching the getting-started mockup. Gone forever after dismiss. */
export function HomeScreenTip() {
  const [visible, setVisible] = useState(() => !wasDismissed());

  if (!visible) return null;

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
  };

  return (
    <aside
      aria-label="Getting started tip"
      style={{
        position: "relative",
        background: T.accentSoft,
        borderRadius: 16,
        padding: "14px 16px 16px",
        marginBottom: 14,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          border: "none",
          background: "transparent",
          color: T.inkSoft,
          fontSize: 20,
          lineHeight: 1,
          cursor: "pointer",
          padding: 4,
          fontFamily: F,
        }}
      >
        ×
      </button>

      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: T.accentDeep,
          fontFamily: F,
        }}
      >
        Getting started
      </p>

      <h3
        style={{
          fontFamily: FD,
          fontSize: 18,
          fontWeight: 400,
          margin: "0 0 8px",
          color: T.ink,
          lineHeight: 1.25,
          paddingRight: 28,
        }}
      >
        Put Macros and Mamas on your home screen
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: T.inkSoft,
          fontFamily: F,
        }}
      >
        It&apos;ll feel like an app — tap the icon anytime and you&apos;re back in your dashboard. No App Store.
      </p>

      <ol
        style={{
          margin: "10px 0 0",
          paddingLeft: 18,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: T.ink,
          fontFamily: F,
        }}
      >
        <li style={{ marginBottom: 4 }}>
          <b>iPhone:</b> Safari → Share → <b>Add to Home Screen</b>
        </li>
        <li>
          <b>Android:</b> Chrome menu → <b>Install app</b> or Add to Home screen
        </li>
      </ol>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={dismiss}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "10px 16px",
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
            background: T.accent,
            color: "#fff",
          }}
        >
          Got it
        </button>
      </div>
    </aside>
  );
}
