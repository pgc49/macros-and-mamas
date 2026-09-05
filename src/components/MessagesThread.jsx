import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { MESSAGE_FACE_FONT } from "../lib/messageFace";
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
import { ErrorBoundary } from "./ErrorBoundary";
import { splitLinkedMessageText } from "../lib/messageLinks";
import { createBottomPin, pinChildToBottom, scrollChildIntoScroller } from "../lib/stickToBottom";
import { mergeMessagesById } from "../lib/messageOrdering";
import {
  buildPendingRow,
  createClientMessageId,
  findPendingByFingerprint,
  getPendingAttempt,
  listPendingRows,
  markPendingStatus,
  reconcilePendingWithMessages,
  sendPayloadFingerprint,
  upsertPendingAttempt,
} from "../lib/pendingSends";
import {
  BUBBLE_HOLD_SELECT_CSS,
  MESSAGE_HOLD_MOVE_PX,
  MESSAGE_HOLD_MS,
  bubbleTextSelect,
  copyableMessageBody,
  holdOpensMenu,
} from "../lib/messageSelect";
import {
  jumpLatestLabel,
  nextUnseenCount,
  shouldMarkThreadRead,
} from "../lib/threadReadState";
import {
  MESSAGE_WINDOW_OVERSCAN,
  heightsForMessages,
  indexOfMessage,
  initialLatestRange,
  offsetToIndex,
  shouldRemeasure,
  visibleMessageRange,
} from "../lib/messageListWindow";
import { imageBoxStyle, isImageAttachmentMime, readImageDimensions } from "../lib/messageMedia";
import { findLoadedMatchIndexes, nextMatchIndex } from "../lib/messageReplyParent";
import { MessagePhotoViewer } from "./MessagePhotoViewer";

const ACCEPT_ATTACH = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf,.pdf";

function cssAttrValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function findMessageElement(root, messageId) {
  const id = String(messageId || "");
  if (!root || !id) return null;
  const attr = cssAttrValue(id);
  return root.querySelector(`[data-msg-id="${attr}"], [data-server-id="${attr}"]`);
}

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
  /** Stable DM/channel identity so ambiguous retries survive thread remounts. */
  threadKey = "",
  onComposerFocusChange,
  /**
   * Prepend the page of history before the oldest loaded message. Threads open
   * on a window, so a long-running cohort group needs a way back through it.
   */
  onLoadEarlier = null,
  /** False once the thread has reached its first message. */
  hasEarlier = false,
  /**
   * Push / `?message=` target. Scroll that row into view and hold unread
   * until the live tip (or this target, if it is the tip) is on screen.
   */
  focusMessageId = "",
  /**
   * Load older pages until `messageId` is in the thread (quote jump).
   * Resolves true when the row is present.
   */
  onEnsureMessage = null,
}) {
  const [outboxTick, setOutboxTick] = useState(0);
  const attemptScope = threadKey || `thread:${selfId || "unknown"}`;
  const safeMessages = mergeMessagesById(
    Array.isArray(messages) ? messages : [],
    listPendingRows(attemptScope),
  ).map(normalizeMessageRow);
  const latestMessageId = safeMessages[safeMessages.length - 1]?.client_message_id
    || safeMessages[safeMessages.length - 1]?.id
    || "";
  void outboxTick;
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
  const [atLatest, setAtLatest] = useState(() => !focusMessageId);
  const [unseenCount, setUnseenCount] = useState(0);
  const [focusPending, setFocusPending] = useState(() => !!focusMessageId);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [jumpTargetId, setJumpTargetId] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(-1);
  const [photoViewer, setPhotoViewer] = useState(null);
  const listRef = useRef(null);
  const listContentRef = useRef(null);
  const bottomPinRef = useRef(null);
  const measuredHeightsRef = useRef(new Map());
  const [windowRange, setWindowRange] = useState(() => initialLatestRange(safeMessages));
  /** Metrics captured before an older page is prepended, so we can hold the row. */
  const restoreRef = useRef(null);
  const fileRef = useRef(null);
  const draftRef = useRef(null);
  const holdTimer = useRef(null);
  const holdStart = useRef(null);
  const recorderRef = useRef(null);
  const markReadRef = useRef(onMarkRead);
  const sendInFlightIds = useRef(new Set());
  const latestIdRef = useRef(latestMessageId);
  const atLatestRef = useRef(atLatest);
  const focusPendingRef = useRef(focusPending);
  const initialFocusRef = useRef(focusMessageId);

  const bumpOutbox = () => setOutboxTick((n) => n + 1);

  useEffect(() => {
    registerMessageServiceWorker();
  }, []);

  useEffect(() => {
    markReadRef.current = onMarkRead;
  }, [onMarkRead]);

  useEffect(() => { atLatestRef.current = atLatest; }, [atLatest]);
  useEffect(() => { focusPendingRef.current = focusPending; }, [focusPending]);

  useEffect(() => {
    reconcilePendingWithMessages(attemptScope, messages);
  }, [attemptScope, messages]);

  // Keep the latest message in view inside the list pane (iMessage-style).
  // Do NOT use scrollIntoView — it scrolls the page and fights flex height.
  //
  // The pin has to survive content settling after the first paint: images
  // decode, voice players mount, reaction chips arrive. A one-shot jump landed
  // on a list that was still growing and left the reader above the newest
  // message, which read as the pane bouncing back up while it loaded.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const pin = createBottomPin(el, {
      content: listContentRef.current,
      onPinnedChange: setAtLatest,
      initialPinned: !initialFocusRef.current,
    });
    bottomPinRef.current = pin;
    if (initialFocusRef.current) {
      pin.sync();
      return () => {
        pin.dispose();
        bottomPinRef.current = null;
      };
    }
    pin.toBottom();
    // One frame later the flex pane often first receives a real clientHeight.
    // Pin again then so the reader never sees the oldest row flash in.
    const raf = window.requestAnimationFrame(() => pin.toBottom());
    return () => {
      window.cancelAnimationFrame(raf);
      pin.dispose();
      bottomPinRef.current = null;
    };
  }, []);

  // A new tip message: follow it when the reader is at the live edge, hold
  // position when they are reading back. Message count deliberately does not
  // trigger this — prepending an older page must not yank them to the bottom.
  useEffect(() => {
    if (!latestMessageId) return;
    const tipChanged = latestMessageId !== latestIdRef.current;
    if (tipChanged) {
      setUnseenCount((n) => nextUnseenCount({
        unseenCount: n,
        atLatest: atLatestRef.current,
        tipChanged: true,
      }));
      latestIdRef.current = latestMessageId;
    }
    bottomPinRef.current?.repin();
  }, [latestMessageId]);

  useLayoutEffect(() => {
    if (!focusMessageId || !focusPending) return undefined;
    const el = listRef.current;
    if (!el) return undefined;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const target = findMessageElement(el, focusMessageId);
      if (!target) return;
      if (!scrollChildIntoScroller(el, target)) return;
      bottomPinRef.current?.sync();
      setFocusPending(false);
    };
    tryScroll();
    const raf = window.requestAnimationFrame(tryScroll);
    const later = window.setTimeout(tryScroll, 80);
    const settle = window.setTimeout(tryScroll, 240);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(later);
      window.clearTimeout(settle);
    };
  }, [focusMessageId, focusPending, safeMessages]);

  // Hold the anchor row once the prepended page has laid out. Runs before paint
  // so the reader never sees the intermediate offset.
  useLayoutEffect(() => {
    const previous = restoreRef.current;
    if (!previous) return;
    restoreRef.current = null;
    bottomPinRef.current?.restore(previous);
  }, [safeMessages.length]);

  const loadEarlier = useCallback(async () => {
    const el = listRef.current;
    if (!el || !onLoadEarlier || loadingEarlier) return;
    setLoadingEarlier(true);
    // Captured before the fetch so the restore uses the pre-prepend offset.
    restoreRef.current = {
      previousScrollHeight: el.scrollHeight,
      previousScrollTop: el.scrollTop,
    };
    try {
      await onLoadEarlier();
    } catch (e) {
      console.warn("load earlier messages failed", e);
      restoreRef.current = null;
    } finally {
      setLoadingEarlier(false);
    }
  }, [onLoadEarlier, loadingEarlier]);

  const markReadIfTipVisible = useCallback(() => {
    if (!shouldMarkThreadRead({
      latestMessageId,
      atLatest: atLatestRef.current,
      focusPending: focusPendingRef.current,
    })) return;
    setUnseenCount(0);
    Promise.resolve()
      .then(() => markReadRef.current?.())
      .catch((e) => {
        console.warn("mark messages read failed", e);
      });
  }, [latestMessageId]);

  useEffect(() => {
    markReadIfTipVisible();
  }, [latestMessageId, atLatest, focusPending, markReadIfTipVisible]);

  const jumpToLatest = useCallback(() => {
    setFocusPending(false);
    setUnseenCount(0);
    const el = listRef.current;
    const tip = safeMessages[safeMessages.length - 1];
    bottomPinRef.current?.toBottom();
    pinChildToBottom(
      el,
      findMessageElement(el, tip?.client_message_id || tip?.id),
    );
  }, [safeMessages]);

  const refreshWindow = useCallback((el = listRef.current) => {
    if (!el) return;
    const heights = heightsForMessages(safeMessages, measuredHeightsRef.current);
    const pinIndexes = [];
    const tip = safeMessages[safeMessages.length - 1];
    const tipIdx = indexOfMessage(safeMessages, tip?.client_message_id || tip?.id);
    if (tipIdx >= 0) pinIndexes.push(tipIdx);
    if (focusMessageId) {
      const idx = indexOfMessage(safeMessages, focusMessageId);
      if (idx >= 0) pinIndexes.push(idx);
    }
    if (jumpTargetId) {
      const idx = indexOfMessage(safeMessages, jumpTargetId);
      if (idx >= 0) pinIndexes.push(idx);
    }
    const next = visibleMessageRange({
      heights,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight || 480,
      overscan: MESSAGE_WINDOW_OVERSCAN,
      pinIndexes,
    });
    setWindowRange((prev) => (
      prev.start === next.start
      && prev.end === next.end
      && prev.topSpacer === next.topSpacer
      && prev.bottomSpacer === next.bottomSpacer
        ? prev
        : next
    ));
  }, [safeMessages, focusMessageId, jumpTargetId]);

  useLayoutEffect(() => {
    refreshWindow();
  }, [refreshWindow, safeMessages.length]);

  const measureBubble = useCallback((key, node) => {
    if (!node || !key) return;
    const next = node.getBoundingClientRect().height + 10;
    const previous = measuredHeightsRef.current.get(key);
    if (!shouldRemeasure(previous || 0, next)) return;
    measuredHeightsRef.current.set(key, next);
    refreshWindow();
  }, [refreshWindow]);

  const scrollToLoadedMessage = useCallback((messageId) => {
    const idx = indexOfMessage(safeMessages, messageId);
    if (idx < 0) return false;
    setJumpTargetId(messageId);
    const heights = heightsForMessages(safeMessages, measuredHeightsRef.current);
    const el = listRef.current;
    if (el) {
      el.scrollTop = offsetToIndex(heights, idx, 16);
      refreshWindow(el);
      window.requestAnimationFrame(() => {
        const target = findMessageElement(el, messageId);
        if (target) scrollChildIntoScroller(el, target);
        bottomPinRef.current?.sync();
      });
    }
    return true;
  }, [refreshWindow, safeMessages]);

  const jumpToQuoted = useCallback(async (parentId) => {
    const id = String(parentId || "");
    if (!id) return;
    if (scrollToLoadedMessage(id)) return;
    if (!onEnsureMessage) return;
    try {
      const found = await onEnsureMessage(id);
      if (found) scrollToLoadedMessage(id);
    } catch (e) {
      console.warn("jump to quoted message failed", e);
    }
  }, [onEnsureMessage, scrollToLoadedMessage]);

  const findMatches = findLoadedMatchIndexes(safeMessages, findQuery);
  const jumpFind = useCallback((direction) => {
    const next = nextMatchIndex(findMatches, findIndex, direction);
    if (next < 0) return;
    setFindIndex(next);
    const row = safeMessages[next];
    scrollToLoadedMessage(row?.client_message_id || row?.id);
  }, [findIndex, findMatches, safeMessages, scrollToLoadedMessage]);

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

  const flushSend = async ({
    text,
    attach,
    reply,
    previewUrl: pendingPreview,
    clientMessageId,
    fingerprint,
  }) => {
    if (!onSend || sendInFlightIds.current.has(clientMessageId)) return;
    sendInFlightIds.current.add(clientMessageId);
    bottomPinRef.current?.toBottom();
    const generation = createClientMessageId();
    const media = attach && isImageAttachmentMime(attach.type)
      ? await readImageDimensions(attach)
      : null;
    const row = buildPendingRow({
      clientMessageId,
      selfId,
      body: text,
      file: attach,
      previewUrl: pendingPreview,
      replyTo: reply,
      width: media?.width,
      height: media?.height,
    });
    const sendPromise = Promise.resolve().then(() => onSend(text, attach, {
      ...(reply?.id ? { replyToId: reply.id } : {}),
      clientMessageId,
    }));
    upsertPendingAttempt(attemptScope, {
      id: clientMessageId,
      fingerprint,
      generation,
      promise: sendPromise,
      status: "pending",
      row: { ...row, send_status: "pending" },
      payload: { text, file: attach, replyTo: reply },
    });
    bumpOutbox();
    try {
      await sendPromise;
      markPendingStatus(attemptScope, clientMessageId, "sent");
      bumpOutbox();
    } catch (e) {
      console.error(e);
      markPendingStatus(attemptScope, clientMessageId, "failed", {
        promise: null,
        row: { ...row, send_status: "failed" },
      });
      bumpOutbox();
    } finally {
      sendInFlightIds.current.delete(clientMessageId);
    }
  };

  const send = async () => {
    const text = draft.trim();
    const attach = voicePreview?.file || file;
    if ((!text && !attach) || !onSend || recording) return;
    const keptReply = replyTo;
    const fingerprint = sendPayloadFingerprint(text, attach, keptReply?.id);
    const matchingAttempt = findPendingByFingerprint(attemptScope, fingerprint);

    if (matchingAttempt?.promise) {
      try {
        await matchingAttempt.promise;
        setDraft("");
        clearFile();
        clearVoicePreview();
        setReplyTo(null);
        return;
      } catch {
        // Same payload, same id — retry below.
      }
    }

    const clientMessageId = matchingAttempt?.id || createClientMessageId();
    const transferredPreview = voicePreview?.url
      || previewUrl
      || (attach && String(attach.type || "").startsWith("image/")
        ? URL.createObjectURL(attach)
        : null);
    setDraft("");
    setReplyTo(null);
    setAttachError("");
    if (voicePreview) {
      setVoicePreview(null);
    } else {
      setFile(null);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    await flushSend({
      text,
      attach,
      reply: keptReply,
      previewUrl: transferredPreview,
      clientMessageId,
      fingerprint,
    });
  };

  const retryFailed = async (message) => {
    const clientMessageId = String(message?.client_message_id || message?.id || "").trim();
    const attempt = getPendingAttempt(attemptScope, clientMessageId);
    if (!attempt || attempt.status === "pending") return;
    const payload = attempt.payload || {};
    markPendingStatus(attemptScope, clientMessageId, "pending", {
      row: { ...(attempt.row || message), send_status: "pending" },
    });
    bumpOutbox();
    await flushSend({
      text: payload.text || message.body || "",
      attach: payload.file || null,
      reply: payload.replyTo || null,
      previewUrl: attempt.row?.attachmentUrl || message.attachmentUrl || null,
      clientMessageId,
      fingerprint: attempt.fingerprint || sendPayloadFingerprint(
        payload.text || message.body || "",
        payload.file,
        payload.replyTo?.id,
      ),
    });
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

  const canSend = !hideComposer && !recording && (!!draft.trim() || !!file || !!voicePreview);

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
    holdStart.current = null;
  };

  const selectionAtPointer = () => window.getSelection?.();

  const armHold = (m, x, y) => {
    clearHold();
    // Only a selection that already exists is a copy gesture. iOS creates one
    // during the hold — that must not cancel the reaction picker.
    if (!holdOpensMenu(selectionAtPointer())) return;
    holdStart.current = { x, y };
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      openMenu(m);
    }, MESSAGE_HOLD_MS);
  };

  const movedAway = (x, y) => {
    const start = holdStart.current;
    if (!start) return false;
    return Math.hypot(x - start.x, y - start.y) >= MESSAGE_HOLD_MOVE_PX;
  };

  const isLocalSend = (m) => m.send_status === "pending" || m.send_status === "failed";

  const canEditMsg = (m) => (
    !m.deleted_at
    && !isLocalSend(m)
    && !!onEdit
    && m.sender_id === selfId
  );

  const canDeleteMsg = (m) => (
    !m.deleted_at
    && !isLocalSend(m)
    && !!onDelete
    && (m.sender_id === selfId || canModerate)
  );

  const canReplyMsg = (m) => (
    enableReply
    && !hideComposer
    && !m.deleted_at
    && !isLocalSend(m)
    && m.kind !== "system"
  );

  const canReactMsg = (m) => (
    enableReactions
    && typeof onReact === "function"
    && !m.deleted_at
    && !isLocalSend(m)
    && m.kind !== "system"
    && !!m.id
  );

  const canCopyMsg = (m) => !m.deleted_at && !!copyableMessageBody(m);

  const canManage = (m) => (
    canEditMsg(m) || canDeleteMsg(m) || canReplyMsg(m) || canReactMsg(m) || canCopyMsg(m)
  );

  const copyMessage = async (m) => {
    const text = copyableMessageBody(m);
    if (!text) return;
    setMenuId(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // fall through to execCommand
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch (e) {
      console.error(e);
      setAttachError("Couldn’t copy.");
    }
  };

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
    window.getSelection?.()?.removeAllRanges?.();
    setMenuId(m.client_message_id || m.id);
  };

  const pressHandlers = (m) => {
    if (!canManage(m)) return {};
    return {
      onContextMenu: (e) => {
        // Already mid-copy (mouse drag / second gesture) — leave native copy.
        if (!holdOpensMenu(selectionAtPointer())) return;
        e.preventDefault();
        openMenu(m);
      },
      onTouchStart: (e) => {
        const t = e.touches?.[0];
        armHold(m, t?.clientX ?? 0, t?.clientY ?? 0);
      },
      onTouchEnd: clearHold,
      onTouchMove: (e) => {
        const t = e.touches?.[0];
        if (t && movedAway(t.clientX, t.clientY)) clearHold();
      },
      onTouchCancel: clearHold,
      onMouseDown: (e) => {
        if (e.button !== 0) return;
        armHold(m, e.clientX, e.clientY);
      },
      onMouseMove: (e) => {
        if (movedAway(e.clientX, e.clientY)) clearHold();
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
    <div data-messages-thread style={{
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      flex: 1,
      height: "100%",
      minWidth: 0,
      // Fill the leftover Messages pane so the composer stays put and only
      // history scrolls. Bottom padding leaves room for composer borders/radii
      // so overflow clipping never shaves the input row.
      overflow: "hidden",
      paddingBottom: 4,
      boxSizing: "border-box",
    }}
    >
      <MessagePhotoViewer
        src={photoViewer?.src || ""}
        alt={photoViewer?.alt || "Photo"}
        onClose={() => setPhotoViewer(null)}
      />
      <style>{`${BUBBLE_HOLD_SELECT_CSS}
        @keyframes mm-upload-pulse { 0% { transform: translateX(-80%); } 100% { transform: translateX(280%); } }
      `}</style>
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

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", minWidth: 0 }}>
      <div
        data-message-list
        ref={listRef}
        onScroll={(event) => refreshWindow(event.currentTarget)}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fff",
          border: `1.5px solid ${T.border}`,
          borderRadius: 14,
          padding: 12,
          // Critical: default minHeight:auto prevents shrinking below content,
          // which expands the whole thread instead of scrolling inside the pane.
          minHeight: 0,
          minWidth: 0,
          maxHeight: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {/* Wrapper exists so a ResizeObserver can watch the content grow — one
            on the scroll port never fires when the list inside it gets taller. */}
        <div data-message-list-content ref={listContentRef}>
        {!safeMessages.length && (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, padding: "20px 8px", textAlign: "center" }}>
            {emptyState}
          </div>
        )}
        {!!safeMessages.length && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button"
              data-find-in-thread
              onClick={() => setFindOpen((open) => !open)}
              style={{
                border: "none",
                background: "transparent",
                color: T.accentDeep,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                padding: "2px 0",
              }}
            >
              {findOpen ? "Close find" : "Find in thread"}
            </button>
          </div>
        )}
        {findOpen && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input
              type="search"
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value);
                setFindIndex(-1);
              }}
              placeholder="Search loaded messages"
              aria-label="Search loaded messages"
              style={{
                flex: 1,
                minWidth: 0,
                border: `1.5px solid ${T.border}`,
                borderRadius: 10,
                padding: "8px 10px",
                fontFamily: F,
                fontSize: 13.5,
              }}
            />
            <span style={{ fontSize: 12, color: T.inkSoft, flexShrink: 0 }}>
              {findQuery.trim() ? `${findMatches.length} in view` : ""}
            </span>
            <button type="button" onClick={() => jumpFind(-1)} disabled={!findMatches.length}>Prev</button>
            <button type="button" onClick={() => jumpFind(1)} disabled={!findMatches.length}>Next</button>
          </div>
        )}
        {onLoadEarlier && hasEarlier && !!safeMessages.length && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <button
              type="button"
              data-load-earlier
              onClick={loadEarlier}
              disabled={loadingEarlier}
              style={{
                border: `1.5px solid ${T.border}`,
                background: "#fff",
                color: T.accentDeep,
                borderRadius: 999,
                padding: "6px 14px",
                fontFamily: F,
                fontWeight: 800,
                fontSize: 12.5,
                cursor: loadingEarlier ? "default" : "pointer",
              }}
            >
              {loadingEarlier ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {(() => {
          // Only annotate the latest relevant outbound — not every coach bubble.
          // Read → last coach message the mama has opened; Delivered → latest send if still unread.
          let lastReadId = null;
          let lastDeliveredId = null;
          if (showReadReceipts) {
            for (const m of safeMessages) {
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
              const readIdx = safeMessages.findIndex((m) => m.id === lastReadId);
              const delIdx = safeMessages.findIndex((m) => m.id === lastDeliveredId);
              if (readIdx > delIdx) lastDeliveredId = null;
            }
          }
          const visible = safeMessages.slice(windowRange.start, windowRange.end);
          return (
          <>
          {windowRange.topSpacer > 0 ? (
            <div data-virt-top style={{ height: windowRange.topSpacer }} aria-hidden />
          ) : null}
          {visible.map((m) => {
          const bubbleKey = m.client_message_id || m.id;
          const mine = m.sender_id === selfId;
          const deleted = !!m.deleted_at;
          const isImage = String(m.attachment_mime || "").startsWith("image/");
          const isAudio = isAudioAttachmentMime(m.attachment_mime);
          const hasAttach = !!(!deleted && (m.attachment_path || m.attachmentUrl));
          const isEditing = editingId === m.id;
          const showMenu = menuId === bubbleKey && canManage(m) && !isEditing;
          const receiptLabel = m.send_status === "pending"
            ? "Sending…"
            : m.send_status === "failed"
              ? null
              : m.id === lastReadId
                ? "Read"
                : m.id === lastDeliveredId
                  ? "Sent"
                  : null;
          const showReceipt = !!receiptLabel;
          return (
            <ErrorBoundary
              key={bubbleKey}
              name="MessageBubble"
              resetKeys={[bubbleKey, messageRenderVersion(m)]}
              fallback={<MessageBubbleFallback message={m} mine={mine} />}
            >
            <div
              ref={(node) => measureBubble(bubbleKey, node)}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: 10,
                position: "relative",
              }}
            >
              <div
                data-msg-id={bubbleKey}
                data-server-id={m.id && m.id !== bubbleKey ? m.id : undefined}
                data-send-status={m.send_status || undefined}
                {...pressHandlers(m)}
                style={{
                  maxWidth: "85%",
                  background: deleted ? T.track : (mine ? T.accentSoft : T.sageSoft),
                  color: T.ink,
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontFamily: MESSAGE_FACE_FONT,
                  fontVariantEmoji: "emoji",
                  fontSize: 14.5,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  userSelect: bubbleTextSelect(deleted),
                  WebkitUserSelect: bubbleTextSelect(deleted),
                  WebkitTouchCallout: "none",
                  cursor: deleted ? "default" : "text",
                }}
              >
                {!mine && !deleted && showSenderNames && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, marginBottom: 4 }}>
                    {incomingSenderLabel(m)}
                  </div>
                )}
                {!deleted && m.reply_to && (
                  <div
                    role="button"
                    tabIndex={0}
                    data-reply-quote
                    onClick={() => jumpToQuoted(m.reply_to.id || m.reply_to_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        jumpToQuoted(m.reply_to.id || m.reply_to_id);
                      }
                    }}
                    style={{
                      marginBottom: 8,
                      padding: "6px 8px",
                      borderRadius: 8,
                      borderLeft: `3px solid ${T.accent}`,
                      background: mine ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.65)",
                      fontSize: 12.5,
                      lineHeight: 1.35,
                      color: T.inkSoft,
                      cursor: "pointer",
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
                        fontFamily: MESSAGE_FACE_FONT,
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
                      <button
                        type="button"
                        className="msg-photo-open"
                        data-open-photo={m.id}
                        aria-label="View photo"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (m.send_status === "pending") return;
                          // A still-hold already opened the bubble menu — don't
                          // also jump into the enlarge overlay on the same tap.
                          if (menuId === bubbleKey) return;
                          setMenuId(null);
                          setPhotoViewer({
                            src: m.attachmentUrl,
                            alt: m.attachment_name || "Photo",
                          });
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          marginBottom: m.body ? 8 : 0,
                          padding: 0,
                          border: 0,
                          background: "none",
                          position: "relative",
                          cursor: m.send_status === "pending" ? "default" : "zoom-in",
                        }}
                      >
                        <img
                          src={m.attachmentUrl}
                          alt={m.attachment_name || "Attachment"}
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                          style={imageBoxStyle(m)}
                        />
                        {m.send_status === "pending" && (
                          <div
                            data-upload-progress
                            style={{
                              position: "absolute",
                              left: 8,
                              right: 8,
                              bottom: 8,
                              height: 4,
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.55)",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{
                              width: "40%",
                              height: "100%",
                              borderRadius: 999,
                              background: T.accent,
                              animation: "mm-upload-pulse 1s ease-in-out infinite",
                            }}
                            />
                          </div>
                        )}
                      </button>
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
                    {m.body ? <MessageBodyLinks text={m.body} /> : null}
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
                  {m.send_status === "failed" ? (
                    <button
                      type="button"
                      data-retry-send
                      onClick={(e) => {
                        e.stopPropagation();
                        retryFailed(m);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#B4416B",
                        fontWeight: 700,
                        fontSize: 11,
                        fontFamily: F,
                        cursor: "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      Not sent — tap to retry
                    </button>
                  ) : showReceipt ? (
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
                      userSelect: "none",
                      WebkitUserSelect: "none",
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
                          fontFamily: MESSAGE_FACE_FONT,
                          fontVariantEmoji: "emoji",
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
                  {(canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m) || canCopyMsg(m)) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {canCopyMsg(m) && (
                        <button
                          type="button"
                          onClick={() => copyMessage(m)}
                          disabled={editBusy || busy}
                          style={{
                            border: `1.5px solid ${T.border}`,
                            background: "#fff",
                            color: T.ink,
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: F,
                            cursor: "pointer",
                            borderRadius: 999,
                            padding: "8px 12px",
                          }}
                        >
                          Copy
                        </button>
                      )}
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
                        padding: (canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m) || canCopyMsg(m))
                          ? "4px 2px 2px"
                          : "2px",
                        borderTop: (canReplyMsg(m) || canEditMsg(m) || canDeleteMsg(m) || canCopyMsg(m))
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
                              fontFamily: MESSAGE_FACE_FONT,
                              fontVariantEmoji: "emoji",
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
            </ErrorBoundary>
          );
          })}
          {windowRange.bottomSpacer > 0 ? (
            <div data-virt-bottom style={{ height: windowRange.bottomSpacer }} aria-hidden />
          ) : null}
          </>
          );
        })()}
        </div>
      </div>
      {!atLatest && !!safeMessages.length && (
        <button
          type="button"
          data-jump-latest
          aria-label={unseenCount > 0 ? `${unseenCount} new messages` : "Jump to latest message"}
          onClick={jumpToLatest}
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            border: `1.5px solid ${T.border}`,
            background: "#fff",
            color: T.accentDeep,
            borderRadius: 999,
            padding: "7px 14px",
            fontFamily: F,
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(51,39,46,0.16)",
          }}
        >
          {jumpLatestLabel(unseenCount)}
        </button>
      )}
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
      <div
        data-message-composer
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 10,
          alignItems: "flex-end",
          flexShrink: 0,
          minWidth: 0,
          width: "100%",
          boxSizing: "border-box",
          // Keep the full 1.5px borders / radii inside the bounded thread on
          // every viewport — no phone-specific hacks.
          paddingBottom: 2,
        }}
      >
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
          onFocus={(e) => {
            e.currentTarget.style.borderColor = T.accent;
            onComposerFocusChange?.(true);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = T.border;
            // Delay so Send/attach taps still register before tabs return
            window.setTimeout(() => onComposerFocusChange?.(false), 180);
          }}
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            width: 0,
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${T.border}`,
            outline: "none",
            WebkitAppearance: "none",
            fontFamily: F,
            fontSize: 16,
            lineHeight: 1.4,
            resize: "none",
            overflowY: "auto",
            overflowWrap: "break-word",
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
    if (Number.isNaN(d.getTime())) return "";
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

function safeString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

const MESSAGE_LINK_STYLE = {
  color: T.accentDeep,
  fontWeight: 700,
  textDecoration: "underline",
  wordBreak: "break-word",
};

/** Display-only: http(s) / youtu.be in the bubble become links. Stored body is unchanged. */
function MessageBodyLinks({ text }) {
  const parts = splitLinkedMessageText(text);
  if (!parts.length) return null;
  return parts.map((part, index) => {
    if (part.type !== "link") {
      // Text node, not a span — nested Karla spans can drop emoji fallbacks.
      return <Fragment key={`t-${index}`}>{part.value}</Fragment>;
    }
    return (
      <a
        key={`l-${index}`}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={MESSAGE_LINK_STYLE}
      >
        {part.value}
      </a>
    );
  });
}

function normalizeMessageRow(row, index) {
  const source = row && typeof row === "object" && !Array.isArray(row) ? row : {};
  const id = safeString(source.id).trim() || `invalid-message-${index}`;
  const reactions = Array.isArray(source.reactions)
    ? source.reactions
      .filter((r) => r && typeof r === "object" && typeof r.emoji === "string")
      .map((r) => ({
        ...r,
        emoji: r.emoji,
        count: Math.max(1, Number(r.count) || 1),
        mine: r.mine === true,
      }))
    : [];
  return {
    ...source,
    id,
    client_message_id: safeString(source.client_message_id).trim(),
    send_status: safeString(source.send_status).trim(),
    body: safeString(source.body),
    sender_id: safeString(source.sender_id),
    attachment_path: safeString(source.attachment_path),
    attachment_mime: safeString(source.attachment_mime),
    attachment_name: safeString(source.attachment_name),
    created_at: safeString(source.created_at),
    reactions,
  };
}

function MessageBubbleFallback({ message, mine }) {
  const body = safeString(message?.body);
  const time = formatMsgTime(message?.created_at);
  const deleted = !!message?.deleted_at;
  return (
    <div style={{
      display: "flex",
      justifyContent: mine ? "flex-end" : "flex-start",
      marginBottom: 10,
    }}
    >
      <div style={{
        maxWidth: "85%",
        borderRadius: 14,
        padding: "10px 12px",
        background: mine ? T.accentSoft : T.sageSoft,
        color: T.ink,
        fontFamily: MESSAGE_FACE_FONT,
        fontVariantEmoji: "emoji",
        fontSize: 14.5,
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
      >
        {deleted
          ? "Message deleted"
          : (body
            ? <MessageBodyLinks text={body} />
            : (message?.attachment_path ? "Attachment unavailable" : "Message unavailable"))}
        {time ? (
          <div style={{ marginTop: 6, fontSize: 11, color: T.inkSoft }}>{time}</div>
        ) : null}
      </div>
    </div>
  );
}

function messageRenderVersion(message) {
  const reactions = Array.isArray(message?.reactions)
    ? message.reactions.map((r) => `${safeString(r?.emoji)}:${Number(r?.count) || 0}:${r?.mine === true}`).join(",")
    : "";
  return [
    safeString(message?.body),
    safeString(message?.sender_id),
    safeString(message?.created_at),
    safeString(message?.read_at),
    safeString(message?.edited_at),
    safeString(message?.deleted_at),
    safeString(message?.attachment_path),
    safeString(message?.attachment_name),
    safeString(message?.attachment_mime),
    safeString(message?.attachmentUrl),
    safeString(message?.send_status),
    safeString(message?.reply_to_id),
    safeString(message?.reply_to?.id),
    safeString(message?.reply_to?.body),
    safeString(message?.reply_to?.deleted_at),
    message?.reply_to?.missing === true ? "missing" : "",
    reactions,
  ].join("|");
}
