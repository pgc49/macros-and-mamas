import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessagesThread } from "./MessagesThread";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import { mergeMessagesById } from "../lib/messageOrdering";
import {
  applyReactionToMessages,
  earlierCursor,
  mergeChannelList,
  MESSAGE_PAGE_SIZE,
  pageHasMore,
} from "../lib/messageChannels";
import { createCoalescedRefresh } from "../lib/realtimeCoalesce";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import { ErrorBoundary } from "./ErrorBoundary";

function friendlyError(e, fallback) {
  const msg = String(e?.message || "");
  if (/network|fetch|Failed to fetch/i.test(msg)) return "Network hiccup — try again.";
  if (/not enrolled|forbidden|JWT|unauthorized/i.test(msg)) return "Please sign in again.";
  if (/empty/i.test(msg)) return "Message is empty.";
  if (/voice memo|attachment|photo|PDF|10 MB/i.test(msg)) return msg;
  if (/Invalid notification/i.test(msg)) return msg;
  return fallback;
}

/** Stable identity for "no messages loaded", so memos downstream can hold. */
const NO_MESSAGES = Object.freeze([]);

/** Re-attach reply previews after appending a just-sent row. */
function attachReplyPreviewLocal(list) {
  const byId = new Map((list || []).map((m) => [m.id, m]));
  return (list || []).map((m) => {
    if (!m?.reply_to_id) return m;
    if (m.reply_to && !m.reply_to.missing) return m;
    const parent = byId.get(m.reply_to_id);
    if (!parent) return m;
    return {
      ...m,
      reply_to: {
        id: parent.id,
        body: parent.deleted_at ? "" : (parent.body || ""),
        deleted_at: parent.deleted_at || null,
        sender_id: parent.sender_id || null,
        sender_profile: parent.sender_profile || null,
        attachment_name: parent.deleted_at ? null : (parent.attachment_name || null),
        missing: false,
      },
    };
  });
}

