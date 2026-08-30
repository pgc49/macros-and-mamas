import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn, inputStyle } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { db, channelHasUnread } from "../db/db";
import { supabase } from "../lib/supabase";
import { mergeMessagesById } from "../lib/messageOrdering";
import { inboxDisplayName as displayName } from "./clientRoster";

function isAdminProfile(c) {
  return String(c?.role || "").toLowerCase() === "admin";
}

/** One shared Patrick↔Callie thread (whichever uuid sorts first). */
function canonicalAdminThreadId(a, b) {
  return String(a) < String(b) ? a : b;
}

function previewText(m) {
  if (m?.deleted_at) return "Message deleted";
  const body = String(m?.body || "").replace(/\s+/g, " ").trim();
  const prefix = m?.kind === "announcement" ? "Announcement: " : "";
  if (body) return prefix + body;
  if (m?.attachment_path) {
    if (String(m.attachment_mime || "").startsWith("image/")) return "Sent a photo";
    return m.attachment_name ? `Sent ${m.attachment_name}` : "Sent an attachment";
  }
  return "";
}

function peerIdForThread({ clientId, adminUserId, participantIds = [], clientMap }) {
  const client = clientMap.get(clientId);
  if (!isAdminProfile(client)) return clientId;
  if (clientId !== adminUserId) return clientId;
  const other = (participantIds || []).find((id) => id && id !== adminUserId);
  return other || null;
}

function useIsWide() {
  const [wide, setWide] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia("(min-width: 900px)").matches : false
  ));
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return wide;
}

/**
 * Admin Messages — iMessage-style on mobile (full inbox → full thread + back),
 * split inbox/thread on desktop. Includes live cohort group chats.
 */
