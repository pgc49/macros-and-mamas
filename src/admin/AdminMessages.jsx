import { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { db, fullName } from "../db/db";
import { supabase } from "../lib/supabase";

function displayName(c) {
  if (!c) return "Mama";
  return fullName(c) || c.name || c.email || "Mama";
}

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

/**
 * Who the admin is chatting with in this thread (not herself).
 */
function peerIdForThread({ clientId, adminUserId, participantIds = [], clientMap }) {
  const client = clientMap.get(clientId);
  if (!isAdminProfile(client)) return clientId;
  if (clientId !== adminUserId) return clientId;
  const other = (participantIds || []).find((id) => id && id !== adminUserId);
  return other || null;
}

/**
 * Admin Messages inbox — list of mama threads + 1:1 reply.
 * Admins (Callie / Patrick) are also startable so you can DM each other to test.
 */
export function AdminMessages({
  roster = [],
  adminUserId,
  initialClientId = null,
  onUnreadTotalChange,
}) {
  const [inbox, setInbox] = useState([]);
  const [activeId, setActiveId] = useState(initialClientId);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceAudience, setAnnounceAudience] = useState("active");
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState("");

  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of roster || []) m.set(c.id, c);
    return m;
  }, [roster]);

  const refreshInbox = useCallback(async () => {
    try {
      const rows = await db.loadMessageInbox(adminUserId);
      setInbox(rows);
      const total = rows.reduce((n, r) => n + (r.unread || 0), 0);
      onUnreadTotalChange?.(total);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load inbox.");
    }
  }, [adminUserId, onUnreadTotalChange]);

  const refreshThread = useCallback(async (clientId) => {
    if (!clientId) {
      setMessages([]);
      return;
    }
    try {
      const list = await db.loadMessages(clientId);
      setMessages(list);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load thread.");
    }
  }, []);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (initialClientId) setActiveId(initialClientId);
  }, [initialClientId]);

  useEffect(() => {
    refreshThread(activeId);
  }, [activeId, refreshThread]);

  useEffect(() => {
    const channel = supabase
      .channel("messages-admin-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          refreshInbox();
          if (activeId) refreshThread(activeId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, refreshInbox, refreshThread]);

  const activePeerId = useMemo(() => {
    if (!activeId || !adminUserId) return activeId;
    const fromMsgs = messages
      .map((m) => m.sender_id)
      .filter((id) => id && id !== adminUserId);
    const participants = [...new Set([activeId, ...fromMsgs])];
    return peerIdForThread({
      clientId: activeId,
      adminUserId,
      participantIds: participants,
      clientMap,
    }) || activeId;
  }, [activeId, adminUserId, messages, clientMap]);

  const activePeer = activePeerId ? clientMap.get(activePeerId) : null;
  const activeName = displayName(activePeer);
  const activeIsAdmin = isAdminProfile(activePeer);

  const openThreadWith = (profile) => {
    if (!profile?.id) return;
    if (isAdminProfile(profile) && adminUserId) {
      setActiveId(canonicalAdminThreadId(adminUserId, profile.id));
      return;
    }
    setActiveId(profile.id);
  };

  const send = async (body, file = null) => {
    if (!activeId) return;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({ clientId: activeId, body, file });
      setMessages((list) => [...list, row]);
      refreshInbox();
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const edit = async (messageId, body) => {
    const row = await db.editMessage(messageId, body);
    setMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
    refreshInbox();
  };

  const remove = async (messageId) => {
    const row = await db.deleteMessage(messageId);
    setMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m)));
    refreshInbox();
  };

  const markRead = async () => {
    if (!activeId || !adminUserId) return;
    await db.markMessagesRead(activeId, adminUserId);
    refreshInbox();
  };

  const activeMamaCount = useMemo(
    () => (roster || []).filter((c) => {
      if (isAdminProfile(c)) return false;
      return c.stage === "active" || c.status === "active";
    }).length,
    [roster],
  );
  const allMamaCount = useMemo(
    () => (roster || []).filter((c) => !isAdminProfile(c) && !c.refunded).length,
    [roster],
  );

  const sendAnnouncement = async () => {
    const text = announceBody.trim();
    if (!text) return;
    const n = announceAudience === "all_mamas" ? allMamaCount : activeMamaCount;
    if (!window.confirm(`Send this announcement to ${n} mama${n === 1 ? "" : "s"}? They’ll get it in Messages${n ? " + a push/email" : ""}.`)) {
      return;
    }
    setAnnounceBusy(true);
    setAnnounceMsg("");
    setError("");
    try {
      const result = await db.broadcastAnnouncement({
        body: text,
        audience: announceAudience,
      });
      setAnnounceBody("");
      setAnnounceMsg(
        `Sent to ${result.messages || 0} thread${(result.messages || 0) === 1 ? "" : "s"}`
        + (result.pushSent ? ` · ${result.pushSent} push` : "")
        + (result.emailSent ? ` · ${result.emailSent} email` : "")
        + ".",
      );
      refreshInbox();
      if (activeId) refreshThread(activeId);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t send announcement.");
    } finally {
      setAnnounceBusy(false);
    }
  };

  const inboxIds = useMemo(() => new Set(inbox.map((i) => i.clientId)), [inbox]);

  const startable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster || [])
      .filter((c) => {
        if (adminUserId && c.id === adminUserId) return false;
        const isAdmin = isAdminProfile(c);
        const active = c.stage === "active" || c.status === "active" || isAdmin;
        if (!active) return false;
        const threadId = (isAdmin && adminUserId)
          ? canonicalAdminThreadId(adminUserId, c.id)
          : c.id;
        if (inboxIds.has(threadId)) return false;
        if (!q) return true;
        const hay = `${displayName(c)} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }));
  }, [roster, inboxIds, query, adminUserId]);

  const sortedInbox = useMemo(() => {
    // Keep recency order for inbox (already sorted by last message)
    return inbox;
  }, [inbox]);

  return (
    <div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "4px 0 6px" }}>Messages</h2>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
        1:1 with each mama — same thread she sees under Messages. Admins (you + Callie) share one test thread.
      </p>
      {error && <div style={{ fontSize: 13, color: T.amber, marginBottom: 10 }}>{error}</div>}

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Announce to mamas</div>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
          Posts as a Callie announcement in each mama’s Messages thread and sends a push (email if push isn’t on).
        </p>
        <textarea
          value={announceBody}
          onChange={(e) => setAnnounceBody(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="App update, schedule note, quick tip…"
          style={{
            ...inputStyle,
            resize: "vertical",
            minHeight: 72,
            fontFamily: F,
          }}
        />
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginTop: 10,
        }}
        >
          <label style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
            To
            <select
              value={announceAudience}
              onChange={(e) => setAnnounceAudience(e.target.value)}
              style={{
                ...inputStyle,
                width: "auto",
                padding: "8px 10px",
                fontSize: 13,
              }}
            >
              <option value="active">Active mamas ({activeMamaCount})</option>
              <option value="all_mamas">All mamas ({allMamaCount})</option>
            </select>
          </label>
          <Btn
            small
            onClick={sendAnnouncement}
            disabled={announceBusy || !announceBody.trim()}
          >
            {announceBusy ? "Sending…" : "Send announcement"}
          </Btn>
        </div>
        {announceMsg && (
          <div style={{ fontSize: 13, color: "#3E5A46", marginTop: 10 }}>{announceMsg}</div>
        )}
      </Card>

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 300px) 1fr",
        gap: 12,
        alignItems: "start",
      }}
      >
        <Card style={{ padding: 10, maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 8, letterSpacing: 0.03 }}>
            Inbox
          </div>
          {!sortedInbox.length && (
            <div style={{ fontSize: 13, color: T.inkSoft, padding: "8px 4px" }}>
              No threads yet — start one below.
            </div>
          )}
          {sortedInbox.map((row) => {
            const peerId = peerIdForThread({
              clientId: row.clientId,
              adminUserId,
              participantIds: row.participantIds,
              clientMap,
            });
            const c = clientMap.get(peerId || row.clientId);
            const name = displayName(c);
            const active = activeId === row.clientId;
            const isAdminRow = isAdminProfile(c);
            return (
              <button
                key={row.clientId}
                type="button"
                onClick={() => setActiveId(row.clientId)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontFamily: F,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 10px",
                  marginBottom: 4,
                  cursor: "pointer",
                  background: active ? T.accentSoft : "transparent",
                  color: T.ink,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {name}
                    {isAdminRow ? " · admin" : ""}
                  </span>
                  {row.unread > 0 && (
                    <span style={{
                      background: T.accent,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 99,
                      padding: "2px 7px",
                      minWidth: 18,
                      textAlign: "center",
                    }}
                    >
                      {row.unread}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 12.5,
                  color: T.inkSoft,
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                >
                  {previewText(row.lastMessage)}
                </div>
              </button>
            );
          })}

          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.inkSoft,
            margin: "14px 0 8px",
            letterSpacing: 0.03,
          }}
          >
            Start a thread
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            style={{
              ...inputStyle,
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 8,
              padding: "10px 12px",
              fontSize: 14,
            }}
          />
          {!startable.length ? (
            <div style={{ fontSize: 13, color: T.inkSoft, padding: "4px 2px" }}>
              {query ? "No matches." : "Everyone already has a thread."}
            </div>
          ) : (
            startable.map((c) => {
              const isAdminRow = isAdminProfile(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openThreadWith(c)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontFamily: F,
                    border: `1px dashed ${T.border}`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    marginBottom: 4,
                    cursor: "pointer",
                    background: "#fff",
                    color: T.inkSoft,
                    fontSize: 13.5,
                  }}
                >
                  {displayName(c)}
                  {isAdminRow ? " · admin" : ""}
                </button>
              );
            })
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          {!activeId ? (
            <div style={{ fontSize: 14, color: T.inkSoft, padding: 20, textAlign: "center" }}>
              Pick a mama (or admin) to read or reply.
            </div>
          ) : (
            <MessagesThread
              title={activeName}
              subtitle={
                activeIsAdmin
                  ? `${activePeer?.email || "Admin"} · test thread`
                  : (activePeer?.email || "Private 1:1")
              }
              messages={messages}
              selfId={adminUserId}
              peerName={activeName}
              busy={busy}
              onSend={send}
              onEdit={edit}
              onDelete={remove}
              onMarkRead={markRead}
              showPushPrompt
              onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
            />
          )}
          {activeId && (
            <div style={{ marginTop: 8 }}>
              <Btn
                small
                ghost
                onClick={() => {
                  setActiveId(null);
                  setMessages([]);
                }}
              >
                Close thread
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
