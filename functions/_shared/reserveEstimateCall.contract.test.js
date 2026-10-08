import { describe, expect, it } from "vitest";

/**
 * In-memory stand-in for public.reserve_estimate_call.
 * Keep the steps in lockstep with 20261008091000_estimate_calls_reserve.sql.
 */
function reserveEstimateCall(rows, { profileId, type, max, requestId = null, now = new Date() } = {}) {
  if (!profileId || !type || max == null || max < 1) return false;
  const ticket = String(requestId || "").trim() || null;
  const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (ticket) {
    const eligible = rows.find((row) => (
      row.request_id === ticket
      && row.profile_id === profileId
      && row.type === type
      && row.created_at >= twoMinAgo
      && row.retried_at == null
    ));
    if (eligible) {
      eligible.retried_at = now;
      return true;
    }
    if (rows.some((row) => row.request_id === ticket)) return false;
  }

  const used = rows.filter((row) => (
    row.profile_id === profileId
    && row.type === type
    && row.created_at >= dayAgo
  )).length;
  if (used >= max) return false;

  if (ticket && rows.some((row) => row.request_id === ticket)) return false;
  rows.push({
    profile_id: profileId,
    type,
    request_id: ticket,
    created_at: now,
    retried_at: null,
  });
  return true;
}

describe("reserve_estimate_call contract", () => {
  const mama = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-10-08T12:00:00.000Z");

  it("allows the same requestId twice, then refuses the third", () => {
    const rows = [];
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now })).toBe(true);
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now })).toBe(true);
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now })).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].retried_at).toEqual(now);
  });

  it("refuses another mama's requestId and does not insert a second row", () => {
    const rows = [];
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now })).toBe(true);
    expect(reserveEstimateCall(rows, { profileId: other, type: "coach", max: 30, requestId: "ask-1", now })).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBe(mama);
  });

  it("refuses the same id after two minutes", () => {
    const rows = [];
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now })).toBe(true);
    const later = new Date(now.getTime() + 2 * 60 * 1000 + 1);
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-1", now: later })).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("still enforces the cap on a new request", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      profile_id: mama,
      type: "coach",
      request_id: `spent-${i}`,
      created_at: now,
      retried_at: null,
    }));
    expect(reserveEstimateCall(rows, { profileId: mama, type: "coach", max: 30, requestId: "ask-new", now })).toBe(false);
    expect(rows).toHaveLength(30);
  });
});