/** Mama Messages tab — Callie 1:1 plus cohort channels. */
export function MessagesPanel({ userId, onUnreadChange, onComposerFocusChange }) {
  const [dmMessages, setDmMessages] = useState([]);
  const [dmUnread, setDmUnread] = useState(0);
  const [channels, setChannels] = useState([]);
  const [channelMessages, setChannelMessages] = useState({});
  const [activePill, setActivePill] = useState("callie");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notifyChannelId, setNotifyChannelId] = useState(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [dmHasEarlier, setDmHasEarlier] = useState(false);
  const [channelHasEarlier, setChannelHasEarlier] = useState({});
  const [loadingChannelId, setLoadingChannelId] = useState(null);
  const deepLinkedChannel = useRef(false);

  // Realtime handlers and "load earlier" read the live values through refs so a
  // re-render never tears down and rebuilds the Realtime subscription.
  const activePillRef = useRef(activePill);
  const dmMessagesRef = useRef(dmMessages);
  const channelMessagesRef = useRef(channelMessages);
  /** Per-channel load counter: a slower response must not overwrite a newer one. */
  const channelLoadSeq = useRef(new Map());

  useEffect(() => { activePillRef.current = activePill; }, [activePill]);
  useEffect(() => { dmMessagesRef.current = dmMessages; }, [dmMessages]);
  useEffect(() => { channelMessagesRef.current = channelMessages; }, [channelMessages]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        if (!cancelled) setIsAdmin(String(data?.role || "").toLowerCase() === "admin");
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshDm = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await db.loadMessages(userId);
      setDmMessages(list);
      setDmHasEarlier(pageHasMore(list, MESSAGE_PAGE_SIZE));
      // Counted in the database rather than over the loaded page: the page is
      // only the newest slice, so counting it would undercount a long absence.
      const unread = await db.countUnreadMessages(userId, userId);
      setDmUnread(unread);
      onUnreadChange?.(unread);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t load messages."));
    }
  }, [userId, onUnreadChange]);

  /**
   * Channel pills and their unread dots — never their message history.
   *
   * Loading every channel's window here is what made opening Messages slow:
   * each one was a full page plus attachment signing, and all of them had to
   * finish before a single pill appeared.
   */
  const refreshChannelList = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await db.listMyChannels();
      setChannels((prev) => mergeChannelList(prev, list));
      const withUnread = await Promise.all(list.map(async (item) => ({
        ...item,
        hasUnread: await db.channelHasUnreadMessages(item.conversation.id, item.membership),
      })));
      setChannels(withUnread);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t load group messages."));
    }
  }, [userId]);

  /** Newest page of one channel — the one the mama is actually looking at. */
  const loadChannel = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!conversationId) return;
    const seq = (channelLoadSeq.current.get(conversationId) || 0) + 1;
    channelLoadSeq.current.set(conversationId, seq);
    if (!silent) setLoadingChannelId(conversationId);
    try {
      const messages = await db.loadChannelMessages(conversationId);
      if (channelLoadSeq.current.get(conversationId) !== seq) return;
      setChannelMessages((all) => ({ ...all, [conversationId]: messages }));
      setChannelHasEarlier((all) => ({
        ...all,
        [conversationId]: pageHasMore(messages, MESSAGE_PAGE_SIZE),
      }));
    } catch (e) {
      if (channelLoadSeq.current.get(conversationId) !== seq) return;
      console.error(e);
      setError(friendlyError(e, "Couldn’t load group messages."));
    } finally {
      setLoadingChannelId((current) => (current === conversationId ? null : current));
    }
  }, []);

  const refreshDmRef = useRef(refreshDm);
  const refreshChannelListRef = useRef(refreshChannelList);
  const loadChannelRef = useRef(loadChannel);
  useEffect(() => { refreshDmRef.current = refreshDm; }, [refreshDm]);
  useEffect(() => { refreshChannelListRef.current = refreshChannelList; }, [refreshChannelList]);
  useEffect(() => { loadChannelRef.current = loadChannel; }, [loadChannel]);

  useEffect(() => {
    refreshDm();
    refreshChannelList();
  }, [refreshDm, refreshChannelList]);

  // Open a group's history only once the mama taps its pill.
  useEffect(() => {
    if (!activePill || activePill === "callie") return;
    if (channelMessagesRef.current[activePill]) return;
    loadChannel(activePill);
  }, [activePill, loadChannel]);

  const loadEarlierDm = useCallback(async () => {
    const before = earlierCursor(dmMessagesRef.current);
    if (!userId || !before) return;
    const older = await db.loadMessages(userId, { before });
    setDmMessages((list) => attachReplyPreviewLocal(mergeMessagesById(older, list)));
    setDmHasEarlier(pageHasMore(older, MESSAGE_PAGE_SIZE));
  }, [userId]);

  const loadEarlierChannel = useCallback(async () => {
    const conversationId = activePillRef.current;
    if (!conversationId || conversationId === "callie") return;
    const before = earlierCursor(channelMessagesRef.current[conversationId]);
    if (!before) return;
    const older = await db.loadChannelMessages(conversationId, { before });
    setChannelMessages((all) => ({
      ...all,
      // Reply previews are built per page, so a quote whose parent was over the
      // page boundary resolves once that older page lands.
      [conversationId]: attachReplyPreviewLocal(
        mergeMessagesById(older, all[conversationId] || []),
      ),
    }));
    setChannelHasEarlier((all) => ({
      ...all,
      [conversationId]: pageHasMore(older, MESSAGE_PAGE_SIZE),
    }));
  }, []);

  useEffect(() => {
    if (!channels.length || deepLinkedChannel.current) return;
    const requested = new URLSearchParams(window.location.search).get("channel");
    if (requested && channels.some((item) => item.conversation.id === requested)) {
      setActivePill(requested);
      deepLinkedChannel.current = true;
    }
  }, [channels]);

  useEffect(() => {
    setGuidelinesOpen(false);
  }, [activePill]);

  /**
   * One subscription for the whole panel, with every handler coalesced.
   *
   * A busy group used to fire a full reload of every channel per event, and the
   * effect re-subscribed whenever a handler's identity changed. Handlers now
   * read through refs, and each event refreshes only what it can affect: the
   * open thread, or just the unread dots.
   */
  useEffect(() => {
    if (!userId) return undefined;

    const dmRefresh = createCoalescedRefresh(() => refreshDmRef.current?.());
    const listRefresh = createCoalescedRefresh(() => refreshChannelListRef.current?.());
    const openChannelRefresh = createCoalescedRefresh(() => {
      const conversationId = activePillRef.current;
      if (!conversationId || conversationId === "callie") return undefined;
      return loadChannelRef.current?.(conversationId, { silent: true });
    });

    const isOpenChannel = (payload) => {
      const conversationId = payload?.new?.conversation_id
        || payload?.old?.conversation_id
        || null;
      return !!conversationId && conversationId === activePillRef.current;
    };

    const channel = supabase
      .channel(`messages-mama-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${userId}`,
        },
        () => { dmRefresh.request(); },
      )
      .on(
        // Reactions carry no thread id, so this cannot be narrowed server-side.
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => { dmRefresh.request(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        (payload) => {
          if (isOpenChannel(payload)) openChannelRefresh.request();
          // Any other group only needs its unread dot re-checked.
          listRefresh.request();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_message_reactions",
        },
        () => { openChannelRefresh.request(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        () => { listRefresh.request(); },
      )
      .subscribe();

    return () => {
      dmRefresh.dispose();
      listRefresh.dispose();
      openChannelRefresh.dispose();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const activeChannel = useMemo(
    () => channels.find((item) => item.conversation.id === activePill) || null,
    [channels, activePill],
  );

  // Memoized against a shared empty array so the sender-name map below is not
  // rebuilt over the whole thread on every keystroke in the composer.
  const activeChannelMessages = useMemo(() => (
    activeChannel
      ? channelMessages[activeChannel.conversation.id] || NO_MESSAGES
      : NO_MESSAGES
  ), [activeChannel, channelMessages]);

  const senderNameById = useMemo(() => {
    const map = {};
    for (const m of activeChannelMessages) {
      if (!m?.sender_id || map[m.sender_id]) continue;
      map[m.sender_id] = channelSenderName(m.sender_profile, m.sender_id === userId);
    }
    return map;
  }, [activeChannelMessages, userId]);

  const send = async (body, file = null, opts = {}) => {
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({
        clientId: userId,
        body,
        file,
        replyToId: opts.replyToId || null,
        clientMessageId: opts.clientMessageId || null,
      });
      setDmMessages((list) => attachReplyPreviewLocal(mergeMessagesById(list, [row])));
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t send."));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const edit = async (messageId, body) => {
    const row = await db.editMessage(messageId, body);
    setDmMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
  };

  const remove = async (messageId) => {
    const row = await db.deleteMessage(messageId);
    setDmMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m)));
  };

  // Tapbacks patch the loaded window instead of re-fetching the thread. A
  // reload would replace every message object on screen to render one emoji.
  const reactDm = async (messageId, emoji) => {
    setDmMessages((list) => applyReactionToMessages(list, messageId, emoji, userId));
    await db.toggleDmReaction(messageId, emoji);
  };

  const markRead = async () => {
    if (!userId) return;
    await db.markMessagesRead(userId, userId);
    setDmUnread(0);
    onUnreadChange?.(0);
    setDmMessages((list) => list.map((m) => (
      m.sender_id === userId || m.read_at || m.deleted_at
        ? m
        : { ...m, read_at: m.read_at || new Date().toISOString() }
    )));
  };

  const sendChannel = async (body, file = null, opts = {}) => {
    if (!activeChannel) return;
    const conversationId = activeChannel.conversation.id;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendChannelMessage({
        conversationId,
        body,
        file,
        replyToId: opts.replyToId || null,
        clientMessageId: opts.clientMessageId || null,
      });
      setChannelMessages((all) => {
        const prev = all[conversationId] || [];
        const next = attachReplyPreviewLocal(mergeMessagesById(prev, [row]));
        return { ...all, [conversationId]: next };
      });
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t send."));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const editChannel = async (messageId, body) => {
    if (!activeChannel) return;
    const row = await db.editChannelMessage(messageId, body);
    const conversationId = activeChannel.conversation.id;
    setChannelMessages((all) => ({
      ...all,
      [conversationId]: (all[conversationId] || []).map((m) => (m.id === row.id ? { ...m, ...row } : m)),
    }));
  };

  const removeChannel = async (messageId) => {
    if (!activeChannel) return;
    const row = await db.deleteChannelMessage(messageId);
    const conversationId = activeChannel.conversation.id;
    setChannelMessages((all) => ({
      ...all,
      [conversationId]: (all[conversationId] || []).map((m) => (
        m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m
      )),
    }));
  };

  const reactChannel = async (messageId, emoji) => {
    if (!activeChannel) return;
    const conversationId = activeChannel.conversation.id;
    setChannelMessages((all) => ({
      ...all,
      [conversationId]: applyReactionToMessages(all[conversationId], messageId, emoji, userId),
    }));
    await db.toggleChannelReaction(messageId, emoji);
  };

  const markChannelRead = async () => {
    if (!activeChannel) return;
    const conversationId = activeChannel.conversation.id;
    const membership = await db.markChannelRead(conversationId);
    if (!membership) return;
    setChannels((list) => list.map((item) => {
      if (item.conversation.id !== conversationId) return item;
      return {
        ...item,
        membership: { ...item.membership, ...membership },
        // The mama is reading this thread right now, so it is caught up. No
        // need to ask the database what it already told us.
        hasUnread: false,
      };
    }));
  };

  const saveNotifyLevel = async (level) => {
    if (!notifyChannelId) return;
    setNotifyBusy(true);
    setError("");
    try {
      const membership = await db.updateChannelNotifyLevel(notifyChannelId, level);
      setChannels((list) => list.map((item) => (
        item.conversation.id === notifyChannelId
          ? { ...item, membership: { ...item.membership, ...membership } }
          : item
      )));
      setNotifyChannelId(null);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t update notifications."));
    } finally {
      setNotifyBusy(false);
    }
  };

  const notifyChannel = channels.find((item) => item.conversation.id === notifyChannelId) || null;
  const guidelines = String(activeChannel?.conversation?.guidelines || "").trim();

  return (
    <div
      data-messages-panel
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
      }}
    >
      {error && (
        <div style={{ fontSize: 13, color: "#B4416B", marginBottom: 8, flexShrink: 0 }}>{error}</div>
      )}
      <div data-messages-toolbar style={{ marginBottom: 8, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            data-messages-pills
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              minWidth: 0,
              flex: 1,
              paddingBottom: 1,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <PillButton
              active={activePill === "callie"}
              onClick={() => setActivePill("callie")}
              label="Callie"
              count={dmUnread}
            />
            {channels.map((item) => (
              <PillButton
                key={item.conversation.id}
                active={activePill === item.conversation.id}
                onClick={() => setActivePill(item.conversation.id)}
                label={item.conversation.label || "Group"}
                dot={item.hasUnread}
              />
            ))}
          </div>
          {activeChannel && (
            <ChannelActions
              hasGuidelines={!!guidelines}
              guidelinesOpen={guidelinesOpen}
              notifyLevel={activeChannel.membership?.notify_level}
              onToggleGuidelines={() => setGuidelinesOpen((v) => !v)}
              onOpenNotifySettings={() => setNotifyChannelId(activeChannel.conversation.id)}
            />
          )}
        </div>
        {guidelines && guidelinesOpen && (
          <GuidelinesCard text={guidelines} />
        )}
      </div>

      <div
        data-messages-thread-slot
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
      {activeChannel ? (
        <ErrorBoundary
          name="CustomerChannelThread"
          title="This group thread hit a snag"
          message="The rest of Messages still works. Try again or switch back to Callie."
          resetKeys={[activeChannel.conversation.id]}
        >
          <MessagesThread
            key={activeChannel.conversation.id}
            title=""
            subtitle=""
            messages={activeChannelMessages}
            selfId={userId}
            threadKey={`channel:${activeChannel.conversation.id}:${userId}`}
            peerName={activeChannel.conversation.label || "Group"}
            senderNameById={senderNameById}
            showSenderNames
            busy={busy}
            onSend={sendChannel}
            onEdit={editChannel}
            onDelete={removeChannel}
            onReact={reactChannel}
            onMarkRead={markChannelRead}
            canModerate={isAdmin}
            allowVoiceMemo={isAdmin}
            enableReply
            banner={activeChannel.conversation.read_only ? <ReadOnlyBanner /> : null}
            hideComposer={!!activeChannel.conversation.read_only}
            emptyState={
              loadingChannelId === activeChannel.conversation.id
                ? "Loading the group…"
                : "No group messages yet — say hi when you’re ready."
            }
            onLoadEarlier={loadEarlierChannel}
            hasEarlier={!!channelHasEarlier[activeChannel.conversation.id]}
            showPushPrompt
            onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
            onComposerFocusChange={onComposerFocusChange}
          />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary
          name="CustomerDmThread"
          title="This conversation hit a snag"
          message="Your messages are safe. Try again here or switch to a group."
          resetKeys={[userId, "callie"]}
        >
          <MessagesThread
            key="callie"
            title=""
            subtitle=""
            messages={dmMessages}
            selfId={userId}
            threadKey={`dm:${userId}`}
            peerName="Callie"
            busy={busy}
            onSend={send}
            onEdit={edit}
            onDelete={remove}
            onReact={reactDm}
            onMarkRead={markRead}
            onLoadEarlier={loadEarlierDm}
            hasEarlier={dmHasEarlier}
            enableReply
            showPushPrompt
            onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
            onComposerFocusChange={onComposerFocusChange}
          />
        </ErrorBoundary>
      )}
      </div>

      {notifyChannel && (
        <NotifySettingsSheet
          channel={notifyChannel}
          busy={notifyBusy}
          onClose={() => setNotifyChannelId(null)}
          onSave={saveNotifyLevel}
        />
      )}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  label,
  count = 0,
  dot = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 32,
        borderRadius: 999,
        border: `1.5px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentSoft : "#fff",
        color: active ? T.accentDeep : T.ink,
        fontFamily: F,
        fontWeight: 800,
        fontSize: 13,
        padding: "6px 11px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span style={{
          minWidth: 18,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: T.accent,
          color: "#fff",
          fontSize: 11,
          lineHeight: "18px",
          textAlign: "center",
        }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
      {dot && count < 1 && (
        <span
          aria-label="Unread group messages"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: T.accent,
          }}
        />
      )}
    </button>
  );
}

function ChannelActions({
  hasGuidelines,
  guidelinesOpen,
  notifyLevel,
  onToggleGuidelines,
  onOpenNotifySettings,
}) {
  const actionStyle = {
    flexShrink: 0,
    border: `1.5px solid ${T.border}`,
    background: "#fff",
    color: T.accentDeep,
    borderRadius: 999,
    minHeight: 32,
    padding: "6px 10px",
    fontFamily: F,
    fontWeight: 800,
    fontSize: 12.5,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
  return (
    <div
      data-messages-channel-actions
      style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}
    >
      {hasGuidelines && (
        <button
          type="button"
          onClick={onToggleGuidelines}
          aria-expanded={guidelinesOpen}
          style={actionStyle}
        >
          {guidelinesOpen ? "Hide" : "Guidelines"}
        </button>
      )}
      <button
        type="button"
        onClick={onOpenNotifySettings}
        aria-label={`Notifications: ${notifyLabel(notifyLevel)}`}
        style={{
          ...actionStyle,
          border: "none",
          background: T.accentSoft,
        }}
      >
        Notify
      </button>
    </div>
  );
}

function GuidelinesCard({ text }) {
  return (
    <div
      data-messages-guidelines
      style={{
        border: `1.5px solid ${T.border}`,
        borderRadius: 14,
        background: "#fff",
        padding: "10px 12px",
        marginTop: 8,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: T.ink,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </div>
  );
}

function ReadOnlyBanner() {
  return (
    <div style={{
      background: T.accentSoft,
      color: T.ink,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 10,
      fontSize: 13.5,
      lineHeight: 1.45,
    }}
    >
      This group is read-only right now. You can still catch up on past posts.
    </div>
  );
}

function NotifySettingsSheet({
  channel,
  busy,
  onClose,
  onSave,
}) {
  const current = channel.membership?.notify_level || "highlights";
  const options = [
    ["all", "All", "Every new group message."],
    ["highlights", "Highlights", "Callie posts and replies to you."],
    ["mute", "Mute", "No push notifications from this group."],
  ];
  // Portal to body — Shell's overflow scroll traps position:fixed and the
  // bottom tab bar otherwise clips Mute / Close.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Group notifications"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(51,39,46,0.28)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
        boxSizing: "border-box",
      }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(88dvh, 640px)",
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: "18px 18px 0 0",
          padding: "16px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -8px 40px rgba(51,39,46,0.2)",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: FD, fontSize: 22, marginBottom: 4 }}>Group notifications</div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 12 }}>
          {channel.conversation.label || "Group"}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {options.map(([value, label, detail]) => (
            <button
              key={value}
              type="button"
              onClick={() => onSave(value)}
              disabled={busy}
              style={{
                border: `1.5px solid ${current === value ? T.accent : T.border}`,
                background: current === value ? T.accentSoft : "#fff",
                color: T.ink,
                borderRadius: 14,
                padding: "11px 12px",
                textAlign: "left",
                fontFamily: F,
                cursor: busy ? "default" : "pointer",
              }}
            >
              <div style={{ fontWeight: 800, color: current === value ? T.accentDeep : T.ink }}>
                {label}
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>{detail}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Btn small ghost onClick={onClose} disabled={busy}>Close</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function notifyLabel(level) {
  if (level === "all") return "All";
  if (level === "mute") return "Mute";
  return "Highlights";
}

function channelSenderName(profile, isSelf) {
  if (isSelf) return "You";
  const role = String(profile?.role || "").toLowerCase();
  const email = String(profile?.email || "").toLowerCase();
  const first = String(profile?.name || "").trim().split(/\s+/)[0] || "";
  if (role === "admin" && (/callie|calista/.test(first.toLowerCase()) || email.includes("calista@"))) {
    return "Callie";
  }
  if (first) return first;
  return role === "admin" ? "Callie" : "Mama";
}
