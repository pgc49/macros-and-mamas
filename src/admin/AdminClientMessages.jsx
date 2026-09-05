import { useCallback, useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { db, fullName } from "../db/db";
import { supabase } from "../lib/supabase";
import { mergeMessagesById } from "../lib/messageOrdering";
import {
  applyReactionToMessages,
  earlierCursor,
  MESSAGE_PAGE_SIZE,
  pageHasMore,
} from "../lib/messageChannels";
import { createCoalescedRefresh } from "../lib/realtimeCoalesce";

/**
 * Per-client Messages on the admin client detail page.
 * Same thread as the Messages inbox tab — Callie can nudge while reviewing data.
 */
export function AdminClientMessages({ client, adminUserId, onActivity }) {
  const clientId = client?.id;
  const [messages, setMessages] = useState([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const name = fullName(client) || client?.name || "her";
  const first = String(name).trim().split(/\s+/)[0] || "her";

  const refresh = useCallback(async () => {
    if (!clientId) return;
    try {
      const list = await db.loadMessages(clientId);
      setMessages(list);
      setHasEarlier(pageHasMore(list, MESSAGE_PAGE_SIZE));
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load messages.");
    }
  }, [clientId]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!clientId) return undefined;
    const coalesced = createCoalescedRefresh(() => refreshRef.current?.());
    const channel = supabase
      .channel(`messages-admin-client-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${clientId}`,
        },
        () => { coalesced.request(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => { coalesced.request(); },
      )
      .subscribe();
    return () => {
      coalesced.dispose();
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  const loadEarlier = useCallback(async () => {
    const before = earlierCursor(messagesRef.current);
    if (!clientId || !before) return;
    const older = await db.loadMessages(clientId, { before });
    setMessages((list) => mergeMessagesById(older, list));
    setHasEarlier(pageHasMore(older, MESSAGE_PAGE_SIZE));
  }, [clientId]);

  const send = async (body, file = null, opts = {}) => {
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
      setMessages((list) => mergeMessagesById(list, [row]));
      onActivity?.();
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
    onActivity?.();
  };

  const remove = async (messageId) => {
    const row = await db.deleteMessage(messageId);
    setMessages((list) => list.map((m) => (m.id === row.id ? { ...m, ...row, attachmentUrl: null } : m)));
    onActivity?.();
  };

  const react = async (messageId, emoji) => {
    setMessages((list) => applyReactionToMessages(list, messageId, emoji, adminUserId));
    await db.toggleDmReaction(messageId, emoji);
  };

  const markRead = async () => {
    if (!clientId || !adminUserId) return;
    await db.markMessagesRead(clientId, adminUserId);
    onActivity?.();
  };

  if (!clientId || !adminUserId) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Message {first}</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
        Same thread as the Messages tab — nudge her while you review, or reply to what she sent.
      </p>
      {error && (
        <div style={{ fontSize: 13, color: T.amber, marginBottom: 8, fontFamily: F }}>{error}</div>
      )}
      <div style={{
        height: "min(70vh, 640px)",
        maxHeight: "min(70vh, 640px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
      >
        <MessagesThread
          title=""
          subtitle=""
          messages={messages}
          selfId={adminUserId}
          threadKey={`dm:${clientId}:${adminUserId}`}
          peerName={first}
          senderNameById={client?.id ? { [client.id]: first } : null}
          threadClientId={clientId}
          showSenderNames
          busy={busy}
          onSend={send}
          onEdit={edit}
          onDelete={remove}
          onReact={react}
          onMarkRead={markRead}
          onLoadEarlier={loadEarlier}
          hasEarlier={hasEarlier}
          showReadReceipts
          allowVoiceMemo
          enableReply
          showPushPrompt={false}
          compact
        />
      </div>
    </Card>
  );
}
