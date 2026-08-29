import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  enablePushNotifications,
  isStandaloneDisplay,
  notificationPermission,
  pushSupported,
} from "../lib/push";
import {
  NOTIFICATIONS_TIP_STORAGE_KEY,
  shouldShowNotificationsTip,
} from "../lib/notificationsTip";

function wasDismissedLocally() {
  try {
    return localStorage.getItem(NOTIFICATIONS_TIP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissedLocally() {
  try {
    localStorage.setItem(NOTIFICATIONS_TIP_STORAGE_KEY, "1");
  } catch {
    /* private mode — session hide still applies via state */
  }
}

/**
 * Cohort 2 Today card: how to get lock-screen pings.
 * Hidden for Founding, after Got it, or once notifications are already on.
 */
export function NotificationsTip({
  cohortLabel = null,
  onSavePushSubscription,
}) {
  const [dismissed, setDismissed] = useState(() => wasDismissedLocally());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [permission, setPermission] = useState(() => notificationPermission());

  const visible = shouldShowNotificationsTip({
    cohortLabel,
    permission,
    dismissedLocally: dismissed,
  });

  if (!visible) return null;

  const dismiss = () => {
    persistDismissedLocally();
    setDismissed(true);
  };

  const enable = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (!pushSupported()) {
        setMsg("Notifications aren’t available in this browser. Open the app from your phone’s home screen.");
        return;
      }
      const result = await enablePushNotifications(onSavePushSubscription);
      if (result.ok) {
        setPermission("granted");
        persistDismissedLocally();
        setDismissed(true);
        return;
      }
      if (result.reason === "not_standalone") {
        setMsg("iPhone: add the app to your Home Screen first, open it from that icon, then tap again. Android: you can tap Allow on the next prompt.");
      } else if (result.reason === "denied") {
        setMsg("Notifications are blocked. On iPhone: Settings → Notifications → Macros and Mamas → Allow.");
      } else {
        setMsg("Couldn’t turn on notifications on this device — you’ll still get email.");
      }
    } catch (e) {
      console.error(e);
      setMsg("Couldn’t turn on notifications — try again.");
    } finally {
      setBusy(false);
    }
  };

  const pinned = isStandaloneDisplay();

  return (
    <aside
      aria-label="Turn on notifications"
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
        Turn on notifications
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
        {pinned
          ? "Tap below, then Allow, so you don’t miss Callie when you’re not in the app."
          : "iPhone needs the home-screen icon first (card above). Open from that icon, then tap below and Allow. Android can tap Allow here in Chrome."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn small onClick={enable} disabled={busy}>
          {busy ? "Working…" : "Turn on notifications"}
        </Btn>
        <button
          type="button"
          onClick={dismiss}
          style={{
            border: "none",
            background: "transparent",
            color: T.accentDeep,
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            padding: "4px 0 0",
          }}
        >
          Got it
        </button>
      </div>
      {msg ? (
        <p style={{ fontSize: 12.5, color: T.ink, margin: "10px 0 0", lineHeight: 1.4, fontFamily: F }}>
          {msg}
        </p>
      ) : null}
    </aside>
  );
}
