/**
 * 52 questions × 5 setups = 260 cases. Mocked model. Checks routing,
 * 200 + a named plate, saved request_id, constraints, last-plate
 * exclusion, follow-up context, and fallbacks on empty/jargon/malformed.
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

import { classifyAsk, isCrisisUrgent, isMealAsk } from "../_shared/coachGuardrails.js";
import { onRequestPost } from "./coach.js";
import { COACH_FINE_TUNING_LINE, COACH_LIMIT_FOOD } from "../../src/content/coachVoice.js";
import {
  bankContextFor,
  COACH_BANK_LAST_PLATE,
  COACH_BANK_PREVIOUS_PLATE,
  COACH_BANK_SHAPE_BY_SETUP,
  COACH_MODEL_SHAPES,
  COACH_QUESTION_BANK,
  COACH_QUESTION_BANK_SETUPS,
  carefulQuestionPasses,
  deadEndPathPasses,
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

function mockSetup(setup, { callsUsed = 0, noRanges = false } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
    if (value.includes("select=paid,refunded,role")) {
      return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
    }
    if (value.includes("rpc/reserve_estimate_call")) {
      const body = JSON.parse(init?.body || "{}");
      if (body.p_type === "coach_note" || body.p_type === "coach_over_cap") {
        return new Response(JSON.stringify(true), { status: 200 });
      }
      return new Response(JSON.stringify(callsUsed < 30), { status: 200 });
    }
    if (value.includes("/rest/v1/profiles?id=eq.")) {
      return new Response(JSON.stringify([{ id: USER_ID, ...setup.profile }]), { status: 200 });
    }
    if (value.includes("/rest/v1/macros")) {
      if (/[?&]order=/.test(value) && /created_at|\bid\b/.test(value)) {
        return new Response(JSON.stringify({ code: "42703", message: "column macros.created_at does not exist" }), { status: 400 });
      }
      if (noRanges || (!setup.macros && !setup.macrosRow)) return new Response("[]", { status: 200 });
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

function summaryPosts() {
  return globalThis.fetch.mock.calls
    .filter(([url, init]) => (
      (String(url).includes("client_summaries") || String(url).includes("append_coach_refusal_line"))
      && init?.method === "POST"
    ))
    .map(([, init]) => JSON.parse(init.body || "{}"));
}

function promptText() {
  const call = openrouter.callOpenRouter.mock.calls[0];
  if (!call) return "";
  const messages = call[0]?.messages || [];
  return messages.map((row) => (
    typeof row.content === "string" ? row.content : JSON.stringify(row.content)
  )).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  applyShape("good");
});

describe("R&D question bank v1", () => {
  it("has 49 meal questions and 3 careful ones", () => {
    expect(COACH_QUESTION_BANK).toHaveLength(52);
    expect(COACH_QUESTION_BANK.filter((row) => row.kind === "meal")).toHaveLength(49);
    expect(COACH_QUESTION_BANK.filter((row) => row.kind === "careful")).toHaveLength(3);
    expect(COACH_QUESTION_BANK_SETUPS.map((row) => row.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(COACH_QUESTION_BANK.find((row) => row.id === 3).text).toContain("lol");
  });

  it.each(
    COACH_QUESTION_BANK.flatMap((question) => (
      COACH_QUESTION_BANK_SETUPS.map((setup) => [question.id, setup.id, question, setup])
    )),
  )("q%s × %s", async (_qid, _sid, question, setup) => {
    const shape = COACH_BANK_SHAPE_BY_SETUP[setup.id];
    mockSetup(setup);
    applyShape(shape);

    const classified = classifyAsk(question.text);
    if (question.kind === "meal") {
      expect(classified.scope, question.text).toBe("food");
      expect(isCrisisUrgent(question.text)).toBe(false);
      expect(isMealAsk(question.text)).toBe(true);
    } else {
      expect(["urgent", "supply"]).toContain(classified.scope);
    }

    const requestId = `bank-q${String(question.id).padStart(2, "0")}-${setup.id}`;
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: question.text,
        slot: setup.slot || "dinner",
        requestId,
        context: bankContextFor(question, setup),
      }),
      env,
    });
    const data = await resp.json();
    const posts = coachPosts();
    const summaries = summaryPosts();

    if (question.kind === "careful") {
      const result = carefulQuestionPasses(data, question, { posts, summaries });
      expect(result, JSON.stringify({ result, data, posts, summaries })).toEqual({ ok: true });
      expect(posts[0].request_id || posts[0].payload?.requestId).toBeTruthy();
      return;
    }

    const result = mealQuestionPasses(resp, data, posts, question, setup);
    expect(result, JSON.stringify({ result, status: resp.status, data, meals: data.meals })).toEqual({ ok: true });

    if (openrouter.callOpenRouter.mock.calls.length) {
      const prompt = promptText();
      if (setup.id === "E") {
        expect(prompt).toMatch(/dairy/i);
        expect(prompt).toMatch(/cottage cheese/i);
      }
      if (question.forbid?.includes("chicken") || question.forbid?.includes("egg") || question.forbid?.includes("smoothie")) {
        expect(prompt.length).toBeGreaterThan(20);
      }
      if (question.followUp) {
        expect(prompt).toContain(COACH_BANK_PREVIOUS_PLATE);
      }
      if (question.excludeLast) {
        expect(prompt).toContain(COACH_BANK_LAST_PLATE);
      }
    }
  });
});

const DEAD_END_ASK = "what should I have for dinner";
const DEAD_END_PATHS = [
  {
    id: "noRanges",
    status: 200,
    minMeals: 2,
    lead: COACH_FINE_TUNING_LINE,
    noModel: false,
    mock: { noRanges: true },
    body: { mode: "ask", text: DEAD_END_ASK },
  },
  {
    id: "dailyLimit",
    status: 429,
    minMeals: 2,
    lead: COACH_LIMIT_FOOD,
    noModel: true,
    mock: { callsUsed: 30 },
    body: { mode: "ask", text: DEAD_END_ASK },
  },
  {
    id: "modelDown",
    status: 200,
    minMeals: 2,
    lead: null,
    noModel: false,
    mock: {},
    down: true,
    body: { mode: "ask", text: DEAD_END_ASK },
  },
  {
    id: "photoNoCards",
    status: 200,
    minMeals: 2,
    lead: null,
    noModel: false,
    mock: {},
    empty: true,
    body: {
      mode: "kitchen",
      text: "I already logged this",
      images: [{ image_b64: "abc", media_type: "image/jpeg" }],
    },
  },
];

describe("dead-end paths still return a meal", () => {
  it.each(
    DEAD_END_PATHS.flatMap((path) => (
      COACH_QUESTION_BANK_SETUPS.map((setup) => [path.id, setup.id, path, setup])
    )),
  )("%s × %s", async (_pid, _sid, path, setup) => {
    mockSetup(setup, path.mock);
    if (path.down) {
      openrouter.callOpenRouter.mockResolvedValue({ ok: false, kind: "timeout", status: 504 });
    } else if (path.empty) {
      applyShape("empty");
    } else {
      applyShape("good");
    }
    const requestId = `dead-${path.id}-${setup.id}`;
    const resp = await onRequestPost({
      request: request({
        ...path.body,
        slot: setup.slot || "dinner",
        requestId,
        context: setup.context,
      }),
      env,
    });
    const data = await resp.json();
    const posts = coachPosts();
    const result = deadEndPathPasses(resp, data, posts, {
      status: path.status,
      minMeals: path.minMeals,
      lead: path.lead,
      noModel: path.noModel,
      modelCalled: openrouter.callOpenRouter.mock.calls.length > 0,
    });
    expect(result, JSON.stringify({ result, status: resp.status, data })).toEqual({ ok: true });
    if (path.noModel) expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    if (setup.id === "E") {
      const hay = (data.meals || []).map((meal) => `${meal.name} ${meal.desc}`).join(" ");
      expect(hay).not.toMatch(/\b(yogurt|yoghurt|cheese|cottage|whey|shake)\b/i);
    }
  });
});
