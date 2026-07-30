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

function demoUpdateBannerRequested() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("demoUpdateBanner") === "1";
  } catch {
    return false;
  }
}

/**
 * Shown when the home-screen / open tab is on an older build than production.
 * "Update app" hard-reloads; "Later" hides until the next session (or newer build).
 * Preview/test: add ?demoUpdateBanner=1 to force the banner on.
 */
export function AppUpdateBanner() {
  const [remoteBuildId, setRemoteBuildId] = useState(null);
  const [demo, setDemo] = useState(() => demoUpdateBannerRequested());
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (demoUpdateBannerRequested()) {
      setDemo(true);
      setRemoteBuildId("demo");
      return;
    }
    setDemo(false);
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
    if (demo) {
      // Demo mode — don't hard-reload away from the preview query param.
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        setRemoteBuildId(null);
        setDemo(false);
      }, 600);
      return;
    }
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
    if (!demo) dismissUpdateThisSession(remoteBuildId);
    setRemoteBuildId(null);
    setDemo(false);
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
        {demo ? (
          <span style={{ display: "block", marginTop: 6, fontSize: 12.5, color: T.amber }}>
            Demo preview — Update won’t reload the page.
          </span>
        ) : null}
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
