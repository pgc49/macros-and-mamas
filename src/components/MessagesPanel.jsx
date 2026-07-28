import { useCallback, useEffect, useState } from "react";
import { MessagesThread } from "./MessagesThread";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";

/** Mama Messages tab — 1:1 with Callie. */
export function MessagesPanel({ userId, onUnreadChange, onComposerFocusChange }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await db.loadMessages(userId);
      setMessages(list);
      const unread = list.filter((m) => !m.deleted_at && !m.read_at && m.sender_id !== userId).length;
      onUnreadChange?.(unread);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load messages.");
    }
  }, [userId, onUnreadChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        () => { refresh(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const send = async (body, file = null) => {
    setBusy(true);
    setError("");
    try {
      const row = await db.sendMessage({ clientId: userId, body, file });
      setMessages((list) => [...list, row]);
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
  };

  const remove = async (messageId) => {
    const row = await db.deleteMessage(messageId);
    setMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m)));
  };

  const markRead = async () => {
    if (!userId) return;
    await db.markMessagesRead(userId, userId);
    onUnreadChange?.(0);
    setMessages((list) => list.map((m) => (
      m.sender_id === userId || m.read_at || m.deleted_at
        ? m
        : { ...m, read_at: m.read_at || new Date().toISOString() }
    )));
  };

  return (
    <>
      {error && (
        <div style={{ fontSize: 13, color: "#B4416B", marginBottom: 8 }}>{error}</div>
      )}
      <MessagesThread
        title="Messages"
        subtitle="Private chat with Callie — stays in the app"
        messages={messages}
        selfId={userId}
        peerName="Callie"
        threadClientId={userId}
        busy={busy}
        onSend={send}
        onEdit={edit}
        onDelete={remove}
        onMarkRead={markRead}
        showPushPrompt
        onSavePushSubscription={(sub) => db.savePushSubscription(sub)}
        onComposerFocusChange={onComposerFocusChange}
      />
    </>
  );
}
