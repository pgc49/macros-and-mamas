// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { MessagesThread } from "./MessagesThread";
import { MessagingRuntimeBanner } from "./MessagingRuntimeBanner";

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Thrower({ active = true }) {
  if (active) throw new Error("intentional render failure");
  return <div>Recovered thread</div>;
}

function message(id, minute = 0) {
  return {
    id,
    sender_id: "mama-1",
    body: `Message ${id}`,
    created_at: `2026-08-10T10:${String(minute).padStart(2, "0")}:00.000Z`,
    reactions: [],
  };
}

function threadProps(overrides = {}) {
  return {
    title: "",
    subtitle: "",
    messages: [],
    selfId: "admin-1",
    peerName: "Mama",
    showPushPrompt: false,
    onSend: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReact: vi.fn(),
    onMarkRead: vi.fn(),
    ...overrides,
  };
}

describe("messaging crash containment", () => {
  it("recovers locally when Retry is tapped", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let throwing = true;
    function RetryThrower() {
      if (throwing) throw new Error("intentional transient failure");
      return <div>Recovered thread</div>;
    }
    render(
      <ErrorBoundary
        name="test"
        resetKeys={["thread-a"]}
        onReset={() => { throwing = false; }}
      >
        <RetryThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This section couldn’t load")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered thread")).toBeTruthy();
  });

  it("resets a latched boundary when the thread key changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(
      <ErrorBoundary name="test" resetKeys={["thread-a"]}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText("This section couldn’t load")).toBeTruthy();

    view.rerender(
      <ErrorBoundary name="test" resetKeys={["thread-b"]}>
        <Thrower active={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Recovered thread")).toBeTruthy();
  });

  it("renders malformed rows without blanking the thread", () => {
    render(
      <MessagesThread
        {...threadProps({
          messages: [
            null,
            {
              id: "bad-row",
              sender_id: 42,
              body: { unexpected: true },
              attachment_mime: 99,
              reactions: "broken",
              created_at: "not-a-date",
            },
            message("valid", 1),
          ],
        })}
      />,
    );
    expect(screen.getByText("Message valid")).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a message…")).toBeTruthy();
  });

  it("hides attachment controls and explains runtime maintenance", () => {
    render(
      <>
        <MessagingRuntimeBanner runtime={{
          mode: "read_only",
          attachmentsEnabled: false,
          notificationsEnabled: false,
          reason: "Maintenance test",
        }}
        />
        <MessagesThread
          {...threadProps({
            messages: [{
              id: "paused-message",
              sender_id: "admin-1",
              body: "Paused mutation",
              created_at: "2026-08-11T00:00:00Z",
              reactions: [],
            }],
          })}
          allowAttachments={false}
          allowMutations={false}
          allowVoiceMemo
        />
      </>,
    );
    expect(screen.getByText("Messages are read-only right now")).toBeTruthy();
    expect(screen.getByText(/Maintenance test/)).toBeTruthy();
    expect(screen.queryByLabelText("Attach photo or PDF")).toBeNull();
    expect(screen.queryByLabelText("Record voice memo")).toBeNull();
    fireEvent.contextMenu(screen.getByText("Paused mutation").closest("[data-msg-id]"));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "React with ❤️" })).toBeNull();
  });

  it("marks read when the latest ID changes at a capped window size", async () => {
    const onMarkRead = vi.fn();
    const firstWindow = Array.from({ length: 100 }, (_, i) => message(`m-${i}`, i % 60));
    const view = render(
      <MessagesThread {...threadProps({ messages: firstWindow, onMarkRead })} />,
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(1));

    const nextWindow = [...firstWindow.slice(1), message("m-100", 59)];
    view.rerender(
      <MessagesThread {...threadProps({ messages: nextWindow, onMarkRead })} />,
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2));
  });

  it("keeps writable composer in a bounded thread when history loads", () => {
    const view = render(<MessagesThread {...threadProps()} />);
    const thread = view.container.querySelector("[data-messages-thread]");
    const list = view.container.querySelector("[data-message-list]");
    const composer = view.container.querySelector("[data-message-composer]");
    const input = screen.getByPlaceholderText("Write a message…");

    expect(input).toBeTruthy();
    expect(thread.style.minHeight).toBe("0px");
    expect(thread.style.overflow).toBe("hidden");
    expect(thread.style.paddingBottom).toBe("4px");
    expect(list.style.minHeight).toBe("0px");
    expect(list.style.maxHeight).toBe("none");
    expect(composer.style.flexShrink).toBe("0");
    expect(input.style.outline).toBe("none");

    view.rerender(
      <MessagesThread
        {...threadProps({
          messages: Array.from({ length: 80 }, (_, i) => message(`loaded-${i}`, i % 60)),
        })}
      />,
    );

    expect(screen.getByPlaceholderText("Write a message…")).toBeTruthy();
    expect(view.container.querySelector("[data-messages-thread]").style.overflow).toBe("hidden");
    expect(view.container.querySelector("[data-messages-thread]").style.paddingBottom).toBe("4px");
    expect(view.container.querySelector("[data-message-list]").style.minHeight).toBe("0px");
    expect(view.container.querySelector("[data-message-composer]").style.flexShrink).toBe("0");
  });

  it("contains synchronous mark-read failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <MessagesThread
        {...threadProps({
          messages: [message("one", 1)],
          onMarkRead: () => { throw new Error("read failed"); },
        })}
      />,
    );
    await waitFor(() => expect(warn).toHaveBeenCalledWith(
      "mark messages read failed",
      expect.any(Error),
    ));
    expect(screen.getByText("Message one")).toBeTruthy();
  });

  it("reuses one idempotency key when an ambiguous send is retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSend = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({});
    render(<MessagesThread {...threadProps({ onSend })} />);

    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Send once" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await screen.findByDisplayValue("Send once");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    const firstKey = onSend.mock.calls[0][2].clientMessageId;
    const secondKey = onSend.mock.calls[1][2].clientMessageId;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toBe(firstKey);
  });

  it("keeps an ambiguous send key across remounts but changes it for a new payload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const firstSend = vi.fn().mockRejectedValue(new Error("response lost"));
    const first = render(
      <MessagesThread
        {...threadProps({ onSend: firstSend })}
        threadKey="dm:mama-ambiguous"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Original payload" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(firstSend).toHaveBeenCalledTimes(1));
    const originalKey = firstSend.mock.calls[0][2].clientMessageId;
    first.unmount();

    const remountSend = vi.fn().mockRejectedValue(new Error("still ambiguous"));
    render(
      <MessagesThread
        {...threadProps({ onSend: remountSend })}
        threadKey="dm:mama-ambiguous"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Original payload" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(remountSend).toHaveBeenCalledTimes(1));
    expect(remountSend.mock.calls[0][2].clientMessageId).toBe(originalKey);

    await screen.findByDisplayValue("Original payload");
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Changed payload" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(remountSend).toHaveBeenCalledTimes(2));
    expect(remountSend.mock.calls[1][2].clientMessageId).not.toBe(originalKey);
  });

  it("shares an in-flight send across remounted thread instances", async () => {
    let settle;
    const pending = new Promise((resolve) => { settle = resolve; });
    const originalSend = vi.fn(() => pending);
    const first = render(
      <MessagesThread
        {...threadProps({ onSend: originalSend })}
        threadKey="dm:mama-in-flight"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "One operation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(originalSend).toHaveBeenCalledTimes(1));
    first.unmount();

    const remountSend = vi.fn();
    render(
      <MessagesThread
        {...threadProps({ onSend: remountSend })}
        threadKey="dm:mama-in-flight"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "One operation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(remountSend).not.toHaveBeenCalled();

    settle({});
    await waitFor(() => {
      expect(remountSend).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText("Write a message…").value).toBe("");
    });

    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "Next operation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(remountSend).toHaveBeenCalledTimes(1));
  });
});

