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
      channelHasUnreadMessages: vi.fn(async () => false),
      markChannelRead: vi.fn(async () => ({ last_read_at: "2026-09-04T12:00:00Z" })),
      sendChannelMessage: vi.fn(),
      editChannelMessage: vi.fn(),
      deleteChannelMessage: vi.fn(),
      toggleChannelReaction: vi.fn(),
      loadMessages: vi.fn((clientId) => {
        const pending = pendingByClient.get(clientId);
        return pending ? pending.promise : Promise.resolve([]);
      }),
      markMessagesRead: vi.fn(async () => {}),
      countUnreadMessages: vi.fn(async () => 0),
      sendMessage: vi.fn(),
      hydrateChannelMessageRow: vi.fn(async (row) => row),
      hydrateDmMessageRow: vi.fn(async (row) => row),
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

describe("AdminMessages inbox titles", () => {
  it("renders distinct first+last titles from the roster", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([
      {
        clientId: "c-lee",
        unread: 0,
        participantIds: ["c-lee"],
        lastMessage: { id: "p1", body: "Lee preview", created_at: "2026-08-10T10:00:00Z" },
      },
      {
        clientId: "c-park",
        unread: 0,
        participantIds: ["c-park"],
        lastMessage: { id: "p2", body: "Park preview", created_at: "2026-08-10T10:01:00Z" },
      },
    ]);

    render(
      <AdminMessages
        roster={[
          { id: "c-lee", name: "Christina", firstName: "Christina", lastName: "Lee", email: "christina@example.com" },
          { id: "c-park", name: "Chelsea", firstName: "Chelsea", lastName: "Park", email: "chelsea@example.com" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByRole("button", { name: /Christina Lee/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chelsea Park/ })).toBeTruthy();
    expect(screen.getByText("Lee preview")).toBeTruthy();
    expect(screen.getByText("Park preview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mama$/ })).toBeNull();
    expect(screen.queryAllByText("Mama")).toHaveLength(0);
  });

  it("does not title a missing peer Mama when the inbox row has a profile", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([
      {
        clientId: "ghost",
        unread: 0,
        participantIds: ["ghost"],
        lastMessage: { id: "g1", body: "Ghost preview", created_at: "2026-08-10T10:00:00Z" },
        peer: { id: "ghost", name: "Nora", firstName: "Nora", lastName: "Kim", email: "nora@example.com" },
      },
    ]);

    render(
      <AdminMessages
        roster={[]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByRole("button", { name: /Nora Kim/ })).toBeTruthy();
    expect(screen.getByText("Ghost preview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mama$/ })).toBeNull();
    expect(screen.queryAllByText("Mama")).toHaveLength(0);
  });

  it("shows a real identity when the profile name is the Mama placeholder plus last_name", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([
      {
        clientId: "wells",
        unread: 0,
        participantIds: ["wells"],
        lastMessage: { id: "w1", body: "Wells preview", created_at: "2026-08-10T10:00:00Z" },
      },
    ]);

    render(
      <AdminMessages
        roster={[
          { id: "wells", name: "Mama", firstName: "Mama", lastName: "Wells", email: "wells@example.com" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByRole("button", { name: /Wells/ })).toBeTruthy();
    expect(screen.getByText("Wells preview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mama$/ })).toBeNull();
  });

  it("missing clientMap peers get distinct email / Unnamed titles, not Mama", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([
      {
        clientId: "a",
        unread: 0,
        participantIds: ["a"],
        lastMessage: { id: "a1", body: "A preview", created_at: "2026-08-10T10:00:00Z" },
        peer: { id: "a", email: "christina@example.com" },
      },
      {
        clientId: "b",
        unread: 0,
        participantIds: ["b"],
        lastMessage: { id: "b1", body: "B preview", created_at: "2026-08-10T10:01:00Z" },
        peer: { id: "b", email: "chelsea@example.com" },
      },
      {
        clientId: "c",
        unread: 0,
        participantIds: ["c"],
        lastMessage: { id: "c1", body: "C preview", created_at: "2026-08-10T10:02:00Z" },
      },
    ]);

    render(
      <AdminMessages
        roster={[]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByRole("button", { name: /christina/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /chelsea/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unnamed/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mama$/ })).toBeNull();
    expect(screen.queryAllByText("Mama")).toHaveLength(0);
  });

  it("titles DIRECT rows from lastMessage.sender_profile when the roster is empty", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([
      {
        clientId: "c-lee",
        unread: 0,
        participantIds: ["c-lee"],
        lastMessage: {
          id: "p1",
          sender_id: "c-lee",
          body: "Lee preview",
          created_at: "2026-08-10T10:00:00Z",
          sender_profile: { id: "c-lee", name: "Christina", last_name: "Lee" },
        },
      },
      {
        clientId: "c-park",
        unread: 0,
        participantIds: ["c-park"],
        lastMessage: {
          id: "p2",
          sender_id: "c-park",
          body: "Park preview",
          created_at: "2026-08-10T10:01:00Z",
          sender_profile: { id: "c-park", name: "Chelsea", last_name: "Park" },
        },
      },
    ]);

    render(
      <AdminMessages
        roster={[]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByRole("button", { name: /Christina Lee/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chelsea Park/ })).toBeTruthy();
    expect(screen.queryAllByText("Mama")).toHaveLength(0);
  });

  it("lists start-a-thread people by first+last, not Mama", async () => {
    dbMock.loadMessageInbox.mockResolvedValueOnce([]);

    render(
      <AdminMessages
        roster={[
          { id: "c-lee", name: "Christina", lastName: "Lee", email: "christina@example.com", stage: "active" },
          { id: "c-park", name: "Chelsea", lastName: "Park", email: "chelsea@example.com", status: "active" },
        ]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    expect(await screen.findByText("Christina Lee")).toBeTruthy();
    expect(screen.getByText("Chelsea Park")).toBeTruthy();
    expect(screen.queryByText("Mama")).toBeNull();
  });
});

describe("AdminMessages thread switching", () => {
  it("gives the thread pane leftover width on desktop so the composer is not crushed", async () => {
    render(
      <AdminMessages
        roster={[
          { id: "mama-a", name: "Mama A", email: "a@example.com" },
          { id: "mama-b", name: "Mama B", email: "b@example.com" },
        ]}
        adminUserId="admin-1"
        initialClientId="mama-a"
        onUnreadTotalChange={() => {}}
      />,
    );

    const grid = await waitFor(() => {
      const el = document.querySelector("[data-admin-messages-grid]");
      expect(el).toBeTruthy();
      return el;
    });
    expect(grid.style.minWidth).toBe("0px");
    expect(grid.style.width).toBe("100%");
    expect(grid.style.minHeight).toBe("0px");
    expect(grid.style.flexGrow).toBe("1");
    expect(grid.style.gridTemplateColumns).toBe("minmax(220px, 280px) minmax(0, 1fr)");

    const pane = document.querySelector("[data-admin-thread-pane]");
    expect(pane).toBeTruthy();
    expect(pane.style.height).toBe("100%");
    expect(pane.style.maxHeight).toBe("none");
    expect(pane.style.minHeight).toBe("0px");

    const input = await screen.findByPlaceholderText("Write a message…");
    expect(input.style.minWidth).toBe("0px");
    expect(input.style.flex).toContain("180px");
  });

  it("fills leftover height on a phone instead of guessing 100dvh minus chrome", async () => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <AdminMessages
        roster={[{ id: "mama-a", name: "Mama A", email: "a@example.com" }]}
        adminUserId="admin-1"
        initialClientId="mama-a"
        onUnreadTotalChange={() => {}}
      />,
    );

    const root = await waitFor(() => {
      const el = document.querySelector("[data-admin-messages]");
      expect(el).toBeTruthy();
      return el;
    });
    expect(root.style.flexGrow).toBe("1");
    expect(root.style.minHeight).toBe("0px");
    expect(root.style.height).toBe("100%");
    expect(root.style.overflow).toBe("hidden");

    const pane = document.querySelector("[data-admin-thread-pane]");
    expect(pane).toBeTruthy();
    expect(pane.style.height).toBe("100%");
    expect(pane.style.maxHeight).toBe("none");
    expect(pane.getAttribute("style") || "").not.toMatch(/100dvh/);

    expect(await screen.findByPlaceholderText("Write a message…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Messages" })).toBeNull();
  });
});

describe("AdminMessages group loading", () => {
  function channelItem(id, label) {
    return {
      conversation: { id, label, guidelines: "", read_only: false },
      membership: { user_id: "admin-1", notify_level: "highlights", last_read_at: "2026-09-01T00:00:00Z" },
    };
  }

  it("does not load any group history until a row is opened", async () => {
    dbMock.listMyChannels.mockResolvedValue([
      channelItem("aug", "August Group"),
    ]);
    dbMock.channelHasUnreadMessages.mockResolvedValue(true);

    render(
      <AdminMessages
        roster={[]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /August Group/ })).toBeTruthy();
    });
    expect(dbMock.channelHasUnreadMessages).toHaveBeenCalledWith("aug", expect.any(Object));
    expect(dbMock.loadChannelMessages).not.toHaveBeenCalled();
  });

  it("loads a group once when its inbox row is opened", async () => {
    dbMock.listMyChannels.mockResolvedValue([
      channelItem("aug", "August Group"),
    ]);
    dbMock.loadChannelMessages.mockResolvedValue([
      {
        id: "g-1",
        conversation_id: "aug",
        sender_id: "mama-a",
        body: "group hello",
        created_at: "2026-08-10T10:00:00Z",
        reactions: [],
      },
    ]);

    render(
      <AdminMessages
        roster={[]}
        adminUserId="admin-1"
        onUnreadTotalChange={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /August Group/ }));
    await waitFor(() => {
      expect(dbMock.loadChannelMessages).toHaveBeenCalledWith("aug");
    });
    expect(await screen.findByText("group hello")).toBeTruthy();
  });
});

