// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MessagesPanel } from "./MessagesPanel";

const { controls, dbMock, realtimeChannel } = vi.hoisted(() => {
  const controls = { resolveChannels: null };
  const dbMock = {
    loadMessages: vi.fn(async () => []),
    listMyChannels: vi.fn(() => new Promise((resolve) => { controls.resolveChannels = resolve; })),
    loadChannelMessages: vi.fn(async () => []),
    channelHasUnread: vi.fn(() => false),
    markMessagesRead: vi.fn(async () => {}),
    markChannelRead: vi.fn(async () => null),
    savePushSubscription: vi.fn(),
  };
  const realtimeChannel = {};
  realtimeChannel.on = vi.fn(() => realtimeChannel);
  realtimeChannel.subscribe = vi.fn(() => realtimeChannel);
  return { controls, dbMock, realtimeChannel };
});

vi.mock("../db/db", () => ({ db: dbMock }));
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { role: "client" } })),
        })),
      })),
    })),
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

beforeEach(() => {
  window.history.replaceState({}, "", "/app?tab=messages&channel=announcements");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("customer composer asynchronous channel selection", () => {
  it("does not flash a DM composer and consumes a read-only channel deep link", async () => {
    const first = render(<MessagesPanel userId="mama-1" />);

    expect(screen.queryByPlaceholderText("Write a message…")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading conversation");

    controls.resolveChannels([{
      conversation: {
        id: "announcements",
        label: "Announcements",
        read_only: true,
      },
      membership: { notify_level: "highlights" },
    }]);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Write a message…")).toBeNull();
      expect(window.location.search).toBe("?tab=messages");
    });

    first.unmount();
    render(<MessagesPanel userId="mama-1" />);
    expect(screen.getByPlaceholderText("Write a message…")).toBeTruthy();
  });
});
