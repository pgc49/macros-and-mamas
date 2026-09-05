// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { dbMock, realtimeChannel, profileQuery, handlers } = vi.hoisted(() => {
  /** Registered Realtime handlers, keyed by table. */
  const handlers = new Map();
  const channel = {};
  channel.on = vi.fn((_event, config, handler) => {
    const list = handlers.get(config.table) || [];
    list.push(handler);
    handlers.set(config.table, list);
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { role: "client" } })),
  };
  return {
    handlers,
    realtimeChannel: channel,
    profileQuery: query,
    dbMock: {
      loadMessages: vi.fn(async () => []),
      countUnreadMessages: vi.fn(async () => 0),
      listMyChannels: vi.fn(async () => []),
      loadChannelMessages: vi.fn(async () => []),
      channelHasUnread: vi.fn(() => false),
      channelHasUnreadMessages: vi.fn(async () => false),
      markMessagesRead: vi.fn(async () => {}),
      markChannelRead: vi.fn(async () => ({ last_read_at: "2026-09-04T12:00:00Z" })),
      sendMessage: vi.fn(),
      sendChannelMessage: vi.fn(),
      hydrateChannelMessageRow: vi.fn(async (row) => row),
      hydrateDmMessageRow: vi.fn(async (row) => row),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editChannelMessage: vi.fn(),
      deleteChannelMessage: vi.fn(),
      toggleDmReaction: vi.fn(async () => ({})),
      toggleChannelReaction: vi.fn(async () => ({})),
      savePushSubscription: vi.fn(),
      updateChannelNotifyLevel: vi.fn(),
    },
  };
});

vi.mock("../db/db", () => ({ db: dbMock }));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => profileQuery),
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

import { MessagesPanel } from "./MessagesPanel";
import { MESSAGE_PAGE_SIZE } from "../lib/messageChannels";
import { REALTIME_COALESCE_MAX_MS } from "../lib/realtimeCoalesce";

function channelItem(id, label) {
  return {
    conversation: { id, label, guidelines: "", read_only: false },
    membership: { user_id: "mama-1", notify_level: "highlights", last_read_at: "2026-09-01T00:00:00Z" },
  };
}

function message(n, extra = {}) {
  return {
    id: `m-${n}`,
    conversation_id: "aug",
    sender_id: "other",
    body: `group message ${n}`,
    created_at: new Date(Date.UTC(2026, 7, 1, 0, n)).toISOString(),
    reaction_rows: [],
    reactions: [],
    ...extra,
  };
}

/** A full page, which is how the panel infers there is more history behind it. */
function fullPage(offset = 0) {
  return Array.from({ length: MESSAGE_PAGE_SIZE }, (_, i) => message(offset + i));
}

async function emit(table, payload = {}) {
  await act(async () => {
    for (const handler of handlers.get(table) || []) handler(payload);
    await vi.advanceTimersByTimeAsync(REALTIME_COALESCE_MAX_MS + 50);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  profileQuery.maybeSingle.mockResolvedValue({ data: { role: "client" } });
  dbMock.loadMessages.mockResolvedValue([]);
  dbMock.countUnreadMessages.mockResolvedValue(0);
  dbMock.loadChannelMessages.mockResolvedValue([]);
  dbMock.channelHasUnreadMessages.mockResolvedValue(false);
  dbMock.listMyChannels.mockResolvedValue([
    channelItem("aug", "August Group"),
    channelItem("founding", "Founding Members"),
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("opening the Messages tab", () => {
  it("does not load any group history until a pill is tapped", async () => {
    render(<MessagesPanel userId="mama-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "August Group" })).toBeTruthy();
    });

    // The slow first paint came from loading every channel's window up front.
    expect(dbMock.loadChannelMessages).not.toHaveBeenCalled();
  });

  it("resolves unread dots with the indexed check, not by loading windows", async () => {
    dbMock.channelHasUnreadMessages.mockImplementation(async (id) => id === "aug");

    render(<MessagesPanel userId="mama-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Unread group messages")).toBeTruthy();
    });
    expect(dbMock.channelHasUnreadMessages).toHaveBeenCalledWith("aug", expect.any(Object));
    expect(dbMock.loadChannelMessages).not.toHaveBeenCalled();
  });

  it("counts DM unread in the database rather than over the loaded page", async () => {
    dbMock.countUnreadMessages.mockResolvedValue(7);
    const onUnreadChange = vi.fn();

    render(<MessagesPanel userId="mama-1" onUnreadChange={onUnreadChange} />);

    // A page is the newest slice only, so counting it would undercount someone
    // coming back after a long absence.
    await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(7));
  });

  it("loads a group once when its pill is tapped, and not again on return", async () => {
    dbMock.loadChannelMessages.mockResolvedValue([message(1)]);
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => {
      expect(dbMock.loadChannelMessages).toHaveBeenCalledWith("aug");
    });

    fireEvent.click(screen.getByRole("button", { name: "Callie" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));

    await waitFor(() => expect(screen.getByText("group message 1")).toBeTruthy());
    expect(dbMock.loadChannelMessages).toHaveBeenCalledTimes(1);
  });
});

