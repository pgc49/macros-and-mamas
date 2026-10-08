import { describe, expect, it, vi } from "vitest";
import { COACH_COPY } from "../../src/content/coachVoice.js";
import { teachBody } from "../../src/utils/coachTeach.js";
import {
  buildLocalCoachRecord,
  insertCoachReply,
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
    expect(row.payload).toEqual({ cards: [], deflect: "again", aside: null, teach: null });
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
    expect(cards[0]).toEqual({
      name: "Chicken bowl",
      cal: 430,
      p: 45,
      c: 30,
      f: 12,
      reason: "Fits.",
    });
    expect(cards[1].name).toBe("Yogurt");
    expect(cards[2].name).toBe("Fourth");
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
      source: "server",
    });
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

describe("insertCoachReply", () => {
  it("writes a coach-role row with the service role, never the mama JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
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
    expect(result).toEqual({ ok: true });
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
    expect(body.created_at).toBeUndefined();
    expect(body.seq).toBeUndefined();
    expect(body.hidden_at).toBeUndefined();
    fetchMock.mockRestore();
  });
});
