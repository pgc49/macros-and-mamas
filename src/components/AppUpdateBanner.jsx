import { useCallback, useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  APP_BUILD_ID,
  dismissUpdateThisSession,
  fetchRemoteBuildId,
  hardReloadApp,
  wasUpdateDismissedThisSession,
} from "../lib/appUpdate";

/**
 * Shown when the home-screen / open tab is on an older build than production.
 * "Update app" hard-reloads; "Later" hides until the next session (or newer build).
 */
export function AppUpdateBanner() {
  const [remoteBuildId, setRemoteBuildId] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    // Skip noisy prompts in local vite (build id is always "dev").
    if (!APP_BUILD_ID || APP_BUILD_ID === "dev") return;
    const remote = await fetchRemoteBuildId();
    if (!remote || remote === APP_BUILD_ID) {
      setRemoteBuildId(null);
      return;
    }
    if (wasUpdateDismissedThisSession(remote)) {
      setRemoteBuildId(null);
      return;
    }
    setRemoteBuildId(remote);
  }, []);

  useEffect(() => {
    check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [check]);

  if (!remoteBuildId) return null;

  const onUpdate = async () => {
    setBusy(true);
    try {
      await hardReloadApp();
    } catch (e) {
      console.error(e);
      setBusy(false);
      window.location.reload();
    }
  };

  const onLater = () => {
    dismissUpdateThisSession(remoteBuildId);
    setRemoteBuildId(null);
  };

  return (
    <div
      role="status"
      style={{
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 14,
        background: T.amberSoft,
        border: `1.5px solid ${T.border}`,
      }}
    >
      <div style={{ fontFamily: FD, fontSize: 18, color: T.ink, marginBottom: 4 }}>
        App update ready
      </div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45, fontFamily: F }}>
        A newer version of Macros and Mamas is live. Tap Update so your home-screen app loads the latest.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn small onClick={onUpdate} disabled={busy}>
          {busy ? "Updating…" : "Update app"}
        </Btn>
        <Btn small ghost onClick={onLater} disabled={busy}>
          Later
        </Btn>
      </div>
    </div>
  );
}
