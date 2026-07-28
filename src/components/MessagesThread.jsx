import { useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import {
  enablePushNotifications,
  isStandaloneDisplay,
  notificationPermission,
  pushSupported,
  registerMessageServiceWorker,
} from "../lib/push";

const ACCEPT_ATTACH = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf,.pdf";

/**
 * Shared chat thread UI (mama Messages tab + admin per-client thread).
 * onSend(body, file?) — body may be empty when sending a photo/PDF alone.
 */
export function MessagesThread({
  title = "Callie",
  subtitle = "Private messages — just you two",
  messages = [],
  selfId,
  busy = false,
  onSend,
  onMarkRead,
  showPushPrompt = false,
  onSavePushSubscription,
}) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const draftRef = useRef(null);

  useEffect(() => {
    registerMessageServiceWorker();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    onMarkRead?.();
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Grow the composer with the text (up to ~6 lines), then scroll inside.
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 52), 160);
    el.style.height = `${next}px`;
  }, [draft]);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setAttachError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = (e) => {
    const next = e.target.files?.[0] || null;
    setAttachError("");
    if (!next) {
      clearFile();
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setAttachError("That file is over 10 MB — try a smaller photo.");
      e.target.value = "";
      return;
    }
    const mime = String(next.type || "").toLowerCase();
    const ok = mime.startsWith("image/") || mime === "application/pdf";
    if (!ok) {
      setAttachError("Photos or a PDF only.");
      e.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(mime.startsWith("image/") ? URL.createObjectURL(next) : null);
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !file) || busy || !onSend) return;
    const keptText = text;
    const keptFile = file;
    setDraft("");
    clearFile();
    try {
      await onSend(keptText, keptFile);
    } catch (e) {
      console.error(e);
      setDraft(keptText);
      if (keptFile) {
        setFile(keptFile);
        if (String(keptFile.type || "").startsWith("image/")) {
          setPreviewUrl(URL.createObjectURL(keptFile));
        }
      }
      setAttachError(e.message || "Couldn’t send.");
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const result = await enablePushNotifications(onSavePushSubscription);
      if (result.ok) setPushMsg("Notifications on — you’ll get a ping for new messages.");
      else if (result.reason === "not_standalone") {
        setPushMsg("Open Macros and Mamas from your Home Screen icon first, then tap again.");
      } else if (result.reason === "denied") {
        setPushMsg("Notifications blocked — enable them in iPhone Settings → Notifications.");
      } else {
        setPushMsg("Push isn’t available on this device — you’ll still get email.");
      }
    } catch (e) {
      console.error(e);
      setPushMsg("Couldn’t turn on notifications — try again.");
    } finally {
      setPushBusy(false);
    }
  };

  const needPushPrompt = showPushPrompt
    && pushSupported()
    && notificationPermission() !== "granted";

  const canSend = !busy && (!!draft.trim() || !!file);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "55vh" }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>{title}</h2>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0, lineHeight: 1.45 }}>{subtitle}</p>
      </div>

      {needPushPrompt && (
        <div style={{
          background: T.accentSoft,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 12,
        }}
        >
          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45, marginBottom: 8 }}>
            {isStandaloneDisplay()
              ? "Turn on notifications so you don’t miss Callie when you’re not in the app."
              : "For lock-screen pings, open this app from your Home Screen icon, then enable notifications."}
          </div>
          <Btn small onClick={enablePush} disabled={pushBusy}>
            {pushBusy ? "Working…" : "Turn on notifications"}
          </Btn>
          {pushMsg && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.4 }}>{pushMsg}</div>
          )}
        </div>
      )}
      {!needPushPrompt && pushMsg && (
        <div style={{ fontSize: 12.5, color: "#3E5A46", marginBottom: 10 }}>{pushMsg}</div>
      )}

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fff",
          border: `1.5px solid ${T.border}`,
          borderRadius: 14,
          padding: 12,
          minHeight: 280,
          maxHeight: "52vh",
        }}
      >
        {!messages.length && (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, padding: "20px 8px", textAlign: "center" }}>
            No messages yet — say hi or send a photo. Callie will reply here.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === selfId;
          const isImage = String(m.attachment_mime || "").startsWith("image/");
          const hasAttach = !!m.attachment_path;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div style={{
                maxWidth: "85%",
                background: mine ? T.accentSoft : T.sageSoft,
                color: T.ink,
                borderRadius: 14,
                padding: "10px 12px",
                fontFamily: F,
                fontSize: 14.5,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              >
                {!mine && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>
                    Callie
                  </div>
                )}
                {hasAttach && isImage && m.attachmentUrl && (
                  <a href={m.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: m.body ? 8 : 0 }}>
                    <img
                      src={m.attachmentUrl}
                      alt={m.attachment_name || "Attachment"}
                      style={{
                        display: "block",
                        maxWidth: "100%",
                        maxHeight: 240,
                        borderRadius: 10,
                        objectFit: "cover",
                      }}
                    />
                  </a>
                )}
                {hasAttach && !isImage && (
                  <a
                    href={m.attachmentUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      marginBottom: m.body ? 8 : 0,
                      color: T.accentDeep,
                      fontWeight: 700,
                      fontSize: 13.5,
                      textDecoration: "underline",
                    }}
                  >
                    {m.attachment_name || "Open attachment"}
                  </a>
                )}
                {hasAttach && isImage && !m.attachmentUrl && (
                  <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: m.body ? 8 : 0 }}>
                    Photo attached
                  </div>
                )}
                {m.body}
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>
                  {formatMsgTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {(file || attachError) && (
        <div style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {attachError ? (
              <div style={{ fontSize: 13, color: T.amber }}>{attachError}</div>
            ) : (
              <div style={{ fontSize: 13.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file?.name || "Attachment"}
              </div>
            )}
            {file && !attachError && (
              <div style={{ fontSize: 12, color: T.inkSoft }}>Ready to send</div>
            )}
          </div>
          {file && (
            <button
              type="button"
              onClick={clearFile}
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
              Remove
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <label
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 12,
            border: `1.5px solid ${T.border}`,
            background: "#fff",
            color: T.accentDeep,
            fontWeight: 800,
            fontSize: 18,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
          title="Attach photo or PDF"
          aria-label="Attach photo or PDF"
        >
          +
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTACH}
            disabled={busy}
            onChange={onPickFile}
            style={{ display: "none" }}
          />
        </label>
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          rows={1}
          placeholder="Write a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            flex: 1,
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${T.border}`,
            fontFamily: F,
            fontSize: 15,
            lineHeight: 1.4,
            resize: "none",
            overflowY: "auto",
            color: T.ink,
            background: "#fff",
            minHeight: 52,
            maxHeight: 160,
          }}
        />
        <Btn onClick={send} disabled={!canSend} style={{ flexShrink: 0 }}>
          {busy ? "…" : "Send"}
        </Btn>
      </div>
    </div>
  );
}

function formatMsgTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
