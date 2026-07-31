import { useCallback, useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  APP_BUILD_ID,
  dismissUpdateThisSession,
  fetchRemoteAppVersion,
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
 *
 * Optional release notes come from /api/app-version (set in
 * functions/_shared/releaseNotes.js for significant UI ships).
 *
 * Preview banner + notes on any deploy: ?demoUpdateBanner=1
 */
export function AppUpdateBanner() {
  const [remoteBuildId, setRemoteBuildId] = useState(null);
  const [notes, setNotes] = useState(null);
  const [demo, setDemo] = useState(() => demoUpdateBannerRequested());
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (demoUpdateBannerRequested()) {
      setDemo(true);
      // Pull live notes from this deploy so preview matches production copy.
      const remote = await fetchRemoteAppVersion();
      setRemoteBuildId(remote?.buildId || "demo");
      setNotes(remote?.notes || null);
      return;
    }
    setDemo(false);
    // Skip noisy prompts in local vite (build id is always "dev").
    if (!APP_BUILD_ID || APP_BUILD_ID === "dev") return;
    const remote = await fetchRemoteAppVersion();
    if (!remote || remote.buildId === APP_BUILD_ID) {
      setRemoteBuildId(null);
      setNotes(null);
      return;
    }
    if (wasUpdateDismissedThisSession(remote.buildId)) {
      setRemoteBuildId(null);
      setNotes(null);
      return;
    }
    setRemoteBuildId(remote.buildId);
    setNotes(remote.notes || null);
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
        setNotes(null);
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
    setNotes(null);
    setDemo(false);
  };

  const hasNotes = Array.isArray(notes?.bullets) && notes.bullets.length > 0;

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
      {hasNotes ? (
        <div style={{ margin: "0 0 10px" }}>
          <div style={{
            fontFamily: F,
            fontSize: 12,
            fontWeight: 700,
            color: T.accentDeep,
            letterSpacing: 0.3,
            marginBottom: 6,
          }}
          >
            {notes.headline || "What’s new"}
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: 18,
            fontFamily: F,
            fontSize: 13,
            color: T.ink,
            lineHeight: 1.45,
          }}
          >
            {notes.bullets.map((b) => (
              <li key={b} style={{ marginBottom: 4 }}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {demo ? (
        <p style={{ fontSize: 12.5, color: T.amber, margin: "0 0 10px", lineHeight: 1.4, fontFamily: F }}>
          Demo preview — Update won’t reload the page.
          {" "}Edit notes in <code style={{ fontSize: 11 }}>functions/_shared/releaseNotes.js</code>.
        </p>
      ) : null}
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
