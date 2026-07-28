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

  const activeClient = activeId ? clientMap.get(activeId) : null;
  const activeName = displayName(activeClient);

  const send = async (body) => {
    if (!activeId) return;
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({ clientId: activeId, body });
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

  const markRead = async () => {
    if (!activeId || !adminUserId) return;
    await db.markMessagesRead(activeId, adminUserId);
    refreshInbox();
  };

  const inboxIds = useMemo(() => new Set(inbox.map((i) => i.clientId)), [inbox]);

  const startable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster || [])
      .filter((c) => {
        if (adminUserId && c.id === adminUserId) return false; // don't start a thread with yourself
        const isAdmin = String(c.role || "").toLowerCase() === "admin";
        const active = c.stage === "active" || c.status === "active" || isAdmin;
        if (!active) return false;
        if (inboxIds.has(c.id)) return false;
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
        1:1 with each mama — same thread she sees under Messages. Admins (you + Callie) are listed too for testing.
      </p>
      {error && <div style={{ fontSize: 13, color: T.amber, marginBottom: 10 }}>{error}</div>}

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
            const c = clientMap.get(row.clientId);
            const name = displayName(c);
            const active = activeId === row.clientId;
            const isAdminRow = String(c?.role || "").toLowerCase() === "admin";
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
                  {row.lastMessage?.body || ""}
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
              const isAdminRow = String(c.role || "").toLowerCase() === "admin";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
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
                String(activeClient?.role || "").toLowerCase() === "admin"
                  ? `${activeClient?.email || "Admin"} · test thread`
                  : (activeClient?.email || "Private 1:1")
              }
              messages={messages}
              selfId={adminUserId}
              busy={busy}
              onSend={send}
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
