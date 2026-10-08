import { describe, expect, it, vi } from "vitest";
import { insertCoachReply, sanitizeCoachReply } from "./coachMessages.js";

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
    expect(row.local_date).toBe("2026-10-08");
    expect(row.payload).toEqual({ cards: [], deflect: "again", aside: null });
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
    expect(body.kind).toBe("cards");
    fetchMock.mockRestore();
  });
});
