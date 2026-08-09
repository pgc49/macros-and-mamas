import { useCallback, useEffect, useMemo, useState } from "react";
import { MessagesThread } from "./MessagesThread";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";

function friendlyError(e, fallback) {
  const msg = String(e?.message || "");
  if (/network|fetch|Failed to fetch/i.test(msg)) return "Network hiccup — try again.";
  if (/not enrolled|forbidden|JWT|unauthorized/i.test(msg)) return "Please sign in again.";
  if (/empty/i.test(msg)) return "Message is empty.";
  if (/voice memo|attachment|photo|PDF|10 MB/i.test(msg)) return msg;
  if (/Invalid notification/i.test(msg)) return msg;
  return fallback;
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

  useEffect(() => {
    if (!channels.length || activePill !== "callie") return;
    const requested = new URLSearchParams(window.location.search).get("channel");
    if (requested && channels.some((item) => item.conversation.id === requested)) {
      setActivePill(requested);
    }
  }, [channels, activePill]);

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

  const send = async (body, file = null) => {
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({ clientId: userId, body, file });
      setDmMessages((list) => [...list, row]);
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

  const sendChannel = async (body, file = null) => {
    if (!activeChannel) return;
    const conversationId = activeChannel.conversation.id;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendChannelMessage({ conversationId, body, file });
      setChannelMessages((all) => ({
        ...all,
        [conversationId]: [...(all[conversationId] || []), row],
      }));
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
        <MessagesThread
          key={activeChannel.conversation.id}
          title=""
          subtitle=""
          messages={activeChannelMessages}
          selfId={userId}
          peerName={activeChannel.conversation.label || "Group"}
          senderNameById={senderNameById}
          showSenderNames
          busy={busy}
          onSend={sendChannel}
          onEdit={editChannel}
          onDelete={removeChannel}
          onMarkRead={markChannelRead}
          canModerate={isAdmin}
          allowVoiceMemo={isAdmin}
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
          showPushPrompt={false}
          onComposerFocusChange={onComposerFocusChange}
        />
      ) : (
        <MessagesThread
          key="callie"
          title=""
          subtitle=""
          messages={dmMessages}
          selfId={userId}
          peerName="Callie"
          busy={busy}
          onSend={send}
          onEdit={edit}
          onDelete={remove}
          onMarkRead={markRead}
          showPushPrompt
          onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
          onComposerFocusChange={onComposerFocusChange}
        />
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(51,39,46,0.22)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          background: "#fff",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 20px 60px rgba(51,39,46,0.24)",
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
    </div>
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
