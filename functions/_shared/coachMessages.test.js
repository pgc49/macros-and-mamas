import { describe, expect, it, vi } from "vitest";
import { COACH_COPY } from "../../src/content/coachVoice.js";
import { teachBody } from "../../src/utils/coachTeach.js";
import {
  buildLocalCoachRecord,
  clampCoachRequestId,
  noteReserveRequestId,
  countPainTeachToday,
  insertCoachReply,
  isCoachRequestId,
  isStuckPainCount,
  mamaCoachInsertRow,
  mamaInsertPassesPolicy,
  painTeachCounts,
  replyLocalDate,
  sanitizeCoachCards,
  sanitizeCoachReply,
} from "./coachMessages.js";

describe("sanitizeCoachReply", () => {
  it("forces the coach role and drops unknown kinds to text", () => {
    const row = sanitizeCoachReply({
      body: "Tonight.",
      kind: "teach",
      payload: { deflect: "again", aside: null, cards: [] },
      localDate: "2026-10-08",
    });
    expect(row.role).toBe("coach");
    expect(row.kind).toBe("text");
    expect(row.source).toBe("server");
    expect(row.local_date).toBe("2026-10-08");
    expect(row.payload).toEqual({ cards: [], deflect: "again", aside: null, teach: null, requestId: null });
  });

  it("strips deflects from client-source rows", () => {
    const row = sanitizeCoachReply({
      body: "Forged.",
      kind: "deflect",
      payload: { deflect: "again", cards: [] },
      source: "client",
    });
    expect(row.source).toBe("client");
    expect(row.payload).toBeNull();
  });
});

describe("sanitizeCoachCards", () => {
  it("keeps string names, numeric macros, and a max of four cards", () => {
    const cards = sanitizeCoachCards([
      { name: "Chicken bowl", cal: "430.2", p: 45, c: 30, f: 12, reason: "Fits." },
      { title: "Yogurt", cal: 180, p: 20, c: 18, f: 4 },
      { name: { bad: true }, cal: 1 },
      { name: "Fourth", cal: 1, p: 1, c: 1, f: 1 },
      { name: "Dropped", cal: 1, p: 1, c: 1, f: 1 },
    ]);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      name: "Chicken bowl",
      title: "Chicken bowl",
      cal: 430,
      p: 45,
      c: 30,
      f: 12,
      reason: "Fits.",
      servings: 1,
    });
    expect(cards[1].name).toBe("Yogurt");
    expect(cards[1].title).toBe("Yogurt");
    expect(cards[2].name).toBe("Fourth");
  });

  it("keeps title, source, tag, id, basedOn, and servings through a save", () => {
    const cards = sanitizeCoachCards([{
      id: "live-1",
      name: "Halibut + rice",
      title: "Halibut + rice · 2 servings",
      source: "bank",
      tag: COACH_COPY.sourceBank,
      basedOn: "Halibut + rice",
      servings: 2,
      cal: 910,
      p: 88,
      c: 100,
      f: 14,
      reason: "Fits tonight.",
    }]);
    expect(cards).toEqual([{
      id: "live-1",
      name: "Halibut + rice",
      title: "Halibut + rice · 2 servings",
      source: "bank",
      tag: COACH_COPY.sourceBank,
      basedOn: "Halibut + rice",
      fromSaved: false,
      hideMacros: false,
      servings: 2,
      cal: 910,
      p: 88,
      c: 100,
      f: 14,
      reason: "Fits tonight.",
    }]);
  });
});

describe("buildLocalCoachRecord", () => {
  it("rejects arbitrary coach content", () => {
    expect(buildLocalCoachRecord({
      body: "I am Coach",
      kind: "deflect",
      payload: { deflect: "again" },
    })).toBeNull();
  });

  it("rebuilds a teach from the topic and ignores the client body", () => {
    const row = buildLocalCoachRecord({
      template: "local.teach",
      topic: "neverSkip",
      body: "forged coach line",
    });
    expect(row).toEqual({
      body: teachBody("neverSkip"),
      kind: "text",
      payload: { teach: "neverSkip" },
      source: "client",
    });
  });

  it("rebuilds real food without the log-ahead sentence in no-logging mode", () => {
    const row = buildLocalCoachRecord({
      template: "local.teach",
      topic: "realFood",
      payload: { notLogging: true },
    });
    expect(row.body).toBe(teachBody("realFood", { notLogging: true }));
    expect(row.body).not.toMatch(/log it ahead/);
    expect(row.payload).toEqual({ teach: "realFood", notLogging: true });
  });

  it("rebuilds noneFit from Callie's copy", () => {
    const row = buildLocalCoachRecord({ template: "local.noneFit", body: "forged" });
    expect(row.body).toBe(COACH_COPY.noneFit);
    expect(row.source).toBe("server");
  });

  it("marks local cards as client after validating shape", () => {
    const row = buildLocalCoachRecord({
      template: "local.cards",
      body: "Tonight.",
      payload: { cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }], deflect: "again" },
    });
    expect(row.source).toBe("client");
    expect(row.kind).toBe("cards");
    expect(row.payload.cards).toHaveLength(1);
    expect(row.payload.deflect).toBeUndefined();
  });
});

