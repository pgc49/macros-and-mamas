import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, supabaseMock } = vi.hoisted(() => {
  const state = {
    /** table name → resolved PostgREST response */
    results: {},
    /** every recorded query: { table, calls: [[method, ...args]] } */
    queries: [],
    /** every storage batch: { bucket, paths, ttlSeconds } */
    signBatches: [],
    signResult: null,
    signError: null,
  };

  function query(table) {
    const record = { table, calls: [] };
    state.queries.push(record);
    const settle = () => Promise.resolve(
      state.results[table] ?? { data: [], error: null },
    );
    const q = {};
    for (const name of ["select", "eq", "neq", "is", "in", "or", "lt", "gt", "order", "limit"]) {
      q[name] = (...args) => {
        record.calls.push([name, ...args]);
        return q;
      };
    }
    q.maybeSingle = (...args) => {
      record.calls.push(["maybeSingle", ...args]);
      return settle();
    };
    // Supabase filter builders are awaited directly, so the recorder has to be
    // thenable rather than exposing an explicit execute step.
    q.then = (onOk, onErr) => settle().then(onOk, onErr);
    return q;
  }

  return {
    state,
    supabaseMock: {
      from: vi.fn((table) => query(table)),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "me" } }, error: null })),
      },
      storage: {
        from: vi.fn((bucket) => ({
          createSignedUrls: vi.fn(async (paths, ttlSeconds) => {
            state.signBatches.push({ bucket, paths, ttlSeconds });
            if (state.signError) return { data: null, error: state.signError };
            if (state.signResult) return { data: state.signResult, error: null };
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://cdn/${path}?sig=${state.signBatches.length}` })),
              error: null,
            };
          }),
        })),
      },
    },
  };
});

vi.mock("../lib/supabase", () => ({ supabase: supabaseMock }));

import { resetAttachmentUrlCache } from "../lib/attachmentUrls";
import { MESSAGE_PAGE_SIZE, db } from "./db.js";

function queriesFor(table) {
  return state.queries.filter((q) => q.table === table);
}

function argsOf(record, method) {
  return record.calls.filter(([name]) => name === method).map((call) => call.slice(1));
}

function channelRow(id, extra = {}) {
  return {
    id,
    conversation_id: "aug",
    sender_id: "mama-1",
    body: `msg ${id}`,
    created_at: `2026-08-0${id}T00:00:00.000Z`,
    deleted_at: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.results = {};
  state.queries = [];
  state.signBatches = [];
  state.signResult = null;
  state.signError = null;
  resetAttachmentUrlCache();
});

