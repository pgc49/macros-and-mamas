// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { dbMock, realtimeChannel, profileQuery } = vi.hoisted(() => {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { role: "client" } })),
  };
  return {
    realtimeChannel: channel,
    profileQuery: query,
    dbMock: {
      loadMessages: vi.fn(async () => []),
      listMyChannels: vi.fn(async () => []),
      loadChannelMessages: vi.fn(async () => []),
      channelHasUnread: vi.fn(() => false),
      markMessagesRead: vi.fn(async () => {}),
      markChannelRead: vi.fn(async () => ({ last_read_at: "2026-09-04T12:00:00Z" })),
      sendMessage: vi.fn(),
      sendChannelMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editChannelMessage: vi.fn(),
      deleteChannelMessage: vi.fn(),
      toggleDmReaction: vi.fn(),
      toggleChannelReaction: vi.fn(),
      savePushSubscription: vi.fn(),
      updateChannelNotifyLevel: vi.fn(),
    },
  };
});

vi.mock("../db/db", () => ({
  db: dbMock,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => profileQuery),
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

import { MessagesPanel } from "./MessagesPanel";

function channelItem({
  id,
  label,
  guidelines = "What’s shared here stays here.",
  notifyLevel = "highlights",
} = {}) {
  return {
    conversation: {
      id,
      label,
      guidelines,
      read_only: false,
    },
    membership: {
      notify_level: notifyLevel,
      last_read_at: "2026-09-01T00:00:00Z",
    },
    messages: [],
    hasUnread: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  profileQuery.maybeSingle.mockResolvedValue({ data: { role: "client" } });
  dbMock.loadMessages.mockResolvedValue([]);
  dbMock.listMyChannels.mockResolvedValue([
    channelItem({ id: "aug", label: "August Group" }),
  ]);
  dbMock.loadChannelMessages.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("MessagesPanel chrome", () => {
  it("drops the Messages title and keeps Callie plus groups on one toolbar", async () => {
    render(<MessagesPanel userId="mama-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "August Group" })).toBeTruthy();
    });

    expect(screen.queryByRole("heading", { name: "Messages" })).toBeNull();
    expect(screen.queryByText("Your cohort — what’s shared here stays here.")).toBeNull();
    expect(screen.queryByText("Private chat with Callie — stays in the app")).toBeNull();

    const toolbar = document.querySelector("[data-messages-toolbar]");
    const pills = document.querySelector("[data-messages-pills]");
    expect(toolbar).toBeTruthy();
    expect(pills).toBeTruthy();
    expect(pills.contains(screen.getByRole("button", { name: "Callie" }))).toBe(true);
    expect(pills.contains(screen.getByRole("button", { name: "August Group" }))).toBe(true);
    expect(document.querySelector("[data-messages-channel-actions]")).toBeNull();
  });

  it("keeps group actions on the same toolbar line and expands guidelines on tap", async () => {
    render(<MessagesPanel userId="mama-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "August Group" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));

    await waitFor(() => {
      expect(document.querySelector("[data-messages-channel-actions]")).toBeTruthy();
    });

    const toolbar = document.querySelector("[data-messages-toolbar]");
    const actions = document.querySelector("[data-messages-channel-actions]");
    expect(toolbar.contains(actions)).toBe(true);
    expect(screen.getByRole("button", { name: "Guidelines" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notifications: Highlights" })).toBeTruthy();
    expect(document.querySelector("[data-messages-guidelines]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guidelines" }));
    expect(screen.getByText("What’s shared here stays here.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Callie" }));
    expect(document.querySelector("[data-messages-channel-actions]")).toBeNull();
    expect(document.querySelector("[data-messages-guidelines]")).toBeNull();
  });

  it("scrolls conversation pills when an admin sees more than one group", async () => {
    dbMock.listMyChannels.mockResolvedValue([
      channelItem({ id: "aug", label: "August Group" }),
      channelItem({ id: "founding", label: "Founding Members" }),
    ]);

    render(<MessagesPanel userId="admin-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Founding Members" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "August Group" }));

    const pills = document.querySelector("[data-messages-pills]");
    expect(pills.style.overflowX).toBe("auto");
    expect(pills.contains(screen.getByRole("button", { name: "Callie" }))).toBe(true);
    expect(pills.contains(screen.getByRole("button", { name: "August Group" }))).toBe(true);
    expect(pills.contains(screen.getByRole("button", { name: "Founding Members" }))).toBe(true);
    expect(document.querySelector("[data-messages-channel-actions]")).toBeTruthy();
  });
});
