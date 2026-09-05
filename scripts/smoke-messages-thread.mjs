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
assert(src.includes("createBottomPin"), "MessagesThread should pin the live edge while content settles");
assert(!src.includes("setTimeout(jump"), "MessagesThread must not one-shot jump after a delay");
const pinSrc = readFileSync(new URL("../src/lib/stickToBottom.js", import.meta.url), "utf8");
assert(pinSrc.includes("function bottomScrollTop"), "bottom pin must compute live-edge scrollTop");
assert(pinSrc.includes("scroller.scrollTop = bottomScrollTop(scroller)"), "bottom pin should scroll the list to the tip");
assert(pinSrc.includes("function pinChildToBottom"), "jump-to-latest must pin the tip bubble to the pane");
const virtSrc = readFileSync(new URL("../src/lib/messageListWindow.js", import.meta.url), "utf8");
assert(virtSrc.includes("function visibleMessageRange"), "thread must virtualize with a scroll-height-preserving window");
assert(virtSrc.includes("function commitWindowRange"), "virtual window must hold the mounted slice while scrolling");
assert(virtSrc.includes("function shouldVirtualizeMessages"), "short threads must stay fully mounted");
assert(src.includes("expandOnly") && src.includes("userScrollingRef"), "must not remount or setState mid-fling");
assert(src.includes("overflowAnchor") && src.includes("onListScroll"), "thread scroll must not remount on every tick or fight anchoring");
assert(src.includes("data-virt-top") && src.includes("onEnsureMessage"), "thread must window bubbles and jump to quoted parents");
assert(!/scrollTop\s*=\s*scroller\.scrollHeight/.test(pinSrc), "must not assign scrollHeight as scrollTop");
assert(src.includes('height: "100%"'), "customer thread must fill the leftover Messages pane");
assert(!src.includes("62vh"), "customer thread must not use a scrollable 62vh box");
assert(src.includes('minHeight: 0'), "message flex items must be allowed to shrink");
assert(src.includes('maxHeight: "none"'), "message list sizing must come from its bounded thread");
assert(src.includes("paddingBottom: 4"), "thread must pad composer away from overflow clip");
assert(src.includes("outline: \"none\"") || src.includes("outline: 'none'"), "composer focus must use in-box border, not outer Safari ring");

const adminSrc = readFileSync(new URL("../src/admin/AdminClientMessages.jsx", import.meta.url), "utf8");
assert(adminSrc.includes("min(70vh, 640px)"), "AdminClientMessages should bound chat height");
assert(adminSrc.includes("MessagesThread"), "AdminClientMessages still mounts MessagesThread");

const boundarySrc = readFileSync(new URL("../src/components/ErrorBoundary.jsx", import.meta.url), "utf8");
assert(boundarySrc.includes("resetKeys"), "ErrorBoundary must reset when context changes");
assert(boundarySrc.includes("Try again"), "ErrorBoundary must offer local recovery");

const clientAppSrc = readFileSync(new URL("../src/views/ClientApp.jsx", import.meta.url), "utf8");
assert(clientAppSrc.includes('name="CustomerMessages"'), "customer Messages needs a local boundary");
assert(clientAppSrc.includes("lockContentScroll={tab === \"messages\"}"), "Messages must lock page scroll so the composer stays put");
assert(!/tab === "messages"[\s\S]{0,400}TechHelpFooter/.test(clientAppSrc), "Messages must not show App help under the composer");

const adminPortalSrc = readFileSync(new URL("../src/admin/AdminPortal.jsx", import.meta.url), "utf8");
assert(adminPortalSrc.includes('name="AdminMessages"'), "admin inbox needs a local boundary");
assert(adminPortalSrc.includes("client-messages-${sel.id}"), "client-message boundary must remount by client");
assert(adminPortalSrc.includes("contentMaxWidth={tab === \"messages\" ? 1120 : 560}"), "admin Messages must use a wide desktop shell");
assert(adminPortalSrc.includes("lockContentScroll={tab === \"messages\"}"), "admin Messages must lock page scroll so the composer stays put");
assert(adminPortalSrc.includes("hideBottomBar={tab === \"messages\" && composerFocused}"), "admin Messages must hide the tab bar while the composer is focused");
assert(adminPortalSrc.includes("onComposerFocusChange={setComposerFocused}"), "admin inbox must report composer focus to the shell");

const adminInboxSrc = readFileSync(new URL("../src/admin/AdminMessages.jsx", import.meta.url), "utf8");
assert(adminInboxSrc.includes("data-admin-thread-pane"), "admin thread pane must be marked for layout tests");
assert(adminInboxSrc.includes('height: "100%"'), "admin thread must fill leftover Shell height");
assert(!adminInboxSrc.includes("100dvh - 132px"), "admin thread must not guess viewport minus chrome");
assert(!adminInboxSrc.includes("78vh"), "admin thread must not use a viewport-height card on desktop");

const adminNavSrc = readFileSync(new URL("../src/admin/AdminBottomNav.jsx", import.meta.url), "utf8");
assert(adminNavSrc.includes('padding: "12px 12px 4px"'), "admin tab bar must match mama compact padding");
assert(!adminNavSrc.includes("safe-area-inset-bottom"), "admin tab bar must not double-count safe-area (that lives on .mam-tabbar)");

const shellSrc = readFileSync(new URL("../src/components/ui.jsx", import.meta.url), "utf8");
assert(shellSrc.includes("contentMaxWidth = 560"), "Shell must keep the phone-width default");
assert(shellSrc.includes("maxWidth: contentMaxWidth"), "Shell must honor contentMaxWidth");
assert(shellSrc.includes("lockContentScroll = false"), "Shell must support locking content scroll for Messages");

assert(src.includes("flexWrap: \"wrap\""), "composer must wrap instead of crushing the textarea");
assert(src.includes("flex: \"1 1 180px\""), "composer textarea needs a usable flex basis on desktop");

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
      null,
      {
        id: "malformed",
        sender_id: "becca-1",
        body: { unexpected: true },
        attachment_mime: 42,
        reactions: "not-an-array",
        created_at: "invalid",
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
      {
        id: "m-photo",
        sender_id: "becca-1",
        body: "",
        attachment_path: "aug/plate.jpg",
        attachment_mime: "image/jpeg",
        attachment_name: "plate.jpg",
        attachmentUrl: "https://example.com/plate.jpg",
        created_at: "2026-08-10T10:07:00.000Z",
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
  assert(html.includes('data-open-photo="m-photo"'), "photos should open an in-app viewer");
  assert(!/<a[^>]+target="_blank"[^>]*>\s*<img/.test(html), "thread images should not open a new tab");
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

  const panelMod = await vite.ssrLoadModule("/src/components/MessagesPanel.jsx");
  const panelHtml = renderToString(createElement(panelMod.MessagesPanel, {
    userId: "mama-1",
    onUnreadChange: () => {},
    onComposerFocusChange: () => {},
  }));
  assert(panelHtml.includes("Callie"), "customer MessagesPanel renders");
  assert(panelHtml.includes("data-messages-panel"), "customer MessagesPanel fills leftover height");
  assert(panelHtml.includes("data-messages-thread-slot"), "customer thread slot pins the composer");

  const inboxMod = await vite.ssrLoadModule("/src/admin/AdminMessages.jsx");
  const inboxHtml = renderToString(createElement(inboxMod.AdminMessages, {
    roster: [],
    adminUserId: "admin-1",
    onUnreadTotalChange: () => {},
  }));
  assert(inboxHtml.includes("Messages"), "admin inbox renders");

  console.log("qa:messages-thread OK");
} finally {
  await vite.close();
}
