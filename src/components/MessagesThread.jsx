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
import { REACTION_EMOJIS } from "../lib/messageReactions";
import {
  formatVoiceDuration,
  isAudioAttachmentMime,
  startVoiceRecording,
  voiceFileExtension,
  voiceRecordingSupported,
} from "../lib/voiceMemo";
import { VoiceMemoPlayer } from "./VoiceMemoPlayer";

const ACCEPT_ATTACH = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf,.pdf";

/**
 * Shared chat thread UI (mama Messages tab + admin per-client thread).
 * onSend(body, file?, opts?) — body may be empty when sending a photo/PDF/voice alone.
 * opts.replyToId — reply/quote target when enableReply is on (DMs + channels).
 * allowVoiceMemo — admin-only record control; mamas can only play voice memos.
 * onReact(messageId, emoji) — iMessage-style tapback toggle.
 */
export function MessagesThread({
  title = "Callie",
  subtitle = "Private messages — just you two",
  messages = [],
  selfId,
  peerName = "Callie",
  /** Optional: map sender_id → display label for incoming bubbles. */
  senderNameById = null,
  /** Thread's mama id (admin views). Incoming from this id = mama; other admins = their name / Callie. */
  threadClientId = null,
  /**
   * Admin-only: show Delivered / Read under coach outbound using messages.read_at
   * (mama opened the thread). Inbox unread bubbles stay separate — mama→Callie only.
   */
  showReadReceipts = false,
  /** Admin-only: show mic to record / send voice memos. */
  allowVoiceMemo = false,
  /** Long-press → Reply (stores reply_to_id). On for DMs + channels. */
  enableReply = true,
  /** When false, hide tapback picker (default on when onReact is provided). */
  enableReactions = true,
  busy = false,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onMarkRead,
  showPushPrompt = false,
  onSavePushSubscription,
  headerExtra = null,
  banner = null,
  hideComposer = false,
  showSenderNames = false,
  /** When true, selfId may delete/edit others' messages (admin moderation). */
  canModerate = false,
  emptyState = "No messages yet — say hi or send a photo. Callie will reply here.",
  compact = false,
  onComposerFocusChange,
}) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [reactBusyId, setReactBusyId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [voicePreview, setVoicePreview] = useState(null); // { file, url, durationMs }
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const draftRef = useRef(null);
  const holdTimer = useRef(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    registerMessageServiceWorker();
  }, []);

  // Keep the latest message in view inside the list pane (iMessage-style).
  // Do NOT use scrollIntoView — it scrolls the page and fights flex height.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const jump = () => {
      el.scrollTop = el.scrollHeight;
    };
    jump();
    const t1 = window.setTimeout(jump, 50);
    const t2 = window.setTimeout(jump, 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Last id: new tip message; length: empty → first load.
  }, [messages.length, messages[messages.length - 1]?.id]);

  useEffect(() => {
    onMarkRead?.();
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (voicePreview?.url) URL.revokeObjectURL(voicePreview.url);
  }, [voicePreview?.url]);

  useEffect(() => () => {
    try { recorderRef.current?.cancel?.(); } catch { /* ignore */ }
    recorderRef.current = null;
  }, []);

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

  const clearVoicePreview = () => {
    if (voicePreview?.url) URL.revokeObjectURL(voicePreview.url);
    setVoicePreview(null);
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
    clearVoicePreview();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(mime.startsWith("image/") ? URL.createObjectURL(next) : null);
  };

  const startRecording = async () => {
    if (!allowVoiceMemo || busy || recording) return;
    setAttachError("");
    if (!voiceRecordingSupported()) {
      setAttachError("Voice recording isn’t supported in this browser — try Chrome or Safari.");
      return;
    }
    clearFile();
    clearVoicePreview();
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
          const ext = voiceFileExtension(mime);
          const voiceFile = new File(
            [result.blob],
            `voice-memo.${ext}`,
            { type: mime },
          );
          const url = URL.createObjectURL(result.blob);
          setVoicePreview({
            file: voiceFile,
            url,
            durationMs: result.durationMs,
          });
        })
        .catch((e) => {
          console.error(e);
          setAttachError(e.message || "Couldn’t finish recording.");
        })
        .finally(() => {
          recorderRef.current = null;
          setRecording(false);
        });
    } catch (e) {
      console.error(e);
      const denied = /Permission|NotAllowed|denied/i.test(String(e?.name || e?.message || ""));
      setAttachError(
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

  const send = async () => {
    const text = draft.trim();
    const attach = voicePreview?.file || file;
    if ((!text && !attach) || busy || !onSend || recording) return;
    const keptText = text;
    const keptFile = file;
    const keptVoice = voicePreview;
    const keptReply = replyTo;
    setDraft("");
    clearFile();
    clearVoicePreview();
    setReplyTo(null);
    try {
      await onSend(keptText, attach, keptReply?.id ? { replyToId: keptReply.id } : undefined);
    } catch (e) {
      console.error(e);
      setDraft(keptText);
      if (keptReply) setReplyTo(keptReply);
      if (keptVoice) {
        setVoicePreview(keptVoice);
      } else if (keptFile) {
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
      if (result.ok) {
        setPushMsg("Notifications on. Lock your phone or leave the app — iOS won’t show a banner while you’re inside it.");
      }
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

  const canSend = !hideComposer && !busy && !recording && (!!draft.trim() || !!file || !!voicePreview);

  const startEdit = (m) => {
    if (!onEdit || m.deleted_at) return;
    setMenuId(null);
    setEditingId(m.id);
    setEditDraft(m.body || "");
    setAttachError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async () => {
    if (!onEdit || !editingId || editBusy) return;
    const text = editDraft.trim();
    if (!text) {
      setAttachError("Edited message can’t be empty.");
      return;
    }
    setEditBusy(true);
    setAttachError("");
    try {
      await onEdit(editingId, text);
      cancelEdit();
    } catch (e) {
      console.error(e);
      setAttachError(e.message || "Couldn’t save edit.");
    } finally {
      setEditBusy(false);
    }
  };

  const removeMessage = async (m) => {
    if (!onDelete || !m?.id || editBusy) return;
    setMenuId(null);
    if (!window.confirm("Delete this message?")) return;
    setEditBusy(true);
    setAttachError("");
    try {
      await onDelete(m.id);
      if (editingId === m.id) cancelEdit();
    } catch (e) {
      console.error(e);
      setAttachError(e.message || "Couldn’t delete.");
    } finally {
      setEditBusy(false);
    }
  };

  const clearHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const canEditMsg = (m) => (
    !m.deleted_at
    && !!onEdit
    && m.sender_id === selfId
  );

  const canDeleteMsg = (m) => (
    !m.deleted_at
    && !!onDelete
    && (m.sender_id === selfId || canModerate)
  );

  const canReplyMsg = (m) => (
    enableReply
    && !hideComposer
    && !m.deleted_at
    && m.kind !== "system"
  );

  const canReactMsg = (m) => (
    enableReactions
    && typeof onReact === "function"
    && !m.deleted_at
    && m.kind !== "system"
    && !!m.id
  );

  const canManage = (m) => (
    canEditMsg(m) || canDeleteMsg(m) || canReplyMsg(m) || canReactMsg(m)
  );

  const startReply = (m) => {
    if (!canReplyMsg(m)) return;
    setMenuId(null);
    setEditingId(null);
    setReplyTo(m);
    window.setTimeout(() => draftRef.current?.focus?.(), 50);
  };

  const reactToMessage = async (m, emoji) => {
    if (!canReactMsg(m) || reactBusyId) return;
    setMenuId(null);
    setReactBusyId(m.id);
    setAttachError("");
    try {
      await onReact(m.id, emoji);
    } catch (e) {
      console.error(e);
      setAttachError(e.message || "Couldn’t save reaction.");
    } finally {
      setReactBusyId(null);
    }
  };

  const replyAuthorLabel = (m) => {
    if (!m) return "Mama";
    if (m.sender_id === selfId) return "You";
    if (senderNameById && m.sender_id && senderNameById[m.sender_id]) {
      return senderNameById[m.sender_id];
    }
    return incomingSenderLabel(m);
  };

  const replySnippet = (m) => {
    if (!m) return "";
    if (m.deleted_at || m.missing) return "Original message";
    const body = String(m.body || "").trim();
    if (body) return body.length > 90 ? `${body.slice(0, 90)}…` : body;
    if (m.attachment_name) return m.attachment_name;
    return "Attachment";
  };

  /** Label for bubbles that aren't "mine" — always from the real sender, never a single peerName blanket. */
  const incomingSenderLabel = (m) => {
    if (m.kind === "announcement") return "Announcement · Callie";
    if (senderNameById && senderNameById[m.sender_id]) {
      return senderNameById[m.sender_id];
    }
    if (threadClientId) {
      if (m.sender_id === threadClientId) return peerName || "Mama";
      // Another admin wrote in this mama thread — brand as Callie unless mapped above.
      return "Callie";
    }
    // Mama-facing 1:1: coach side is always Callie.
    return peerName || "Callie";
  };

  const openMenu = (m) => {
    if (!canManage(m) || editingId === m.id) return;
    setMenuId(m.id);
  };

  const pressHandlers = (m) => {
    if (!canManage(m)) return {};
    return {
      onContextMenu: (e) => {
        e.preventDefault();
        openMenu(m);
      },
      onTouchStart: () => {
        clearHold();
        holdTimer.current = window.setTimeout(() => openMenu(m), 450);
      },
      onTouchEnd: clearHold,
      onTouchMove: clearHold,
      onTouchCancel: clearHold,
      onMouseDown: (e) => {
        if (e.button !== 0) return;
        clearHold();
        holdTimer.current = window.setTimeout(() => openMenu(m), 450);
      },
      onMouseUp: clearHold,
      onMouseLeave: clearHold,
    };
  };

  useEffect(() => () => clearHold(), []);

  useEffect(() => {
    if (!menuId) return undefined;
    const onDoc = (e) => {
      if (e.target?.closest?.("[data-msg-menu]")) return;
      if (e.target?.closest?.(`[data-msg-id="${menuId}"]`)) return;
      setMenuId(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const iconBtn = {
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
    cursor: busy || recording ? "default" : "pointer",
    opacity: busy || recording ? 0.6 : 1,
    padding: 0,
    fontFamily: F,
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: compact ? 0 : "62vh",
      flex: 1,
      height: compact ? "100%" : undefined,
      minWidth: 0,
      // Compact (admin fill): clip to parent so the list scrolls, not the page.
      overflow: compact ? "hidden" : undefined,
    }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: 10 }}>
          {title ? (
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: compact ? 20 : 26, margin: "6px 0 2px" }}>{title}</h2>
          ) : null}
          {subtitle ? (
            <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0, lineHeight: 1.45 }}>{subtitle}</p>
          ) : null}
        </div>
      )}

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

      {headerExtra}
      {banner}

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fff",
          border: `1.5px solid ${T.border}`,
          borderRadius: 14,
          padding: 12,
          // Critical: default minHeight:auto prevents shrinking below content,
          // which expands the whole thread instead of scrolling inside the pane.
          minHeight: compact ? 0 : 280,
          minWidth: 0,
          /* compact (admin fill): fill parent. Mama tab keeps a viewport cap. */
          maxHeight: compact ? "none" : "min(64vh, 520px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {!messages.length && (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, padding: "20px 8px", textAlign: "center" }}>
            {emptyState}
          </div>
        )}
        {(() => {
          // Only annotate the latest relevant outbound — not every coach bubble.
          // Read → last coach message the mama has opened; Delivered → latest send if still unread.
          let lastReadId = null;
          let lastDeliveredId = null;
          if (showReadReceipts) {
            for (const m of messages) {
              if (m.deleted_at) continue;
              const coachOutbound = threadClientId
                ? m.sender_id !== threadClientId
                : m.sender_id === selfId;
              if (!coachOutbound) continue;
              if (m.read_at) lastReadId = m.id;
              else lastDeliveredId = m.id;
            }
            // If the latest outbound is read, don't also leave a stale Delivered marker.
            if (lastDeliveredId && lastReadId) {
              const readIdx = messages.findIndex((m) => m.id === lastReadId);
              const delIdx = messages.findIndex((m) => m.id === lastDeliveredId);
              if (readIdx > delIdx) lastDeliveredId = null;
            }
          }
          return messages.map((m) => {
          const mine = m.sender_id === selfId;
          const deleted = !!m.deleted_at;
          const isImage = String(m.attachment_mime || "").startsWith("image/");
          const isAudio = isAudioAttachmentMime(m.attachment_mime);
          const hasAttach = !!m.attachment_path && !deleted;
          const isEditing = editingId === m.id;
          const showMenu = menuId === m.id && canManage(m) && !isEditing;
          const receiptLabel = m.id === lastReadId
            ? "Read"
            : m.id === lastDeliveredId
              ? "Delivered"
              : null;
          const showReceipt = !!receiptLabel;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: 10,
                position: "relative",
              }}
            >
              <div
                data-msg-id={m.id}
                {...pressHandlers(m)}
                style={{
                  maxWidth: "85%",
                  background: deleted ? T.track : (mine ? T.accentSoft : T.sageSoft),
                  color: T.ink,
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontFamily: F,
                  fontSize: 14.5,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  // Keep copy/select for reply-only bubbles; suppress selection when
                  // edit/delete long-press would fight iOS text handles.
                  userSelect: (canEditMsg(m) || canDeleteMsg(m)) ? "none" : "text",
                  WebkitUserSelect: (canEditMsg(m) || canDeleteMsg(m)) ? "none" : "text",
                  cursor: canManage(m) ? "default" : undefined,
                }}
              >
                {!mine && !deleted && showSenderNames && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>
                    {incomingSenderLabel(m)}
                  </div>
                )}
                {!deleted && m.reply_to && (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: "6px 8px",
                      borderRadius: 8,
                      borderLeft: `3px solid ${T.accent}`,
                      background: mine ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.65)",
                      fontSize: 12.5,
                      lineHeight: 1.35,
                      color: T.inkSoft,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: T.accentDeep, marginBottom: 2 }}>
                      {replyAuthorLabel(m.reply_to)}
                    </div>
                    <div style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    >
                      {replySnippet(m.reply_to)}
                    </div>
                  </div>
                )}
                {deleted ? (
                  <div style={{ fontSize: 13.5, color: T.inkSoft, fontStyle: "italic" }}>
                    Message deleted
                  </div>
                ) : isEditing ? (
                  <div>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value.slice(0, 2000))}
                      rows={3}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: `1.5px solid ${T.border}`,
                        fontFamily: F,
                        fontSize: 14.5,
                        resize: "vertical",
                        color: T.ink,
                        background: "#fff",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Btn small onClick={saveEdit} disabled={editBusy || !editDraft.trim()}>
                        {editBusy ? "…" : "Save"}
                      </Btn>
                      <Btn small ghost onClick={cancelEdit} disabled={editBusy}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <>
                    {hasAttach && isImage && m.attachmentUrl && (
                      <a href={m.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: m.body ? 8 : 0 }}>
                        <img
                          src={m.attachmentUrl}
                          alt={m.attachment_name || "Attachment"}
                          draggable={false}
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
                    {hasAttach && isAudio && (
                      <div style={{ marginBottom: m.body ? 8 : 0 }}>
                        <VoiceMemoPlayer src={m.attachmentUrl || ""} />
                      </div>
                    )}
                    {hasAttach && !isImage && !isAudio && (
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
                  </>
                )}
                <div style={{
                  fontSize: 11,
                  color: T.inkSoft,
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "baseline",
                }}
                >
                  <span>
                    {formatMsgTime(m.created_at)}
                    {!deleted && m.edited_at ? " · edited" : ""}
                  </span>
                  {showReceipt ? (
                    <span style={{
                      fontWeight: receiptLabel === "Read" ? 700 : 600,
                      color: receiptLabel === "Read" ? T.accentDeep : T.inkSoft,
                      flexShrink: 0,
                    }}
                    >
                      {receiptLabel}
                    </span>
                  ) : null}
                </div>
                {!deleted && Array.isArray(m.reactions) && m.reactions.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      marginTop: 8,
                      justifyContent: mine ? "flex-end" : "flex-start",
                    }}
                  >
                    {m.reactions.map((r) => (
                      <button
                        key={`${m.id}-${r.emoji}`}
                        type="button"
                        disabled={!canReactMsg(m) || reactBusyId === m.id || busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          reactToMessage(m, r.emoji);
                        }}
                        title={r.mine ? "Remove your reaction" : "React"}
                        aria-label={`${r.emoji} ${r.count}${r.mine ? ", including you" : ""}`}
                        style={{
                          border: `1.5px solid ${r.mine ? T.accent : T.border}`,
                          background: r.mine ? T.accentSoft : "#fff",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 13,
                          lineHeight: 1.3,
                          cursor: canReactMsg(m) ? "pointer" : "default",
                          fontFamily: F,
                          color: T.ink,
                        }}
                      >
                        {r.emoji}{r.count > 1 ? ` ${r.count}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showMenu && (
                <div
                  data-msg-menu
                  style={{
                    position: "absolute",
                    // Open upward — chats are bottom-heavy; downward menus clip under overflow.
                    bottom: "100%",
                    [mine ? "right" : "left"]: 0,
                    marginBottom: 4,
                    zIndex: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    background: "#fff",
                    border: `1.5px solid ${T.border}`,
                    borderRadius: 12,
                    padding: 6,
                    boxShadow: "0 6px 18px rgba(51,39,46,0.12)",
                    minWidth: canReactMsg(m) ? 228 : undefined,
                  }}
                >
                  {(canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m)) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {canReplyMsg(m) && (
                        <button
                          type="button"
                          onClick={() => startReply(m)}
                          disabled={editBusy || busy}
                          style={{
                            border: "none",
                            background: T.sageSoft,
                            color: T.accentDeep,
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: F,
                            cursor: "pointer",
                            borderRadius: 999,
                            padding: "8px 12px",
                          }}
                        >
                          Reply
                        </button>
                      )}
                      {canEditMsg(m) && (
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          disabled={editBusy || busy}
                          style={{
                            border: "none",
                            background: T.accentSoft,
                            color: T.accentDeep,
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: F,
                            cursor: "pointer",
                            borderRadius: 999,
                            padding: "8px 12px",
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canDeleteMsg(m) && (
                        <button
                          type="button"
                          onClick={() => removeMessage(m)}
                          disabled={editBusy || busy}
                          style={{
                            border: "none",
                            background: T.track,
                            color: T.inkSoft,
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: F,
                            cursor: "pointer",
                            borderRadius: 999,
                            padding: "8px 12px",
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {canReactMsg(m) && (
                    <div
                      style={{
                        display: "flex",
                        gap: 2,
                        justifyContent: "space-between",
                        padding: (canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m))
                          ? "4px 2px 2px"
                          : "2px",
                        borderTop: (canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m))
                          ? `1px solid ${T.border}`
                          : "none",
                      }}
                    >
                      {REACTION_EMOJIS.map((emoji) => {
                        const mineReact = (m.reactions || []).some((r) => r.mine && r.emoji === emoji);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => reactToMessage(m, emoji)}
                            disabled={editBusy || busy || reactBusyId === m.id}
                            title={mineReact ? "Remove" : "React"}
                            aria-label={`React with ${emoji}`}
                            style={{
                              border: "none",
                              background: mineReact ? T.accentSoft : "transparent",
                              borderRadius: 10,
                              fontSize: 22,
                              lineHeight: 1,
                              cursor: "pointer",
                              padding: "6px 4px",
                              minWidth: 34,
                            }}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          });
        })()}
        <div ref={bottomRef} />
      </div>

      {!hideComposer && replyTo && !recording && (
        <div style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: `1.5px solid ${T.border}`,
          background: T.sageSoft,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
        >
          <div style={{
            width: 3,
            alignSelf: "stretch",
            borderRadius: 999,
            background: T.accent,
            flexShrink: 0,
          }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accentDeep }}>
              Replying to {replyAuthorLabel(replyTo)}
            </div>
            <div style={{
              fontSize: 13,
              color: T.inkSoft,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
            >
              {replySnippet(replyTo)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            style={{
              border: "none",
              background: "transparent",
              color: T.inkSoft,
              fontWeight: 700,
              fontFamily: F,
              cursor: "pointer",
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {!hideComposer && recording && (
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
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: T.accent,
              flexShrink: 0,
              boxShadow: `0 0 0 4px ${T.accentSoft}`,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Recording…</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              {formatVoiceDuration(recordMs)} · tap Stop when you’re done (max 10 min)
            </div>
          </div>
          <Btn small ghost onClick={cancelRecording}>Cancel</Btn>
          <Btn small onClick={stopRecording}>Stop</Btn>
        </div>
      )}

      {!hideComposer && !recording && voicePreview && (
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
            alignItems: "baseline",
            marginBottom: 8,
            gap: 8,
          }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
              Voice memo ready · {formatVoiceDuration(voicePreview.durationMs)}
            </div>
            <button
              type="button"
              onClick={clearVoicePreview}
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
          <VoiceMemoPlayer
            src={voicePreview.url}
            label="Preview"
            durationMs={voicePreview.durationMs}
            style={{ maxWidth: 320 }}
          />
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
            Add an optional note below, then Send.
          </div>
        </div>
      )}

      {!hideComposer && (file || attachError) && !recording && (
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

      {!hideComposer && !file && attachError && !recording && voicePreview && (
        <div style={{ fontSize: 13, color: T.amber, marginTop: 8 }}>{attachError}</div>
      )}

      {!hideComposer && (
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <label
          style={iconBtn}
          title="Attach photo or PDF"
          aria-label="Attach photo or PDF"
        >
          +
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTACH}
            disabled={busy || recording}
            onChange={onPickFile}
            style={{ display: "none" }}
          />
        </label>
        {allowVoiceMemo && (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={busy}
            title={recording ? "Stop recording" : "Record voice memo"}
            aria-label={recording ? "Stop recording" : "Record voice memo"}
            style={{
              ...iconBtn,
              borderColor: recording ? T.accent : T.border,
              background: recording ? T.accentSoft : "#fff",
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {recording ? (
              <span style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: T.accent,
                display: "block",
              }}
              />
            ) : (
              <MicIcon />
            )}
          </button>
        )}
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          rows={1}
          placeholder={voicePreview ? "Optional note with voice memo…" : "Write a message…"}
          enterKeyHint="enter"
          autoComplete="off"
          autoCorrect="on"
          disabled={recording}
          onFocus={() => onComposerFocusChange?.(true)}
          onBlur={() => {
            // Delay so Send/attach taps still register before tabs return
            window.setTimeout(() => onComposerFocusChange?.(false), 180);
          }}
          style={{
            flex: 1,
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${T.border}`,
            fontFamily: F,
            fontSize: 16,
            lineHeight: 1.4,
            resize: "none",
            overflowY: "auto",
            color: T.ink,
            background: "#fff",
            minHeight: 52,
            maxHeight: 160,
            opacity: recording ? 0.7 : 1,
          }}
        />
        <Btn onClick={send} disabled={!canSend} style={{ flexShrink: 0 }}>
          {busy ? "…" : "Send"}
        </Btn>
      </div>
      )}
      {!hideComposer && allowVoiceMemo && !recording && !voicePreview && (
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6, lineHeight: 1.4 }}>
          Mic = voice memo (admins only). Mamas can play it in the thread — they can’t send voice back.
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke={T.accentDeep}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V20"
        stroke={T.accentDeep}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
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
