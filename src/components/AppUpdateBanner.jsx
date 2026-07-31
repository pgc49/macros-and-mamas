import { useCallback, useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  APP_BUILD_ID,
  consumePostUpdateFlag,
  dismissUpdateThisSession,
  fetchRemoteAppVersion,
  hardReloadApp,
  hasSeenReleaseNotes,
  markReleaseNotesSeen,
  wasUpdateDismissedThisSession,
} from "../lib/appUpdate";

function queryFlag(name) {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

function NotesList({ notes }) {
  if (!notes?.bullets?.length) return null;
  return (
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
  );
}

/**
 * Two modes:
 * 1) Update ready — home-screen is on an older build than production.
 * 2) What’s new — already on the latest build, but these release notes
 *    haven’t been acknowledged yet (covers the “old app couldn’t show
 *    notes” case after someone taps Update).
 *
 * Preview: ?demoUpdateBanner=1  or  ?demoWhatsNew=1
 */
export function AppUpdateBanner() {
  const [mode, setMode] = useState(null); // "update" | "whatsNew" | null
  const [remoteBuildId, setRemoteBuildId] = useState(null);
  const [notes, setNotes] = useState(null);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (queryFlag("demoUpdateBanner")) {
      setDemo(true);
      const remote = await fetchRemoteAppVersion();
      setMode("update");
      setRemoteBuildId(remote?.buildId || "demo");
      setNotes(remote?.notes || null);
      return;
    }
    if (queryFlag("demoWhatsNew")) {
      setDemo(true);
      const remote = await fetchRemoteAppVersion();
      setMode("whatsNew");
      setRemoteBuildId(remote?.buildId || "demo");
      setNotes(remote?.notes || null);
      return;
    }

    setDemo(false);
    const justUpdated = consumePostUpdateFlag();

    // Local vite — only demos above.
    if (!APP_BUILD_ID || APP_BUILD_ID === "dev") {
      setMode(null);
      return;
    }

    const remote = await fetchRemoteAppVersion();
    if (!remote) {
      setMode(null);
      return;
    }

    // Behind production → update prompt (notes if this client can show them).
    if (remote.buildId !== APP_BUILD_ID) {
      if (wasUpdateDismissedThisSession(remote.buildId)) {
        setMode(null);
        return;
      }
      setRemoteBuildId(remote.buildId);
      setNotes(remote.notes || null);
      setMode("update");
      return;
    }

    // Up to date — show What’s new once if notes exist and unread.
    // justUpdated forces the card even if storage is flaky after reload.
    if (remote.notes?.bullets?.length) {
      const seen = hasSeenReleaseNotes(remote.notes.id);
      if (!seen || justUpdated) {
        setRemoteBuildId(remote.buildId);
        setNotes(remote.notes);
        setMode("whatsNew");
        return;
      }
    }

    setMode(null);
    setNotes(null);
    setRemoteBuildId(null);
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

  if (!mode) return null;

  const onUpdate = async () => {
    if (demo) {
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        setMode(null);
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

  const onDismissUpdate = () => {
    if (!demo) dismissUpdateThisSession(remoteBuildId);
    setMode(null);
    setDemo(false);
  };

  const onDismissWhatsNew = () => {
    if (!demo && notes?.id) markReleaseNotesSeen(notes.id);
    setMode(null);
    setDemo(false);
  };

  if (mode === "whatsNew") {
    return (
      <div
        role="status"
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 14,
          background: T.sageSoft,
          border: `1.5px solid ${T.border}`,
        }}
      >
        <div style={{ fontFamily: FD, fontSize: 18, color: T.ink, marginBottom: 4 }}>
          You’re up to date
        </div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45, fontFamily: F }}>
          Here’s what changed in this update:
        </p>
        <NotesList notes={notes} />
        {demo ? (
          <p style={{ fontSize: 12.5, color: T.amber, margin: "0 0 10px", lineHeight: 1.4, fontFamily: F }}>
            Demo preview — Got it won’t persist.
          </p>
        ) : null}
        <Btn small onClick={onDismissWhatsNew}>
          Got it
        </Btn>
      </div>
    );
  }

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
      <NotesList notes={notes} />
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
        <Btn small ghost onClick={onDismissUpdate} disabled={busy}>
          Later
        </Btn>
      </div>
    </div>
  );
}