export function AdminMessages({
  roster = [],
  adminUserId,
  initialClientId = null,
  onUnreadTotalChange,
}) {
  const isWide = useIsWide();
  const [inbox, setInbox] = useState([]);
  const [channels, setChannels] = useState([]);
  const [channelMessages, setChannelMessages] = useState({});
  /** @type {[{ type: 'dm'|'channel', id: string }|null, Function]} */
  const [active, setActive] = useState(
    initialClientId ? { type: "dm", id: initialClientId } : null,
  );
  const [dmMessages, setDmMessages] = useState([]);
  const [dmLoadedClientId, setDmLoadedClientId] = useState(null);
  const [dmLoadErrorClientId, setDmLoadErrorClientId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const activeRef = useRef(active);
  const dmLoadSequence = useRef(new Map());

  const rosterMap = useMemo(() => {
    const m = new Map();
    for (const c of roster || []) if (c?.id) m.set(c.id, c);
    return m;
  }, [roster]);

  const clientMap = useMemo(() => {
    const m = new Map(rosterMap);
    for (const row of inbox) {
      if (row.peer?.id && !m.has(row.peer.id)) m.set(row.peer.id, row.peer);
      for (const p of row.participantPeers || []) {
        if (p?.id && !m.has(p.id)) m.set(p.id, p);
      }
    }
    return m;
  }, [rosterMap, inbox]);

  const refreshInbox = useCallback(async () => {
    try {
      const rows = await db.loadMessageInbox(adminUserId);
      setInbox(rows);
      const dmUnread = rows.reduce((n, r) => n + (r.unread || 0), 0);
      onUnreadTotalChange?.(dmUnread);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load inbox.");
    }
  }, [adminUserId, onUnreadTotalChange]);

  const refreshChannels = useCallback(async () => {
    if (!adminUserId) return;
    try {
      const list = await db.listMyChannels();
      const withPreview = await Promise.all(list.map(async (item) => {
        const messages = await db.loadChannelMessages(item.conversation.id, { limit: 80 });
        return {
          ...item,
          messages,
          hasUnread: channelHasUnread(item.conversation, item.membership, messages),
        };
      }));
      setChannels(withPreview);
      setChannelMessages(Object.fromEntries(
        withPreview.map((item) => [item.conversation.id, item.messages]),
      ));
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load group chats.");
    }
  }, [adminUserId]);

  const refreshDmThread = useCallback(async (clientId, { clear = false } = {}) => {
    const sequence = (dmLoadSequence.current.get(clientId) || 0) + 1;
    dmLoadSequence.current.set(clientId, sequence);
    if (!clientId) {
      setDmMessages([]);
      setDmLoadedClientId(null);
      setDmLoadErrorClientId(null);
      return;
    }
    if (clear) {
      setDmMessages([]);
      setDmLoadedClientId(null);
      setDmLoadErrorClientId(null);
      setError("");
    }
    try {
      const list = await db.loadMessages(clientId);
      const stillCurrent = activeRef.current?.type === "dm"
        && activeRef.current.id === clientId;
      if (sequence !== dmLoadSequence.current.get(clientId) || !stillCurrent) return;
      setDmMessages(list);
      setDmLoadedClientId(clientId);
      setDmLoadErrorClientId(null);
    } catch (e) {
      const stillCurrent = activeRef.current?.type === "dm"
        && activeRef.current.id === clientId;
      if (sequence !== dmLoadSequence.current.get(clientId) || !stillCurrent) return;
      console.error(e);
      setDmLoadErrorClientId(clientId);
      setError(e.message || "Couldn’t load thread.");
    }
  }, []);

  useEffect(() => {
    refreshInbox();
    refreshChannels();
  }, [refreshInbox, refreshChannels]);

  useEffect(() => {
    if (initialClientId) {
      const next = { type: "dm", id: initialClientId };
      activeRef.current = next;
      setActive(next);
    }
  }, [initialClientId]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (active?.type === "dm") refreshDmThread(active.id, { clear: true });
  }, [active, refreshDmThread]);

  useEffect(() => {
    const channel = supabase
      .channel("messages-admin-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          refreshInbox();
          if (active?.type === "dm") refreshDmThread(active.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          if (active?.type === "dm") refreshDmThread(active.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_messages" },
        () => {
          refreshChannels();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_message_reactions" },
        () => {
          refreshChannels();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, refreshInbox, refreshDmThread, refreshChannels]);

  const activeChannel = active?.type === "channel"
    ? channels.find((c) => c.conversation.id === active.id) || null
    : null;
  const activeChannelMessages = active?.type === "channel"
    ? (channelMessages[active.id] || activeChannel?.messages || [])
    : [];

  const activePeerId = useMemo(() => {
    if (active?.type !== "dm" || !adminUserId) return active?.id || null;
    const fromMsgs = dmMessages
      .map((m) => m.sender_id)
      .filter((id) => id && id !== adminUserId);
    const participants = [...new Set([active.id, ...fromMsgs])];
    return peerIdForThread({
      clientId: active.id,
      adminUserId,
      participantIds: participants,
      clientMap,
    }) || active.id;
  }, [active, adminUserId, dmMessages, clientMap]);

  const activePeer = activePeerId ? clientMap.get(activePeerId) : null;
  const activeName = active?.type === "channel"
    ? (activeChannel?.conversation?.label || "Group")
    : displayName(activePeer);
  const activeIsAdmin = active?.type === "dm" && isAdminProfile(activePeer);

  const senderNameById = useMemo(() => {
    const map = {};
    for (const c of clientMap.values()) {
      if (c?.id) map[c.id] = displayName(c);
    }
    for (const m of activeChannelMessages) {
      if (m?.sender_id && m.sender_profile) {
        map[m.sender_id] = channelSenderName(m.sender_profile, m.sender_id === adminUserId);
      }
    }
    return map;
  }, [clientMap, activeChannelMessages, adminUserId]);

  const openDm = (profileOrId) => {
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* ignore */ }
    if (typeof profileOrId === "string") {
      const next = { type: "dm", id: profileOrId };
      activeRef.current = next;
      setActive(next);
      return;
    }
    const profile = profileOrId;
    if (!profile?.id) return;
    if (isAdminProfile(profile) && adminUserId) {
      const next = { type: "dm", id: canonicalAdminThreadId(adminUserId, profile.id) };
      activeRef.current = next;
      setActive(next);
      return;
    }
    const next = { type: "dm", id: profile.id };
    activeRef.current = next;
    setActive(next);
  };

  const openChannel = (conversationId) => {
    if (!conversationId) return;
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* ignore */ }
    const next = { type: "channel", id: conversationId };
    activeRef.current = next;
    setActive(next);
  };

  const closeThread = () => {
    activeRef.current = null;
    setActive(null);
    setDmMessages([]);
  };

  const sendDm = async (body, file = null, opts = {}) => {
    const clientId = activeRef.current?.type === "dm" ? activeRef.current.id : null;
    if (!clientId) return;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({
        clientId,
        body,
        file,
        replyToId: opts.replyToId || null,
        clientMessageId: opts.clientMessageId || null,
      });
      if (activeRef.current?.type === "dm" && activeRef.current.id === clientId) {
        setDmMessages((list) => mergeMessagesById(list, [row]));
      }
      refreshInbox();
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const sendChannel = async (body, file = null, opts = {}) => {
    if (active?.type !== "channel") return;
    const conversationId = active.id;
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
      setChannelMessages((all) => ({
        ...all,
        [conversationId]: mergeMessagesById(all[conversationId] || [], [row]),
      }));
      refreshChannels();
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const editDm = async (messageId, body) => {
    const clientId = activeRef.current?.type === "dm" ? activeRef.current.id : null;
    if (!clientId) return;
    const row = await db.editMessage(messageId, body);
    if (activeRef.current?.type === "dm" && activeRef.current.id === clientId) {
      setDmMessages((list) => mergeMessagesById(list, [row]));
    }
    refreshInbox();
  };

  const removeDm = async (messageId) => {
    const clientId = activeRef.current?.type === "dm" ? activeRef.current.id : null;
    if (!clientId) return;
    const row = await db.deleteMessage(messageId);
    if (activeRef.current?.type === "dm" && activeRef.current.id === clientId) {
      setDmMessages((list) => mergeMessagesById(list, [{ ...row, attachmentUrl: null }]));
    }
    refreshInbox();
  };

  const editChannel = async (messageId, body) => {
    if (active?.type !== "channel") return;
    const row = await db.editChannelMessage(messageId, body);
    const conversationId = active.id;
    setChannelMessages((all) => ({
      ...all,
      [conversationId]: (all[conversationId] || []).map((m) => (m.id === row.id ? { ...m, ...row } : m)),
    }));
  };

  const removeChannel = async (messageId) => {
    if (active?.type !== "channel") return;
    const row = await db.deleteChannelMessage(messageId);
    const conversationId = active.id;
    setChannelMessages((all) => ({
      ...all,
      [conversationId]: (all[conversationId] || []).map((m) => (
        m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m
      )),
    }));
  };

  const reactDm = async (messageId, emoji) => {
    const clientId = activeRef.current?.type === "dm" ? activeRef.current.id : null;
    if (!clientId) return;
    await db.toggleDmReaction(messageId, emoji);
    await refreshDmThread(clientId);
  };

  const reactChannel = async (messageId, emoji) => {
    await db.toggleChannelReaction(messageId, emoji);
    await refreshChannels();
  };

  const markDmRead = async () => {
    const clientId = activeRef.current?.type === "dm" ? activeRef.current.id : null;
    if (!clientId || !adminUserId) return;
    await db.markMessagesRead(clientId, adminUserId);
    refreshInbox();
  };

  const markChannelRead = async () => {
    if (active?.type !== "channel") return;
    const membership = await db.markChannelRead(active.id);
    if (!membership) return;
    setChannels((list) => list.map((item) => {
      if (item.conversation.id !== active.id) return item;
      const next = { ...item, membership: { ...item.membership, ...membership } };
      return {
        ...next,
        hasUnread: channelHasUnread(
          next.conversation,
          next.membership,
          channelMessages[active.id] || next.messages || [],
        ),
      };
    }));
  };

  const inboxIds = useMemo(() => new Set(inbox.map((i) => i.clientId)), [inbox]);
  const q = query.trim().toLowerCase();

  const filteredChannels = useMemo(() => {
    if (!q) return channels;
    return channels.filter((item) => (
      String(item.conversation?.label || "").toLowerCase().includes(q)
    ));
  }, [channels, q]);

  const filteredInbox = useMemo(() => {
    if (!q) return inbox;
    return inbox.filter((row) => {
      const peerId = peerIdForThread({
        clientId: row.clientId,
        adminUserId,
        participantIds: row.participantIds,
        clientMap,
      });
      const c = clientMap.get(peerId || row.clientId);
      const hay = `${displayName(c, row.peer)} ${c?.email || row.peer?.email || ""} ${previewText(row.lastMessage)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [inbox, q, adminUserId, clientMap]);

  const startable = useMemo(() => (
    (roster || [])
      .filter((c) => {
        if (adminUserId && c.id === adminUserId) return false;
        const isAdmin = isAdminProfile(c);
        const activeClient = c.stage === "active" || c.status === "active" || isAdmin;
        if (!activeClient) return false;
        const threadId = (isAdmin && adminUserId)
          ? canonicalAdminThreadId(adminUserId, c.id)
          : c.id;
        if (inboxIds.has(threadId)) return false;
        if (!q) return true;
        const hay = `${displayName(c)} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }))
  ), [roster, inboxIds, q, adminUserId]);

  const showInbox = isWide || !active;
  const showThread = isWide || !!active;

  const inboxPane = (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      minHeight: 0,
      height: isWide ? "min(78vh, 820px)" : "auto",
      background: "#fff",
      border: `1.5px solid ${T.border}`,
      borderRadius: 16,
      overflow: "hidden",
    }}
    >
      <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.03, marginBottom: 8 }}>
          Inbox
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages or mamas…"
          style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            padding: "11px 12px",
            fontSize: 15,
          }}
        />
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "8px 8px 12px",
        minHeight: 0,
      }}
      >
        {!!filteredChannels.length && (
          <>
            <SectionLabel>Groups</SectionLabel>
            {filteredChannels.map((item) => {
              const id = item.conversation.id;
              const selected = active?.type === "channel" && active.id === id;
              return (
                <InboxRow
                  key={`ch-${id}`}
                  title={item.conversation.label || "Group"}
                  subtitle={item.hasUnread ? "New activity" : "Group chat"}
                  unread={item.hasUnread ? 1 : 0}
                  unreadAsDot
                  active={selected}
                  onClick={() => openChannel(id)}
                />
              );
            })}
          </>
        )}

        <SectionLabel>Direct</SectionLabel>
        {!filteredInbox.length && (
          <div style={{ fontSize: 13, color: T.inkSoft, padding: "8px 6px" }}>
            {q ? "No matching threads." : "No 1:1 threads yet — start one below."}
          </div>
        )}
        {filteredInbox.map((row) => {
          const peerId = peerIdForThread({
            clientId: row.clientId,
            adminUserId,
            participantIds: row.participantIds,
            clientMap,
          });
          const c = clientMap.get(peerId || row.clientId);
          const name = displayName(c, row.peer);
          const selected = active?.type === "dm" && active.id === row.clientId;
          const isAdminRow = isAdminProfile(c);
          return (
            <InboxRow
              key={row.clientId}
              title={`${name}${isAdminRow ? " · admin" : ""}`}
              subtitle={previewText(row.lastMessage) || "No messages yet"}
              unread={row.unread || 0}
              active={selected}
              onClick={() => openDm(row.clientId)}
            />
          );
        })}

        <SectionLabel>Start a thread</SectionLabel>
        {!startable.length ? (
          <div style={{ fontSize: 13, color: T.inkSoft, padding: "4px 6px" }}>
            {q ? "No matches." : "Everyone already has a thread."}
          </div>
        ) : (
          startable.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openDm(c)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontFamily: F,
                border: `1px dashed ${T.border}`,
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 4,
                cursor: "pointer",
                background: "#fff",
                color: T.inkSoft,
                fontSize: 14,
              }}
            >
              {displayName(c)}
              {isAdminProfile(c) ? " · admin" : ""}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const threadPane = (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      minHeight: 0,
      // Mobile: fill the screen under admin chrome for an iMessage-like thread.
      // Fixed height + overflow hidden so long histories scroll inside, not the page.
      height: isWide ? "min(78vh, 820px)" : "calc(100dvh - 132px)",
      maxHeight: isWide ? "min(78vh, 820px)" : "calc(100dvh - 132px)",
      background: "#fff",
      border: `1.5px solid ${T.border}`,
      borderRadius: 16,
      overflow: "hidden",
    }}
    >
      {!active ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: T.inkSoft,
          fontSize: 14,
          textAlign: "center",
        }}
        >
          Pick a group or mama to read or reply.
        </div>
      ) : (
        <>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
          >
            {!isWide && (
              <button
                type="button"
                onClick={closeThread}
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.accent,
                  fontWeight: 700,
                  fontFamily: F,
                  fontSize: 15,
                  cursor: "pointer",
                  padding: "6px 4px",
                  flexShrink: 0,
                }}
              >
                ← Inbox
              </button>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontFamily: FD,
                fontSize: 20,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              >
                {activeName}
              </div>
              <div style={{
                fontSize: 12.5,
                color: T.inkSoft,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              >
                {active?.type === "channel"
                  ? "Group chat · you can reply & moderate"
                  : (activeIsAdmin
                    ? `${activePeer?.email || "Admin"} · test thread`
                    : (activePeer?.email || "Private 1:1"))}
              </div>
            </div>
            {isWide && (
              <Btn small ghost onClick={closeThread}>Close</Btn>
            )}
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: "10px 12px 12px",
            display: "flex",
            flexDirection: "column",
          }}
          >
            {active.type === "channel" ? (
              <ErrorBoundary
                name="AdminChannelThread"
                title="This group thread hit a snag"
                message="The inbox still works. Try again or open another conversation."
                resetKeys={[active.id]}
              >
                <MessagesThread
                  key={`ch-${active.id}`}
                  title=""
                  subtitle=""
                  messages={activeChannelMessages}
                  selfId={adminUserId}
                  threadKey={`channel:${active.id}:${adminUserId}`}
                  peerName={activeName}
                  senderNameById={senderNameById}
                  showSenderNames
                  busy={busy}
                  onSend={sendChannel}
                  onEdit={editChannel}
                  onDelete={removeChannel}
                  onReact={reactChannel}
                  onMarkRead={markChannelRead}
                  canModerate
                  allowVoiceMemo
                  enableReply
                  banner={activeChannel?.conversation?.read_only ? (
                    <div style={{
                      background: T.accentSoft,
                      borderRadius: 12,
                      padding: "10px 12px",
                      marginBottom: 10,
                      fontSize: 13.5,
                    }}
                    >
                      This group is read-only right now.
                    </div>
                  ) : null}
                  hideComposer={!!activeChannel?.conversation?.read_only}
                  emptyState="No group messages yet."
                  showPushPrompt
                  onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
                  compact
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary
                name="AdminDmThread"
                title="This conversation hit a snag"
                message="The inbox still works. Try again or open another mama."
                resetKeys={[active.id]}
              >
                <MessagesThread
                  key={`dm-${active.id}`}
                  title=""
                  subtitle=""
                  messages={dmLoadedClientId === active.id ? dmMessages : []}
                  selfId={adminUserId}
                  threadKey={`dm:${active.id}:${adminUserId}`}
                  peerName={activeName}
                  senderNameById={senderNameById}
                  threadClientId={activeIsAdmin ? null : active.id}
                  showSenderNames
                  busy={busy || dmLoadedClientId !== active.id}
                  onSend={sendDm}
                  onEdit={editDm}
                  onDelete={removeDm}
                  onReact={reactDm}
                  onMarkRead={dmLoadedClientId === active.id ? markDmRead : undefined}
                  showReadReceipts
                  allowVoiceMemo
                  enableReply
                  showPushPrompt
                  banner={dmLoadErrorClientId === active.id ? (
                    <div style={{
                      background: T.amberSoft,
                      borderRadius: 12,
                      padding: "10px 12px",
                      marginBottom: 10,
                      fontSize: 13.5,
                      color: T.ink,
                    }}
                    >
                      Couldn’t load this conversation.{" "}
                      <button
                        type="button"
                        onClick={() => refreshDmThread(active.id, { clear: true })}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: T.accentDeep,
                          font: "inherit",
                          fontWeight: 700,
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  ) : dmLoadedClientId !== active.id ? (
                    <div style={{
                      background: T.track,
                      borderRadius: 12,
                      padding: "10px 12px",
                      marginBottom: 10,
                      fontSize: 13.5,
                      color: T.inkSoft,
                    }}
                    >
                      Loading conversation…
                    </div>
                  ) : null}
                  onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
                  compact
                />
              </ErrorBoundary>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      {(!active || isWide) && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "4px 0 6px" }}>Messages</h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
            Reply to one mama, or open a group chat. To text many mamas the same note at once, use Announcements.
          </p>
        </>
      )}
      {error && <div style={{ fontSize: 13, color: T.amber, marginBottom: 10 }}>{error}</div>}

      <div
        data-admin-messages-grid
        style={{
        display: "grid",
        width: "100%",
        minWidth: 0,
        gridTemplateColumns: isWide && showInbox && showThread
          ? "minmax(220px, 280px) minmax(0, 1fr)"
          : "minmax(0, 1fr)",
        gap: 12,
        alignItems: "stretch",
      }}
      >
        {showInbox && inboxPane}
        {showThread && threadPane}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11.5,
      fontWeight: 700,
      color: T.inkSoft,
      letterSpacing: 0.04,
      textTransform: "uppercase",
      margin: "10px 6px 6px",
    }}
    >
      {children}
    </div>
  );
}

function InboxRow({
  title,
  subtitle,
  unread = 0,
  unreadAsDot = false,
  active = false,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        fontFamily: F,
        border: "none",
        borderRadius: 12,
        padding: "12px 12px",
        marginBottom: 4,
        cursor: "pointer",
        background: active ? T.accentSoft : "transparent",
        color: T.ink,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 0 }}>
          {title}
        </span>
        {unread > 0 && (
          unreadAsDot ? (
            <span style={{
              width: 9,
              height: 9,
              borderRadius: 99,
              background: T.accent,
              flexShrink: 0,
            }}
            />
          ) : (
            <span style={{
              background: T.accent,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 99,
              padding: "2px 7px",
              minWidth: 18,
              textAlign: "center",
              flexShrink: 0,
            }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )
        )}
      </div>
      <div style={{
        fontSize: 13,
        color: T.inkSoft,
        marginTop: 3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      >
        {subtitle}
      </div>
    </button>
  );
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