describe("thread windows", () => {
  it("opens a group channel on a page rather than the whole backlog", async () => {
    state.results.conversation_messages = { data: [channelRow("1")], error: null };

    await db.loadChannelMessages("aug");

    const [record] = queriesFor("conversation_messages");
    expect(argsOf(record, "limit")).toEqual([[MESSAGE_PAGE_SIZE]]);
    expect(argsOf(record, "eq")).toEqual([["conversation_id", "aug"]]);
    // Newest-first fetch, then flipped to chat order for display.
    expect(argsOf(record, "order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("opens a DM thread on the same page size", async () => {
    state.results.messages = { data: [], error: null };

    await db.loadMessages("mama-1");

    const [record] = queriesFor("messages");
    expect(argsOf(record, "limit")).toEqual([[MESSAGE_PAGE_SIZE]]);
  });

  it("caps an oversized limit instead of trusting the caller", async () => {
    state.results.conversation_messages = { data: [], error: null };

    await db.loadChannelMessages("aug", { limit: 100_000 });

    expect(argsOf(queriesFor("conversation_messages")[0], "limit")).toEqual([[200]]);
  });

  it("falls back to the default page size for a nonsense limit", async () => {
    state.results.conversation_messages = { data: [], error: null };

    await db.loadChannelMessages("aug", { limit: 0 });

    expect(argsOf(queriesFor("conversation_messages")[0], "limit")).toEqual([[MESSAGE_PAGE_SIZE]]);
  });

  it("pages back with a keyset cursor so a live group cannot shift the window", async () => {
    state.results.conversation_messages = { data: [], error: null };

    await db.loadChannelMessages("aug", {
      before: { created_at: "2026-08-02T00:00:00.123456Z", id: "m-2" },
    });

    const [[filter]] = argsOf(queriesFor("conversation_messages")[0], "or");
    // Quoted values keep a fractional-second timestamp out of PostgREST's
    // column.operator.value parsing.
    expect(filter).toBe(
      'created_at.lt."2026-08-02T00:00:00.123456Z",and(created_at.eq."2026-08-02T00:00:00.123456Z",id.lt."m-2")',
    );
  });

  it("pages a DM thread back with the same cursor", async () => {
    state.results.messages = { data: [], error: null };

    await db.loadMessages("mama-1", { before: { created_at: "2026-08-02T00:00:00Z", id: "m-2" } });

    expect(argsOf(queriesFor("messages")[0], "or")).toHaveLength(1);
  });

  it("falls back to a plain timestamp filter when the cursor has no id", async () => {
    state.results.conversation_messages = { data: [], error: null };

    await db.loadChannelMessages("aug", { before: { created_at: "2026-08-02T00:00:00Z" } });

    const record = queriesFor("conversation_messages")[0];
    expect(argsOf(record, "or")).toEqual([]);
    expect(argsOf(record, "lt")).toEqual([["created_at", "2026-08-02T00:00:00Z"]]);
  });

  it("does not filter at all without a cursor", async () => {
    state.results.conversation_messages = { data: [], error: null };

    await db.loadChannelMessages("aug");

    const record = queriesFor("conversation_messages")[0];
    expect(argsOf(record, "or")).toEqual([]);
    expect(argsOf(record, "lt")).toEqual([]);
  });

  it("returns nothing for a missing thread id without querying", async () => {
    expect(await db.loadChannelMessages(null)).toEqual([]);
    expect(await db.loadMessages(null)).toEqual([]);
    expect(state.queries).toEqual([]);
  });
});

describe("attachment signing", () => {
  it("signs a whole window in one request instead of one per attachment", async () => {
    state.results.conversation_messages = {
      data: [
        channelRow("1", { attachment_path: "aug/a.jpg" }),
        channelRow("2", { attachment_path: "aug/b.jpg" }),
        channelRow("3", { attachment_path: "aug/c.jpg" }),
        channelRow("4"),
      ],
      error: null,
    };

    const messages = await db.loadChannelMessages("aug");

    expect(state.signBatches).toHaveLength(1);
    expect(state.signBatches[0]).toMatchObject({
      bucket: "channel-attachments",
      paths: ["aug/a.jpg", "aug/b.jpg", "aug/c.jpg"],
    });
    expect(messages.map((m) => m.attachmentUrl)).toEqual([
      "https://cdn/aug/a.jpg?sig=1",
      "https://cdn/aug/b.jpg?sig=1",
      "https://cdn/aug/c.jpg?sig=1",
      undefined,
    ]);
  });

  it("hands back the same URL on a refresh so images are not remounted", async () => {
    state.results.conversation_messages = {
      data: [channelRow("1", { attachment_path: "aug/a.jpg" })],
      error: null,
    };

    const first = await db.loadChannelMessages("aug");
    const second = await db.loadChannelMessages("aug");

    // A changed URL drops the decoded frame, collapses the bubble to zero
    // height, and jumps the list — the reported scroll bounce.
    expect(second[0].attachmentUrl).toBe(first[0].attachmentUrl);
    expect(state.signBatches).toHaveLength(1);
  });

  it("keeps DM and channel buckets apart", async () => {
    state.results.messages = {
      data: [{
        id: "d1",
        client_id: "mama-1",
        sender_id: "mama-1",
        body: "hi",
        created_at: "2026-08-01T00:00:00Z",
        attachment_path: "dm/a.jpg",
      }],
      error: null,
    };

    await db.loadMessages("mama-1");

    expect(state.signBatches[0].bucket).toBe("message-attachments");
  });

  it("keeps rendering a thread when signing fails", async () => {
    state.signError = { message: "storage unavailable" };
    state.results.conversation_messages = {
      data: [channelRow("1", { attachment_path: "aug/a.jpg" })],
      error: null,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const messages = await db.loadChannelMessages("aug");

    expect(messages).toHaveLength(1);
    expect(messages[0].attachmentUrl).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips storage entirely for a window with no attachments", async () => {
    state.results.conversation_messages = { data: [channelRow("1")], error: null };

    await db.loadChannelMessages("aug");

    expect(state.signBatches).toEqual([]);
  });
});

describe("channelHasUnreadMessages", () => {
  it("asks for a single row newer than the reader's last read", async () => {
    state.results.conversation_messages = { data: [{ id: "m-9" }], error: null };

    const unread = await db.channelHasUnreadMessages("aug", {
      user_id: "mama-1",
      last_read_at: "2026-08-02T00:00:00Z",
    });

    expect(unread).toBe(true);
    const record = queriesFor("conversation_messages")[0];
    expect(argsOf(record, "limit")).toEqual([[1]]);
    expect(argsOf(record, "gt")).toEqual([["created_at", "2026-08-02T00:00:00Z"]]);
    expect(argsOf(record, "neq")).toEqual([["sender_id", "mama-1"]]);
    expect(argsOf(record, "is")).toEqual([["deleted_at", null]]);
  });

  it("reports no unread when the query comes back empty", async () => {
    state.results.conversation_messages = { data: [], error: null };

    expect(await db.channelHasUnreadMessages("aug", { user_id: "mama-1" })).toBe(false);
  });

  it("treats a never-read membership as having no timestamp filter", async () => {
    state.results.conversation_messages = { data: [{ id: "m-1" }], error: null };

    await db.channelHasUnreadMessages("aug", { user_id: "mama-1", last_read_at: null });

    expect(argsOf(queriesFor("conversation_messages")[0], "gt")).toEqual([]);
  });

  it("stays quiet instead of throwing when the check fails", async () => {
    state.results.conversation_messages = { data: null, error: { message: "nope" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await db.channelHasUnreadMessages("aug", { user_id: "mama-1" })).toBe(false);
    warn.mockRestore();
  });

  it("does not query without a conversation or a membership", async () => {
    expect(await db.channelHasUnreadMessages(null, { user_id: "mama-1" })).toBe(false);
    expect(await db.channelHasUnreadMessages("aug", null)).toBe(false);
    expect(state.queries).toEqual([]);
  });
});
