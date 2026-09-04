import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessagesThread } from "./MessagesThread";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import { mergeMessagesById } from "../lib/messageOrdering";
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
export function MessagesPanel({
  userId,
  onUnreadChange,
  onComposerFocusChange,
  initialDraft = "",
  onInitialDraftUsed,
}) {
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
  const deepLinkedChannel = useRef(false);

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
      const unread = list.filter((m) => !m.deleted_at && !m.read_at && m.sender_id !== userId).length;
      setDmUnread(unread);
      onUnreadChange?.(unread);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t load messages."));
    }
  }, [userId, onUnreadChange]);

  const refreshChannels = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await db.listMyChannels();
      const loaded = await Promise.all(list.map(async (item) => {
        const messages = await db.loadChannelMessages(item.conversation.id);
        return {
          ...item,
          messages,
          hasUnread: db.channelHasUnread(item.conversation, item.membership, messages),
        };
      }));
      setChannels(loaded);
      setChannelMessages(Object.fromEntries(
        loaded.map((item) => [item.conversation.id, item.messages]),
      ));
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, "Couldn’t load group messages."));
    }
  }, [userId]);

  useEffect(() => {
    refreshDm();
    refreshChannels();
  }, [refreshDm, refreshChannels]);

  // A question handed over from the coach belongs to Callie, so a mama sitting
  // on a cohort channel is moved back to the DM before the draft lands.
  useEffect(() => {
    if (String(initialDraft || "").trim()) setActivePill("callie");
  }, [initialDraft]);

  useEffect(() => {
    if (!channels.length || deepLinkedChannel.current) return;
    const requested = new URLSearchParams(window.location.search).get("channel");
    if (requested && channels.some((item) => item.conversation.id === requested)) {
      setActivePill(requested);
      deepLinkedChannel.current = true;
    }
  }, [channels]);

  useEffect(() => {
    if (!userId) return undefined;
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
        () => { refreshDm(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => { refreshDm(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshDm]);

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`channels-mama-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        () => { refreshChannels(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_message_reactions",
        },
        () => { refreshChannels(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        () => { refreshChannels(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshChannels]);

  const activeChannel = useMemo(
    () => channels.find((item) => item.conversation.id === activePill) || null,
    [channels, activePill],
  );

  const activeChannelMessages = activeChannel
    ? channelMessages[activeChannel.conversation.id] || []
    : [];

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

  const reactDm = async (messageId, emoji) => {
    await db.toggleDmReaction(messageId, emoji);
    await refreshDm();
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
    await db.toggleChannelReaction(messageId, emoji);
    await refreshChannels();
  };

  const markChannelRead = async () => {
    if (!activeChannel) return;
    const conversationId = activeChannel.conversation.id;
    const membership = await db.markChannelRead(conversationId);
    if (!membership) return;
    setChannels((list) => list.map((item) => {
      if (item.conversation.id !== conversationId) return item;
      const next = {
        ...item,
        membership: { ...item.membership, ...membership },
      };
      return {
        ...next,
        hasUnread: db.channelHasUnread(
          next.conversation,
          next.membership,
          channelMessages[conversationId] || [],
        ),
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

  const activeSubtitle = activeChannel
    ? "Your cohort — what’s shared here stays here."
    : "Private chat with Callie — stays in the app";

  const notifyChannel = channels.find((item) => item.conversation.id === notifyChannelId) || null;

  return (
    <>
      {error && (
        <div style={{ fontSize: 13, color: "#B4416B", marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>Messages</h2>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
          {activeSubtitle}
        </p>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
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
      </div>

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
            headerExtra={(
              <ChannelHeader
                conversation={activeChannel.conversation}
                membership={activeChannel.membership}
                onOpenNotifySettings={() => setNotifyChannelId(activeChannel.conversation.id)}
              />
            )}
            banner={activeChannel.conversation.read_only ? <ReadOnlyBanner /> : null}
            hideComposer={!!activeChannel.conversation.read_only}
            emptyState="No group messages yet — say hi when you’re ready."
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
            enableReply
            showPushPrompt
            onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
            onComposerFocusChange={onComposerFocusChange}
            initialDraft={initialDraft}
            onInitialDraftUsed={onInitialDraftUsed}
          />
        </ErrorBoundary>
      )}

      {notifyChannel && (
        <NotifySettingsSheet
          channel={notifyChannel}
          busy={notifyBusy}
          onClose={() => setNotifyChannelId(null)}
          onSave={saveNotifyLevel}
        />
      )}
    </>
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
        minHeight: 36,
        borderRadius: 999,
        border: `1.5px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentSoft : "#fff",
        color: active ? T.accentDeep : T.ink,
        fontFamily: F,
        fontWeight: 800,
        fontSize: 13.5,
        padding: "8px 13px",
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

function ChannelHeader({ conversation, membership, onOpenNotifySettings }) {
  const [open, setOpen] = useState(false);
  const guidelines = String(conversation?.guidelines || "").trim();
  return (
    <div style={{
      display: "grid",
      gap: 8,
      marginBottom: 10,
    }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!guidelines}
          style={{
            border: `1.5px solid ${T.border}`,
            background: "#fff",
            color: guidelines ? T.accentDeep : T.inkSoft,
            borderRadius: 999,
            padding: "8px 12px",
            fontFamily: F,
            fontWeight: 800,
            fontSize: 13,
            cursor: guidelines ? "pointer" : "default",
          }}
        >
          {open ? "Hide guidelines" : "Pinned guidelines"}
        </button>
        <button
          type="button"
          onClick={onOpenNotifySettings}
          style={{
            border: "none",
            background: T.accentSoft,
            color: T.accentDeep,
            borderRadius: 999,
            padding: "8px 12px",
            fontFamily: F,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Notify: {notifyLabel(membership?.notify_level)}
        </button>
      </div>
      {guidelines && open && (
        <div style={{
          border: `1.5px solid ${T.border}`,
          borderRadius: 14,
          background: "#fff",
          padding: "12px 14px",
          fontSize: 13.5,
          lineHeight: 1.5,
          color: T.ink,
          whiteSpace: "pre-wrap",
        }}
        >
          {guidelines}
        </div>
      )}
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
