// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const { deferredByClient, dbMock, realtimeChannel } = vi.hoisted(() => {
  const pendingByClient = new Map();
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return {
    deferredByClient: pendingByClient,
    realtimeChannel: channel,
    dbMock: {
      loadMessageInbox: vi.fn(async () => [
        {
          clientId: "mama-a",
          unread: 1,
          participantIds: ["mama-a"],
          lastMessage: {
            id: "preview-a",
            body: "A preview",
            created_at: "2026-08-10T10:00:00Z",
          },
        },
        {
          clientId: "mama-b",
          unread: 1,
          participantIds: ["mama-b"],
          lastMessage: {
            id: "preview-b",
            body: "B preview",
            created_at: "2026-08-10T10:01:00Z",
          },
        },
      ]),
      listMyChannels: vi.fn(async () => []),
      loadChannelMessages: vi.fn(async () => []),
      loadMessages: vi.fn((clientId) => {
        const pending = pendingByClient.get(clientId);
        return pending ? pending.promise : Promise.resolve([]);
      }),
      loadAdminDmMessages: vi.fn(async () => []),
      ensureAdminDmConversation: vi.fn(),
      sendAdminDmMessage: vi.fn(),
      markAdminDmRead: vi.fn(async () => 0),
      markMessagesRead: vi.fn(async () => {}),
      countUnreadMessages: vi.fn(async () => 0),
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      toggleDmReaction: vi.fn(),
      savePushSubscription: vi.fn(),
    },
  };
});

vi.mock("../db/db", () => ({
  db: dbMock,
  fullName: (profile) => profile?.name || "",
  channelHasUnread: () => false,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

import { AdminMessages } from "./AdminMessages";

beforeEach(() => {
  deferredByClient.clear();
  vi.clearAllMocks();
  window.matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("AdminMessages thread switching", () => {
  it("never renders a late previous-client response under the new client", async () => {
    const mamaA = deferred();
    const mamaB = deferred();
    deferredByClient.set("mama-a", mamaA);
    deferredByClient.set("mama-b", mamaB);

    render(
      <AdminMessages
        roster={[
          { id: "mama-a", name: "Mama A", email: "a@example.com" },
          { id: "mama-b", name: "Mama B", email: "b@example.com" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Mama A/ }));
    expect(screen.getByText("Loading conversation…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Mama B/ }));
    mamaB.resolve([{
      id: "b-message",
      sender_id: "mama-b",
      body: "B private message",
      created_at: "2026-08-10T10:02:00Z",
      reactions: [],
    }]);
    await screen.findByText("B private message");

    mamaA.resolve([{
      id: "a-message",
      sender_id: "mama-a",
      body: "A private message",
      created_at: "2026-08-10T10:03:00Z",
      reactions: [],
    }]);

    await waitFor(() => {
      expect(screen.queryByText("A private message")).toBeNull();
      expect(screen.getByText("B private message")).toBeTruthy();
    });
  });

  it("does not merge a late send response into a different mama thread", async () => {
    const mamaA = deferred();
    const mamaB = deferred();
    const sendA = deferred();
    deferredByClient.set("mama-a", mamaA);
    deferredByClient.set("mama-b", mamaB);
    dbMock.sendMessage.mockImplementationOnce(() => sendA.promise);

    render(
      <AdminMessages
        roster={[
          { id: "mama-a", name: "Mama A", email: "a@example.com" },
          { id: "mama-b", name: "Mama B", email: "b@example.com" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Mama A/ }));
    mamaA.resolve([{
      id: "a-old",
      sender_id: "mama-a",
      body: "A existing",
      created_at: "2026-08-10T10:00:00Z",
      reactions: [],
    }]);
    await screen.findByText("A existing");

    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Reply to A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: /Mama B/ }));
    mamaB.resolve([{
      id: "b-existing",
      sender_id: "mama-b",
      body: "B existing",
      created_at: "2026-08-10T10:01:00Z",
      reactions: [],
    }]);
    await screen.findByText("B existing");

    sendA.resolve({
      id: "a-late-send",
      sender_id: "admin-1",
      body: "Reply to A",
      created_at: "2026-08-10T10:02:00Z",
      reactions: [],
    });

    await waitFor(() => {
      expect(screen.queryByText("Reply to A")).toBeNull();
      expect(screen.getByText("B existing")).toBeTruthy();
    });
  });

  it("does not let a late reaction refresh replace the selected thread", async () => {
    const mamaA = deferred();
    const mamaB = deferred();
    const reaction = deferred();
    deferredByClient.set("mama-a", mamaA);
    deferredByClient.set("mama-b", mamaB);
    dbMock.toggleDmReaction.mockImplementationOnce(() => reaction.promise);

    render(
      <AdminMessages
        roster={[
          { id: "mama-a", name: "Mama A", email: "a@example.com" },
          { id: "mama-b", name: "Mama B", email: "b@example.com" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Mama A/ }));
    mamaA.resolve([{
      id: "a-react",
      sender_id: "mama-a",
      body: "React on A",
      created_at: "2026-08-10T10:00:00Z",
      reactions: [],
    }]);
    const bubbleText = await screen.findByText("React on A");
    fireEvent.contextMenu(bubbleText.closest("[data-msg-id]"));
    fireEvent.click(screen.getByRole("button", { name: "React with ❤️" }));

    fireEvent.click(screen.getByRole("button", { name: /Mama B/ }));
    mamaB.resolve([{
      id: "b-after-react",
      sender_id: "mama-b",
      body: "B stays selected",
      created_at: "2026-08-10T10:01:00Z",
      reactions: [],
    }]);
    await screen.findByText("B stays selected");

    reaction.resolve({});
    await waitFor(() => {
      expect(screen.queryByText("React on A")).toBeNull();
      expect(screen.getByText("B stays selected")).toBeTruthy();
    });
  });
});

