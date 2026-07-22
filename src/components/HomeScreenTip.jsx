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

function IconCircle({ children }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#FBEFF4",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: T.accentDeep,
      }}
    >
      {children}
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M10.5 18.5h3" strokeLinecap="round" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.2 3.4 7.1 1.5a.6.6 0 0 1 .2-.8.6.6 0 0 1 .8.2l1.2 2.1a5.8 5.8 0 0 1 5.4 0l1.2-2.1a.6.6 0 0 1 1 .6l-1.1 1.9A5.7 5.7 0 0 1 18.5 9H5.5a5.7 5.7 0 0 1 2.7-5.6ZM7 10.5h10v7.2a2.3 2.3 0 0 1-2.3 2.3H9.3A2.3 2.3 0 0 1 7 17.7v-7.2Zm-2.2.4a1 1 0 0 0-1 1v5.2a1 1 0 1 0 2 0v-5.2a1 1 0 0 0-1-1Zm14.4 0a1 1 0 0 0-1 1v5.2a1 1 0 1 0 2 0v-5.2a1 1 0 0 0-1-1ZM9.2 7.4a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Zm5.6 0a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={T.accentDeep}
      strokeWidth="2.2"
      style={{ display: "inline-block", verticalAlign: "-2px", margin: "0 2px" }}
      aria-hidden="true"
    >
      <path d="M12 3v11" strokeLinecap="round" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13" strokeLinecap="round" />
    </svg>
  );
}

function MenuDotsIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={T.accentDeep}
      style={{ display: "inline-block", verticalAlign: "-1px", margin: "0 3px" }}
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function Step({ icon, children }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <IconCircle>{icon}</IconCircle>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: T.ink, fontFamily: F, paddingTop: 1 }}>
        {children}
      </div>
    </div>
  );
}

/** Visual getting-started tip (icon rows). Gone forever after dismiss. */
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
        padding: "14px 16px 14px",
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
          color: T.accentDeep,
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
          color: T.accentDeep,
          lineHeight: 1.25,
          paddingRight: 28,
        }}
      >
        Put Macros and Mamas on your home screen
      </h3>

      <p
        style={{
          margin: "0 0 12px",
          fontSize: 14,
          lineHeight: 1.5,
          color: T.inkSoft,
          fontFamily: F,
        }}
      >
        Add Macros and Mamas to your home screen for quick, one-tap access—no App Store required.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        <Step icon={<PhoneIcon />}>
          <b>iPhone (Safari):</b> Tap Share <ShareIcon /> and Add to Home Screen.
        </Step>
        <Step icon={<AndroidIcon />}>
          <b>Android (Chrome):</b> Tap the menu <MenuDotsIcon /> and select Install.
        </Step>
      </div>

      <button
        type="button"
        onClick={dismiss}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 999,
          padding: "11px 16px",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          background: T.accentDeep,
          color: "#fff",
        }}
      >
        Got it
      </button>
    </aside>
  );
}
