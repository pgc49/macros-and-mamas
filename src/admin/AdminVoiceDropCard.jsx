import { useCallback, useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { db } from "../db/db";
import {
  clearVoiceDropDraft,
  loadVoiceDropDraft,
  saveVoiceDropDraft,
} from "../lib/voiceDropDraft";
import {
  formatVoiceDuration,
  startVoiceRecording,
  voiceFileExtension,
  voiceRecordingSupported,
} from "../lib/voiceMemo";

/**
 * Admin: record + publish Monday voice drop (Today PSA, one audio file).
 * Default audience = admins, notify off — safe for Cloudflare preview testing.
 * Draft audio is persisted in IndexedDB so a failed publish doesn’t lose the take.
 */
export function AdminVoiceDropCard({ activeMamaCount = 0, allMamaCount = 0 }) {
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState("admins");
  const [notify, setNotify] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [preview, setPreview] = useState(null); // { file, url, durationMs }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [latest, setLatest] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const recorderRef = useRef(null);
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const captionRef = useRef("");

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    captionRef.current = caption;
  }, [caption]);

  const refreshLatest = useCallback(async () => {
    try {
      const row = await db.loadLatestVoiceDropAdmin();
      setLatest(row);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    refreshLatest();
  }, [refreshLatest]);

  // Restore draft after refresh / failed publish.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadVoiceDropDraft();
        if (cancelled || !draft) return;
        setPreview({
          file: draft.file,
          url: draft.url,
          durationMs: draft.durationMs,
        });
        if (draft.caption) setCaption(draft.caption);
        setDraftRestored(true);
        setMsg("Restored your saved voice drop draft — you can publish or download it.");
      } catch (e) {
        console.warn("voice drop draft restore failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist draft whenever preview changes.
  useEffect(() => {
    if (!preview?.file) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await saveVoiceDropDraft({
          blob: preview.file,
          mime: preview.file.type,
          durationMs: preview.durationMs,
          caption: captionRef.current,
          fileName: preview.file.name,
        });
      } catch (e) {
        if (!cancelled) console.warn("voice drop draft save failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [preview]);

  // Keep caption in the draft too.
  useEffect(() => {
    if (!preview?.file) return undefined;
    const t = window.setTimeout(() => {
      saveVoiceDropDraft({
        blob: preview.file,
        mime: preview.file.type,
        durationMs: preview.durationMs,
        caption,
        fileName: preview.file.name,
      }).catch((e) => console.warn("voice drop draft caption save failed", e));
    }, 300);
    return () => window.clearTimeout(t);
  }, [caption, preview]);

  useEffect(() => () => {
    try { recorderRef.current?.cancel?.(); } catch { /* ignore */ }
    const url = previewRef.current?.url;
    if (url) URL.revokeObjectURL(url);
  }, []);

  const clearPreview = async ({ wipeDraft = true } = {}) => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setDraftRestored(false);
    if (wipeDraft) {
      try { await clearVoiceDropDraft(); } catch (e) { console.warn(e); }
    }
  };

  const setPreviewFromBlob = (blob, { mime, durationMs, fileName } = {}) => {
    const type = String(mime || blob.type || "audio/mp4").split(";")[0].trim();
    const ext = voiceFileExtension(type);
    const file = blob instanceof File
      ? blob
      : new File([blob], fileName || `monday-voice.${ext}`, { type });
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({
      file,
      url: URL.createObjectURL(file),
      durationMs: Number(durationMs) || 0,
    });
    setDraftRestored(false);
  };

  const startRecording = async () => {
    if (busy || recording) return;
    setError("");
    setMsg("");
    if (!voiceRecordingSupported()) {
      setError("Voice recording isn’t supported in this browser — try Chrome or Safari.");
      return;
    }
    await clearPreview({ wipeDraft: true });
    try {
      const session = await startVoiceRecording({
        onTick: (ms) => setRecordMs(ms),
      });
      recorderRef.current = session;
      setRecording(true);
      setRecordMs(0);
      session.result
        .then((result) => {
          const mime = String(result.mimeType || "audio/webm").split(";")[0].trim();
          setPreviewFromBlob(result.blob, {
            mime,
            durationMs: result.durationMs,
          });
        })
        .catch((e) => {
          console.error(e);
          setError(e.message || "Couldn’t finish recording.");
        })
        .finally(() => {
          recorderRef.current = null;
          setRecording(false);
        });
    } catch (e) {
      console.error(e);
      const denied = /Permission|NotAllowed|denied/i.test(String(e?.name || e?.message || ""));
      setError(
        denied
          ? "Microphone blocked — allow mic access for this site, then try again."
          : (e.message || "Couldn’t start recording."),
      );
      setRecording(false);
      recorderRef.current = null;
    }
  };

  const stopRecording = () => {
    try { recorderRef.current?.stop?.(); } catch { /* ignore */ }
  };

  const cancelRecording = () => {
    try { recorderRef.current?.cancel?.(); } catch { /* ignore */ }
    recorderRef.current = null;
    setRecording(false);
    setRecordMs(0);
  };

  const downloadDraft = () => {
    if (!preview?.file || !preview?.url) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.file.name || "monday-voice-draft.m4a";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMsg("Downloaded a copy of this draft to your device.");
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setMsg("");
    if (!String(file.type || "").startsWith("audio/")) {
      setError("Please choose an audio file (m4a, mp3, webm, etc.).");
      return;
    }
    let durationMs = 0;
    try {
      durationMs = await readAudioDurationMs(file);
    } catch {
      durationMs = 0;
    }
    setPreviewFromBlob(file, {
      mime: file.type,
      durationMs,
      fileName: file.name,
    });
    setMsg("Loaded audio file — ready to publish.");
  };

  const publish = async () => {
    if (!preview?.file || busy) return;
    const who = audience === "admins"
      ? "admins only (test)"
      : audience === "all_mamas"
        ? `${allMamaCount} mamas`
        : `${activeMamaCount} active mamas`;
    const notifyLine = notify
      ? " Push/email WILL go out (preview uses the live database)."
      : " No push/email.";
    if (!window.confirm(
      `Publish this Monday voice drop to ${who}?`
      + " It shows on Today for 7 days (or until the next drop)."
      + " Messages stay 1:1 — no thread copies."
      + notifyLine,
    )) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      // Re-save right before upload so a mid-flight failure still has the take.
      await saveVoiceDropDraft({
        blob: preview.file,
        mime: preview.file.type,
        durationMs: preview.durationMs,
        caption,
        fileName: preview.file.name,
      });
      const result = await db.publishVoiceDrop({
        file: preview.file,
        caption,
        audience,
        notify,
        durationMs: preview.durationMs,
      });
      await clearPreview({ wipeDraft: true });
      setCaption("");
      setMsg(
        `Published`
        + (result.notify
          ? ` · ${result.pushSent || 0} push`
            + (result.emailSent ? ` · ${result.emailSent} email` : "")
          : " · banner only (no notify)")
        + ".",
      );
      refreshLatest();
    } catch (e) {
      console.error(e);
      setError(
        (e.message || "Couldn’t publish voice drop.")
        + " Your recording is still saved on this device — try Publish again, or Download a backup.",
      );
    } finally {
      setBusy(false);
    }
  };

  const latestLive = latest
    && latest.status === "published"
    && latest.expires_at
    && new Date(latest.expires_at).getTime() > Date.now();

  return (
    <Card style={{ marginBottom: 14, padding: 14 }}>
      <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Monday voice drop</div>
      <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
        One audio PSA on Today for active listeners — not copied into Messages.
        Recordings up to about 50 MB are fine (a full ~10 minute memo usually fits).
        Drafts auto-save on this device if publish fails.
        Use <strong style={{ fontWeight: 700, color: T.ink }}>Admins only</strong> on Cloudflare preview
        so real mamas aren’t notified.
      </p>

      {latest && (
        <div style={{
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 12,
          background: latestLive ? T.sageSoft : T.track,
          border: `1px solid ${T.border}`,
        }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>
            {latestLive ? "Live now" : "Last drop"}
            {" · "}
            {latest.audience}
            {" · "}
            {latest.status}
          </div>
          {latest.caption ? (
            <div style={{ fontSize: 13.5, color: T.ink, marginBottom: 6, fontFamily: F }}>
              {latest.caption}
            </div>
          ) : null}
          {latest.audioUrl ? (
            <audio controls preload="metadata" src={latest.audioUrl} style={{ width: "100%", height: 36 }} />
          ) : null}
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
            {latest.published_at
              ? `Published ${new Date(latest.published_at).toLocaleString()}`
              : ""}
            {latestLive && latest.expires_at
              ? ` · expires ${new Date(latest.expires_at).toLocaleDateString()}`
              : ""}
          </div>
        </div>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="Optional caption (theme for the week)…"
        disabled={busy || recording}
        style={{
          ...inputStyle,
          resize: "vertical",
          minHeight: 56,
          fontFamily: F,
        }}
      />

      {recording && (
        <div style={{
          marginTop: 10,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1.5px solid ${T.accent}`,
          background: T.accentSoft,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
        >
          <span style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: T.accent,
            flexShrink: 0,
          }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Recording…</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              {formatVoiceDuration(recordMs)} · max 10 min
            </div>
          </div>
          <Btn small ghost onClick={cancelRecording}>Cancel</Btn>
          <Btn small onClick={stopRecording}>Stop</Btn>
        </div>
      )}

      {!recording && preview && (
        <div style={{
          marginTop: 10,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
        }}
        >
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            gap: 8,
            alignItems: "center",
          }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              Ready · {formatVoiceDuration(preview.durationMs)}
              {draftRestored ? " · restored draft" : ""}
              {preview.file?.size
                ? ` · ${(preview.file.size / (1024 * 1024)).toFixed(1)} MB`
                : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={downloadDraft}
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.accentDeep,
                  fontWeight: 700,
                  fontFamily: F,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => clearPreview({ wipeDraft: true })}
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.inkSoft,
                  fontWeight: 700,
                  fontFamily: F,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Discard
              </button>
            </div>
          </div>
          <audio controls preload="metadata" src={preview.url} style={{ width: "100%", height: 36 }} />
        </div>
      )}

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginTop: 10,
      }}
      >
        {!recording && !preview && (
          <>
            <Btn small onClick={startRecording} disabled={busy}>
              Record voice drop
            </Btn>
            <Btn
              small
              ghost
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Upload audio file
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.webm,.ogg,.wav,.aac"
              style={{ display: "none" }}
              onChange={onPickFile}
            />
          </>
        )}
        <label style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
          To
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            disabled={busy || recording}
            style={{
              ...inputStyle,
              width: "auto",
              padding: "8px 10px",
              fontSize: 13,
            }}
          >
            <option value="admins">Admins only (preview / test)</option>
            <option value="active">Active mamas ({activeMamaCount})</option>
            <option value="all_mamas">All mamas ({allMamaCount})</option>
          </select>
        </label>
        <label style={{
          fontSize: 13,
          color: T.ink,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
        }}
        >
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            disabled={busy || recording}
          />
          Send push / email
        </label>
        <Btn
          small
          onClick={publish}
          disabled={busy || recording || !preview}
        >
          {busy ? "Publishing…" : "Publish voice drop"}
        </Btn>
      </div>

      {audience !== "admins" && notify && (
        <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8, lineHeight: 1.4 }}>
          Preview deploys share the live database — this will notify real members.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: T.amber, marginTop: 10 }}>{error}</div>
      )}
      {msg && (
        <div style={{ fontSize: 13, color: "#3E5A46", marginTop: 10 }}>{msg}</div>
      )}
    </Card>
  );
}

function readAudioDurationMs(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const sec = Number(audio.duration);
      URL.revokeObjectURL(url);
      if (!Number.isFinite(sec) || sec <= 0) resolve(0);
      else resolve(Math.round(sec * 1000));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn’t read audio duration"));
    };
    audio.src = url;
  });
}
