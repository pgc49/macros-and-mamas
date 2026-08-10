#!/usr/bin/env node
/**
 * Smoke-test MessagesThread / AdminClientMessages render path.
 * Catches the bottomRef crash that blanked admin client messages.
 *
 * Run: npm run qa:messages-thread
 */

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const src = readFileSync(new URL("../src/components/MessagesThread.jsx", import.meta.url), "utf8");
assert(!/\bbottomRef\b/.test(src), "MessagesThread must not reference bottomRef");
assert(src.includes("scrollTop = el.scrollHeight"), "MessagesThread should scroll list to tip");
assert(src.includes("minHeight: compact ? 0 : 280"), "compact list must use minHeight 0");

const adminSrc = readFileSync(new URL("../src/admin/AdminClientMessages.jsx", import.meta.url), "utf8");
assert(adminSrc.includes("min(70vh, 640px)"), "AdminClientMessages should bound chat height");
assert(adminSrc.includes("MessagesThread"), "AdminClientMessages still mounts MessagesThread");

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const mod = await vite.ssrLoadModule("/src/components/MessagesThread.jsx");
  const { MessagesThread } = mod;
  assert(typeof MessagesThread === "function", "MessagesThread export missing");

  const html = renderToString(createElement(MessagesThread, {
    title: "",
    subtitle: "",
    compact: true,
    selfId: "admin-1",
    peerName: "Becca",
    showSenderNames: true,
    showReadReceipts: true,
    allowVoiceMemo: true,
    enableReply: true,
    showPushPrompt: false,
    messages: [
      {
        id: "m1",
        sender_id: "becca-1",
        body: "Hi Callie",
        created_at: "2026-08-10T10:00:00.000Z",
        reactions: [],
      },
      {
        id: "m2",
        sender_id: "admin-1",
        body: "Hey Becca — how are you feeling this week?",
        created_at: "2026-08-10T10:05:00.000Z",
        read_at: null,
        reactions: [],
      },
      {
        id: "m3",
        sender_id: "admin-1",
        body: "",
        attachment_path: "x/voice-memo.m4a",
        attachment_mime: "audio/mp4",
        attachment_name: "voice-memo.m4a",
        attachmentUrl: "https://example.com/voice.m4a",
        created_at: "2026-08-10T10:06:00.000Z",
        reactions: [],
      },
    ],
    onSend: async () => {},
    onEdit: async () => {},
    onDelete: async () => {},
    onReact: async () => {},
    onMarkRead: async () => {},
  }));

  assert(html.includes("Hi Callie"), "renders mama text");
  assert(html.includes("Hey Becca"), "renders admin text");
  assert(html.includes("Voice memo") || html.includes("voice"), "renders voice memo player");
  assert(!html.includes("Messages couldn’t load"), "must not render error boundary copy");

  const adminMod = await vite.ssrLoadModule("/src/admin/AdminClientMessages.jsx");
  const { AdminClientMessages } = adminMod;
  assert(typeof AdminClientMessages === "function", "AdminClientMessages export missing");

  // Mount shell without waiting on network loads — must not throw on first paint.
  const adminHtml = renderToString(createElement(AdminClientMessages, {
    client: {
      id: "becca-1",
      name: "Becca",
      email: "beccajocaruso@gmail.com",
    },
    adminUserId: "admin-1",
    onActivity: () => {},
  }));
  assert(adminHtml.includes("Message") && adminHtml.includes("Becca"), "admin card title renders");
  assert(!adminHtml.includes("Messages couldn’t load"), "admin card must not crash");
  assert(adminHtml.includes("Write a message") || adminHtml.includes("Send"), "composer renders inside admin card");

  console.log("qa:messages-thread OK");
} finally {
  await vite.close();
}