describe("clampCoachRequestId", () => {
  it("keeps a uuid or an 8–64 letter-digit-hyphen ticket and mints anything else", () => {
    expect(isCoachRequestId("ask-0001")).toBe(true);
    expect(isCoachRequestId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isCoachRequestId("ask-1")).toBe(false);
    expect(isCoachRequestId("too short")).toBe(false);
    expect(isCoachRequestId("../etc/passwd")).toBe(false);
    expect(isCoachRequestId("x".repeat(65))).toBe(false);
    expect(clampCoachRequestId("ask-0001")).toBe("ask-0001");
    const minted = clampCoachRequestId("ask-1");
    expect(minted).not.toBe("ask-1");
    expect(isCoachRequestId(minted)).toBe(true);
    expect(noteReserveRequestId("ask-0001")).toBe("ask-0001-note");
    expect(noteReserveRequestId("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111-note",
    );
    expect(noteReserveRequestId("x".repeat(64))).toBe(`${"x".repeat(59)}-note`);
    expect(isCoachRequestId(noteReserveRequestId("x".repeat(64)))).toBe(true);
    expect(noteReserveRequestId("ask-1")).toBe("");
  });

  it("drops an invalid payload requestId instead of storing it", () => {
    const row = sanitizeCoachReply({
      body: "Tonight.",
      payload: { requestId: "ask-1<script>", teach: "italian" },
    });
    expect(row.payload.requestId).toBeNull();
    expect(row.payload.teach).toBe("italian");
    const kept = sanitizeCoachReply({
      body: "Tonight.",
      payload: { requestId: "ask-retry-01" },
    });
    expect(kept.payload.requestId).toBe("ask-retry-01");
  });
});

describe("mama insert contract", () => {
  it("builds the exact db.js body and the policy accepts it", () => {
    const body = mamaCoachInsertRow({
      profileId: "00000000-0000-4000-8000-000000000010",
      body: "what should I eat",
      kind: "text",
      localDate: "2026-10-08",
      requestId: "ask-live01",
    });
    expect(body).toEqual({
      profile_id: "00000000-0000-4000-8000-000000000010",
      role: "mama",
      body: "what should I eat",
      kind: "text",
      payload: null,
      local_date: "2026-10-08",
      request_id: "ask-live01",
    });
    expect(mamaInsertPassesPolicy(body)).toBe(true);
    expect(mamaInsertPassesPolicy({
      ...body,
      payload: { requestId: "ask-live01" },
    })).toBe(false);
    expect(mamaInsertPassesPolicy({
      ...body,
      request_id: "ask-1",
    })).toBe(false);
  });
});

describe("countPainTeachToday", () => {
  it("pins Stuck from two server asks, never from recorded client teaches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { source: "server", payload: { teach: "neverSkip" } },
      { source: "client", payload: { teach: "neverSkip" } },
      { source: "server", payload: { teach: "neverSkip" } },
    ]), { status: 200 }));
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    };
    const count = await countPainTeachToday(env, "mama-1", "neverSkip", new Date("2026-10-08T18:00:00.000Z"));
    expect(count).toEqual({ server: 2, client: 1, total: 3 });
    expect(isStuckPainCount(count)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("source=eq.server");
    expect(isStuckPainCount(painTeachCounts([
      { source: "server", payload: { teach: "neverSkip" } },
      { source: "client", payload: { teach: "neverSkip" } },
    ], "neverSkip"))).toBe(false);
    expect(isStuckPainCount(painTeachCounts([
      { source: "client", payload: { teach: "neverSkip" } },
      { source: "client", payload: { teach: "neverSkip" } },
    ], "neverSkip"))).toBe(false);
    fetchMock.mockRestore();
  });
});

describe("replyLocalDate", () => {
  it("keeps a valid day and otherwise uses the Pacific calendar day", () => {
    expect(replyLocalDate({ localDate: "2026-10-08" })).toBe("2026-10-08");
    expect(replyLocalDate({}, new Date("2026-10-02T01:05:00.000Z"))).toBe("2026-10-01");
  });
});

describe("insertCoachReply", () => {
  it("writes a coach-role row with the service role, never the mama JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ id: "row-1" }]), { status: 201 }));
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    };
    const result = await insertCoachReply(env, "mama-1", {
      body: "Chicken bowl.",
      kind: "cards",
      payload: { cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, reason: "Fits." }] },
      localDate: "2026-10-08",
      source: "server",
    });
    expect(result).toEqual({ ok: true, id: "row-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rest/v1/coach_messages");
    expect(init.headers.authorization).toBe("Bearer service-key");
    expect(init.headers.apikey).toBe("service-key");
    const body = JSON.parse(init.body);
    expect(body.profile_id).toBe("mama-1");
    expect(body.role).toBe("coach");
    expect(body.source).toBe("server");
    expect(body.kind).toBe("cards");
    expect(body.request_id).toBeNull();
    expect(body.created_at).toBeUndefined();
    expect(body.seq).toBeUndefined();
    expect(body.hidden_at).toBeUndefined();
    fetchMock.mockRestore();
  });
});
