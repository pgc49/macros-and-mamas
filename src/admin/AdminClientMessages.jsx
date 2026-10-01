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
import {
  applyMessageChange,
  applyReactionEvent,
} from "../lib/realtimeMessageApply";
import {
  restoreAndResignMessageWindow,
  writeMessageWindow,
} from "../lib/messageWindowCache";


/**
 * Per-client Messages on the admin client detail page.
 * Same thread as the Messages inbox tab — Callie can nudge while reviewing data.
 */
export function AdminClientMessages({ client, adminUserId, onActivity }) {
  const clientId = client?.id;
  const [messages, setMessages] = useState([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(messages);
  const hasEarlierRef = useRef(hasEarlier);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { hasEarlierRef.current = hasEarlier; }, [hasEarlier]);

  const name = fullName(client) || client?.name || "her";
  const first = String(name).trim().split(/\s+/)[0] || "her";

  const refresh = useCallback(async () => {
    if (!clientId) return;
    try {
      const list = await db.loadMessages(clientId);
      setMessages((current) => mergeMessagesById(current, list));
      setHasEarlier(pageHasMore(list, MESSAGE_PAGE_SIZE));
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load messages.");
    }
  }, [clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!clientId || !adminUserId) return undefined;
    let cancelled = false;
    restoreAndResignMessageWindow(
      `dm:${clientId}:${adminUserId}`,
      (row) => db.hydrateDmMessageRow(row),
    ).then((cached) => {
      if (cancelled || !cached.length) return;
      setMessages((current) => mergeMessagesById(cached, current));
    });
    return () => { cancelled = true; };
  }, [adminUserId, clientId]);

  useEffect(() => {
    if (!clientId || !adminUserId || !messages.length) return undefined;
    const timer = window.setTimeout(() => {
      writeMessageWindow(`dm:${clientId}:${adminUserId}`, messages);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adminUserId, clientId, messages]);

  useEffect(() => {
    if (!clientId) return undefined;
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
        (payload) => {
          setMessages((list) => applyMessageChange(list, payload));
          const row = payload?.new;
          if (row && (payload.eventType === "INSERT" || payload.eventType === "UPDATE") && !row.deleted_at) {
            db.hydrateDmMessageRow(row).then((hydrated) => {
              if (!hydrated) return;
              setMessages((list) => mergeMessagesById(list, [hydrated]));
            }).catch(() => {});
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          setMessages((list) => applyReactionEvent(list, payload, adminUserId));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, adminUserId]);

  const loadEarlier = useCallback(async () => {
    const before = earlierCursor(messagesRef.current);
    if (!clientId || !before) return;
    const older = await db.loadMessages(clientId, { before });
    setMessages((list) => mergeMessagesById(older, list));
    setHasEarlier(pageHasMore(older, MESSAGE_PAGE_SIZE));
  }, [clientId]);

  const ensureMessage = useCallback(async (messageId) => {
    let guard = 0;
    while (guard < 24) {
      if ((messagesRef.current || []).some((row) => String(row?.id || "") === String(messageId || ""))) {
        return true;
      }
      if (!hasEarlierRef.current) break;
      await loadEarlier();
      guard += 1;
    }
    return (messagesRef.current || []).some((row) => String(row?.id || "") === String(messageId || ""));
  }, [loadEarlier]);

  const send = async (body, file = null, opts = {}) => {
    if (!clientId) return;
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
          onSend={send}
          onEdit={edit}
          onDelete={remove}
          onReact={react}
          onMarkRead={markRead}
          onLoadEarlier={loadEarlier}
          onEnsureMessage={ensureMessage}
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