describe("load earlier messages", () => {
  it("offers earlier history only when the first page came back full", async () => {
    dbMock.loadChannelMessages.mockResolvedValue(fullPage());
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load earlier messages" })).toBeTruthy();
    });
  });

  it("hides the control for a thread that fits in one page", async () => {
    dbMock.loadChannelMessages.mockResolvedValue([message(1), message(2)]);
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));

    await waitFor(() => expect(screen.getByText("group message 1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
  });

  it("pages back from the oldest loaded message and prepends the result", async () => {
    dbMock.loadChannelMessages.mockResolvedValueOnce(fullPage(100));
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => screen.getByRole("button", { name: "Load earlier messages" }));

    dbMock.loadChannelMessages.mockResolvedValueOnce([message(1, { body: "the oldest post" })]);
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));

    await waitFor(() => expect(screen.getByText("the oldest post")).toBeTruthy());
    expect(dbMock.loadChannelMessages).toHaveBeenLastCalledWith("aug", {
      before: { created_at: message(100).created_at, id: "m-100" },
    });
    // The whole first page is still on screen alongside the older one.
    expect(screen.getByText("group message 100")).toBeTruthy();
  });

  it("stops offering earlier history once a short page comes back", async () => {
    dbMock.loadChannelMessages.mockResolvedValueOnce(fullPage(100));
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => screen.getByRole("button", { name: "Load earlier messages" }));

    dbMock.loadChannelMessages.mockResolvedValueOnce([message(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
    });
  });
});

describe("tapbacks", () => {
  it("patches the loaded window instead of reloading the thread", async () => {
    dbMock.loadChannelMessages.mockResolvedValue([message(1)]);
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => expect(screen.getByText("group message 1")).toBeTruthy());
    expect(dbMock.loadChannelMessages).toHaveBeenCalledTimes(1);

    // Long-press equivalent: the bubble menu opens on context menu too.
    fireEvent.contextMenu(document.querySelector('[data-msg-id="m-1"]'));
    const heart = await screen.findByRole("button", { name: "React with ❤️" });
    fireEvent.click(heart);

    await waitFor(() => expect(dbMock.toggleChannelReaction).toHaveBeenCalledWith("m-1", "❤️"));
    // A reload would hand every bubble a new object and move the scroll.
    expect(dbMock.loadChannelMessages).toHaveBeenCalledTimes(1);
  });
});

describe("Realtime traffic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("applies a burst of group messages in place without reloading", async () => {
    dbMock.loadChannelMessages.mockResolvedValue([message(1)]);
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => expect(dbMock.loadChannelMessages).toHaveBeenCalledTimes(1));
    dbMock.loadChannelMessages.mockClear();
    dbMock.channelHasUnreadMessages.mockClear();

    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        for (const handler of handlers.get("conversation_messages") || []) {
          handler({
            eventType: "INSERT",
            new: {
              id: `live-${i}`,
              conversation_id: "aug",
              sender_id: "other",
              body: `live ${i}`,
              created_at: new Date(Date.UTC(2026, 8, 5, 12, i)).toISOString(),
            },
          });
        }
      }
    });

    expect(dbMock.loadChannelMessages).not.toHaveBeenCalled();
    expect(await screen.findByText("live 7")).toBeTruthy();
    expect(screen.getByText("group message 1")).toBeTruthy();
  });

  it("does not reload the open thread for a message in another group", async () => {
    dbMock.loadChannelMessages.mockResolvedValue([message(1)]);
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    await waitFor(() => expect(dbMock.loadChannelMessages).toHaveBeenCalledTimes(1));
    dbMock.loadChannelMessages.mockClear();
    dbMock.channelHasUnreadMessages.mockClear();

    await emit("conversation_messages", {
      eventType: "INSERT",
      new: {
        id: "f-1",
        conversation_id: "founding",
        sender_id: "other",
        body: "other group",
        created_at: "2026-09-05T12:00:00.000Z",
      },
    });

    expect(dbMock.loadChannelMessages).not.toHaveBeenCalled();
    expect(dbMock.channelHasUnreadMessages).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Unread group messages")).toBeTruthy();
  });

  it("subscribes once and keeps the subscription across a pill switch", async () => {
    const { supabase } = await import("../lib/supabase");
    render(<MessagesPanel userId="mama-1" />);
    await waitFor(() => screen.getByRole("button", { name: "August Group" }));
    const subscriptions = supabase.channel.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));
    fireEvent.click(screen.getByRole("button", { name: "Founding Members" }));
    fireEvent.click(screen.getByRole("button", { name: "Callie" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Callie" })).toBeTruthy());

    // Re-subscribing per switch dropped events during the handshake.
    expect(supabase.channel.mock.calls.length).toBe(subscriptions);
  });
});
