import { useCallback, useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { MessagesThread } from "../components/MessagesThread";
import { db, fullName } from "../db/db";
import { supabase } from "../lib/supabase";
import { mergeMessagesById } from "../lib/messageOrdering";

/**
 * Per-client Messages on the admin client detail page.
 * Same thread as the Messages inbox tab — Callie can nudge while reviewing data.
 */
export function AdminClientMessages({ client, adminUserId, onActivity }) {
  const clientId = client?.id;
  const isAdminClient = String(client?.role || "").toLowerCase() === "admin";
  const isSelfAdmin = isAdminClient && clientId === adminUserId;
  const [messages, setMessages] = useState([]);
  const [adminConversation, setAdminConversation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const name = fullName(client) || client?.name || "her";
  const first = String(name).trim().split(/\s+/)[0] || "her";

  const refresh = useCallback(async () => {
    if (!clientId || isSelfAdmin) return;
    try {
      const conversation = isAdminClient
        ? await db.ensureAdminDmConversation(clientId)
        : null;
      if (conversation) setAdminConversation(conversation);
      const list = conversation
        ? await db.loadAdminDmMessages(conversation.id)
        : await db.loadMessages(clientId);
      setMessages(list);
    } catch (e) {
      console.error(e);
      setError(e.message || "Couldn’t load messages.");
    }
  }, [clientId, isAdminClient, isSelfAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!clientId || isSelfAdmin) return undefined;
    const conversationId = adminConversation?.id || null;
    const channel = supabase
      .channel(`messages-admin-client-${conversationId || clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: conversationId
            ? `admin_dm_conversation_id=eq.${conversationId}`
            : `client_id=eq.${clientId}`,
        },
        () => { refresh(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => { refresh(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminConversation?.id, clientId, isSelfAdmin, refresh]);

  const send = async (body, file = null, opts = {}) => {
    if (!clientId) return;
    setBusy(true);
    setError("");
    try {
      const row = isAdminClient
        ? await db.sendAdminDmMessage({
          conversationId: adminConversation?.id,
          clientId: adminConversation?.participant_low,
          recipientId: clientId,
          body,
          file,
          replyToId: opts.replyToId || null,
          clientMessageId: opts.clientMessageId || null,
        })
        : await db.sendMessage({
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
    await db.toggleDmReaction(messageId, emoji);
    await refresh();
  };

  const markRead = async () => {
    if (!clientId || !adminUserId) return;
    if (isAdminClient && adminConversation?.id) {
      await db.markAdminDmRead(adminConversation.id);
    } else {
      await db.markMessagesRead(clientId, adminUserId);
    }
    onActivity?.();
  };

  if (!clientId || !adminUserId) return null;
  if (isSelfAdmin) {
    return (
      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 18 }}>Messages</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "6px 0 0" }}>
          This is your own admin profile. Open another admin to use the test DM.
        </p>
      </Card>
    );
  }

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
          threadKey={`dm:${adminConversation?.id || clientId}:${adminUserId}`}
          peerName={first}
          senderNameById={client?.id ? { [client.id]: first } : null}
          threadClientId={isAdminClient ? null : clientId}
          showSenderNames
          busy={busy || (isAdminClient && !adminConversation)}
          onSend={send}
          onEdit={edit}
          onDelete={remove}
          onReact={react}
          onMarkRead={markRead}
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
