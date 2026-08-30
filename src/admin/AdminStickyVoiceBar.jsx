import { useEffect, useRef, useState } from "react";
import { T, F } from "../theme/tokens";
import {
  formatVoiceDuration,
  startVoiceRecording,
  voiceFileExtension,
  voiceRecordingSupported,
} from "../lib/voiceMemo";
import { db } from "../db/db";

/**
 * Admin-only sticky recorder. Visible when the inline thread composer
 * has scrolled off-screen so Callie can still voice-memo from Her day / Progress.
 * Does not change mama-facing MessagesThread.
 */
export function AdminStickyVoiceBar({ clientId, visible, onSent }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ms, setMs] = useState(0);
  const recorderRef = useRef(null);

  useEffect(() => () => {
    try { recorderRef.current?.cancel?.(); } catch { /* ignore */ }
  }, []);

  if (!visible || !clientId) return null;

  const start = async () => {
    setError("");
    if (!voiceRecordingSupported()) {
      setError("Voice recording isn’t supported in this browser.");
      return;
    }
    try {
      const session = await startVoiceRecording({
        onTick: (elapsed) => setMs(elapsed),
      });
      recorderRef.current = session;
      setRecording(true);
      setMs(0);
      const { blob, mimeType, durationMs } = await session.result;
      setRecording(false);
      recorderRef.current = null;
      const ext = voiceFileExtension(mimeType);
      const file = new File([blob], `voice-memo.${ext}`, { type: mimeType || "audio/webm" });
      setBusy(true);
      await db.sendMessage({ clientId, body: "", file });
      onSent?.();
      setMs(durationMs || 0);
    } catch (e) {
      setRecording(false);
      setError(e.message || "Couldn’t record.");
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    try { recorderRef.current?.stop?.(); } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: `1.5px solid ${T.accent}`,
        background: T.accentSoft,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        fontFamily: F,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep }}>
        {recording ? `Recording · ${formatVoiceDuration(ms)}` : "Record a voice memo"}
        {error ? <div style={{ fontWeight: 600, color: T.amber, marginTop: 2 }}>{error}</div> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={recording ? stop : start}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "8px 14px",
          background: T.accent,
          color: "#fff",
          fontWeight: 700,
          fontFamily: F,
          fontSize: 13,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Sending…" : recording ? "Stop + send" : "Record"}
      </button>
    </div>
  );
}
