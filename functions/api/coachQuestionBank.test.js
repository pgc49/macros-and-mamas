/**
 * Five-setup question-bank harness. Seeded until R&D's 52 typed questions land.
 * A meal question passes only on 200 + a named plate + a saved reply.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const openrouter = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  logAiFailure: vi.fn(),
  messageForKind: vi.fn(() => "Try again in a minute."),
  parseJsonLoose: vi.fn(),
  resolveModels: vi.fn(() => ["google/gemini-3.1-flash-lite"]),
  resolveCoachModels: vi.fn(() => ["google/gemini-3.5-flash"]),
}));

vi.mock("../_shared/openrouter.js", () => openrouter);

import { onRequestPost } from "./coach.js";
import {
  COACH_MODEL_SHAPES,
  COACH_QUESTION_BANK,
  COACH_QUESTION_BANK_SETUPS,
  carefulQuestionPasses,
  mealQuestionPasses,
} from "../_shared/coachQuestionBank.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const env = {
  OPENROUTER_API_KEY: "or-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
};

function request(body) {
  return new Request("https://app.macrosandmamas.com/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer mama-token" },
    body: JSON.stringify(body),
  });
}

function mockSetup(setup) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
    if (value.includes("select=paid,refunded,role")) {
      return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
    }
    if (value.includes("rpc/reserve_estimate_call")) return new Response(JSON.stringify(true), { status: 200 });
    if (value.includes("/rest/v1/profiles?id=eq.")) {
      return new Response(JSON.stringify([{ id: USER_ID, ...setup.profile }]), { status: 200 });
    }
    if (value.includes("/rest/v1/macros")) {
      if (!setup.macros && !setup.macrosRow) return new Response("[]", { status: 200 });
      return new Response(JSON.stringify([setup.macrosRow]), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  });
}

function applyShape(shape) {
  if (shape === "malformed") {
    openrouter.callOpenRouter.mockResolvedValue({ ok: true, text: "not json", model: "google/gemini-3.5-flash" });
    openrouter.parseJsonLoose.mockReturnValue({ ok: false, error: new Error("bad json") });
    return;
  }
  const value = COACH_MODEL_SHAPES[shape];
  openrouter.callOpenRouter.mockResolvedValue({
    ok: true,
    text: JSON.stringify(value),
    model: "google/gemini-3.5-flash",
  });
  openrouter.parseJsonLoose.mockReturnValue({ ok: true, value });
}

function coachPosts() {
  return globalThis.fetch.mock.calls
    .filter(([url, init]) => String(url).includes("coach_messages") && init?.method === "POST")
    .map(([, init]) => JSON.parse(init.body));
}

function shapesFor(question) {
  if (question.kind !== "meal") return ["good"];
  return ["good", "empty", "jargon", "malformed", "callie"];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  applyShape("good");
});

describe("coach question bank harness", () => {
  it.each(
    COACH_QUESTION_BANK.flatMap((question) => (
      COACH_QUESTION_BANK_SETUPS.flatMap((setup) => (
        shapesFor(question).map((shape) => [question.id, setup.id, shape, question, setup])
      ))
    )),
  )("%s × %s × %s", async (_qid, _sid, shape, question, setup) => {
    mockSetup(setup);
    applyShape(shape);
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: question.text,
        requestId: `bank-${question.id}-${setup.id}-${shape}`,
        context: setup.context,
      }),
      env,
    });
    const data = await resp.json();
    const posts = coachPosts();

    if (question.kind === "crisis") {
      expect(resp.status).toBe(200);
      expect(data.deflect).toBe("emergency");
      expect(data.meals || []).toEqual([]);
      return;
    }

    if (question.kind === "careful") {
      const result = carefulQuestionPasses(data, question);
      expect(result, JSON.stringify({ result, data })).toEqual({ ok: true });
      expect(posts.length).toBeGreaterThan(0);
      return;
    }

    const result = mealQuestionPasses(resp, data, posts);
    expect(result, JSON.stringify({ result, status: resp.status, data })).toEqual({ ok: true });
  });
});
