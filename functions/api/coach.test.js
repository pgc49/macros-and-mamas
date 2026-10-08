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
import { COACH_DEFLECT } from "../../src/content/coachVoice.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";

const env = {
  OPENROUTER_API_KEY: "or-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  RESEND_API_KEY: "re-key",
  CALLIE_NOTIFY_EMAIL: "calista@nourishwithcalista.com",
};

function request(body) {
  return new Request("https://app.macrosandmamas.com/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer mama-token" },
    body: JSON.stringify(body),
  });
}

function usedForType(type, { callsUsed, recordCallsUsed, noteCallsUsed, overCapCallsUsed }) {
  if (type === "coach_record") return recordCallsUsed;
  if (type === "coach_note") return noteCallsUsed;
  if (type === "coach_over_cap") return overCapCallsUsed;
  return callsUsed;
}

function mockSupabase({
  paid = true,
  role = "client",
  macros = true,
  callsUsed = 0,
  recordCallsUsed = 0,
  noteCallsUsed = 0,
  overCapCallsUsed = 0,
  thread = [],
  pages = null,
  profile = null,
  macrosRow = null,
  customMeals = [],
  summary = null,
  refusalWrite = true,
} = {}) {
  let summaryRow = summary;
  const claimedTickets = new Map();
  let overCapUsed = overCapCallsUsed;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
    }
    if (value.includes("select=paid,refunded,role")) {
      return new Response(JSON.stringify([{ paid, refunded: false, role }]), { status: 200 });
    }
    if (value.includes("rpc/reserve_estimate_call")) {
      const body = JSON.parse(init?.body || "{}");
      const ticket = String(body.p_request_id || "").trim();
      if (body.p_type === "coach_over_cap") {
        if (overCapUsed < Number(body.p_max || 0)) {
          overCapUsed += 1;
          if (ticket) claimedTickets.set(ticket, { type: body.p_type, retried: false });
          return new Response(JSON.stringify(true), { status: 200 });
        }
        return new Response(JSON.stringify(false), { status: 200 });
      }
      const used = usedForType(body.p_type, { callsUsed, recordCallsUsed, noteCallsUsed, overCapCallsUsed });
      if (ticket) {
        const prior = claimedTickets.get(ticket);
        if (prior) {
          if (prior.type !== body.p_type || prior.retried) {
            return new Response(JSON.stringify(false), { status: 200 });
          }
          prior.retried = true;
          return new Response(JSON.stringify(true), { status: 200 });
        }
      }
      if (used < Number(body.p_max || 0)) {
        if (ticket) claimedTickets.set(ticket, { type: body.p_type, retried: false });
        return new Response(JSON.stringify(true), { status: 200 });
      }
      return new Response(JSON.stringify(false), { status: 200 });
    }
    if (value.includes("estimate_calls") && init?.method !== "POST") {
      const type = decodeURIComponent((value.match(/type=eq\.([^&]+)/) || [])[1] || "coach");
      const used = usedForType(type, { callsUsed, recordCallsUsed, noteCallsUsed });
      return new Response("[]", {
        status: 200,
        headers: { "content-range": `0-0/${used}` },
      });
    }
    if (value.includes("estimate_calls")) return new Response(null, { status: 201 });
    if (value.includes("/rest/v1/profiles?id=eq.")) {
      return new Response(
        JSON.stringify([profile || { id: USER_ID, name: "Sam", diet: "none", allergens: [], pref_d: "chicken" }]),
        { status: 200 },
      );
    }
    if (value.includes("/rest/v1/macros")) {
      if (!macros && !macrosRow) return new Response("[]", { status: 200 });
      const row = macrosRow || { cal: 1750, protein: 140, carbs: 160, fat: 55, approved: true };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (value.includes("custom_meals")) return new Response(JSON.stringify(customMeals), { status: 200 });
    if (value.includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "re_test" }), { status: 200 });
    }
    if (value.includes("rpc/append_coach_refusal_line") && !refusalWrite) {
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    if (value.includes("client_summaries") && init?.method === "POST") {
      summaryRow = JSON.parse(init.body);
      return new Response(null, { status: 201 });
    }
    if (value.includes("client_summaries")) {
      return new Response(JSON.stringify(summaryRow ? [summaryRow] : []), { status: 200 });
    }
    if (value.includes("coach_messages") && init?.method !== "POST") {
      return new Response(JSON.stringify(thread), { status: 200 });
    }
    if (pages) {
      for (const [host, page] of Object.entries(pages)) {
        if (!value.includes(host)) continue;
        return new Response(page.body, {
          status: page.status || 200,
          headers: page.headers || { "content-type": "text/html; charset=utf-8" },
        });
      }
    }
    return new Response("[]", { status: 200 });
  });
}

const JANE_HTML = `<html><body>
<h1>Jane on Fillmore</h1>
<ul>
<li>Scrambled Egg Sandwich</li>
<li>Chicken Taco Salad</li>
<li>Caesar Salad</li>
<li>Nicoise</li>
<li>Mango Chicken Salad</li>
</ul>
<p>Order at the counter. Dressings and sauces are listed beside each plate on the printed menu.</p>
</body></html>`;

function postedCalls() {
  return globalThis.fetch.mock.calls.filter(([url, init]) => (
    init?.method === "POST"
    && (String(url).includes("/estimate_calls") || String(url).includes("reserve_estimate_call"))
  ));
}

function reserveTypes() {
  return globalThis.fetch.mock.calls
    .filter(([url]) => String(url).includes("rpc/reserve_estimate_call"))
    .map(([, init]) => JSON.parse(init.body || "{}").p_type);
}

function summaryPosts() {
  return globalThis.fetch.mock.calls
    .filter(([url, init]) => String(url).includes("client_summaries") && init?.method === "POST")
    .map(([, init]) => JSON.parse(init.body));
}

function promptText(call = openrouter.callOpenRouter.mock.calls.at(-1)[0]) {
  const content = call.messages[1].content;
  if (typeof content === "string") return content;
  return content.find((part) => part.type === "text")?.text || "";
}

const FILE = {
  profile: {
    id: USER_ID,
    name: "Sam",
    diet: "pescatarian",
    pref_b: "eggs and oats",
    pref_l: "salads",
    pref_d: "salmon and rice",
    pref_s: "yogurt",
    season_note: "nursing a toddler",
    allergens: ["dairy"],
    allergen_note: "whey is fine",
    food_avoids: "mushrooms",
    breastfeeding: true,
    months_pp: 2,
    coach_note: "banner she dismissed",
  },
  macrosRow: {
    cal: 1800,
    protein: 140,
    carbs: 160,
    fat: 55,
    approved: true,
    notes: ["keep fat at the low end", "no oats"],
  },
  customMeals: [{ name: "Sausage scramble", cal: 380, p: 32, c: 12, f: 18 }],
};

function expectFileInPrompt(prompt, months) {
  expect(prompt).toContain("Approved ranges");
  expect(prompt).toContain("Calories: 1800");
  expect(prompt).toContain("Protein: 140 g");
  expect(prompt).toContain("Carbs: 160 g");
  expect(prompt).toContain("Fat: 55 g");
  expect(prompt).toContain("Do not recite them");
  expect(prompt).toContain("keep fat at the low end");
  expect(prompt).toContain("no oats");
  expect(prompt).toContain("Do not quote them");
  expect(prompt).toContain(`${months} months postpartum`);
  expect(prompt).toContain("Choose the plate from that");
  expect(prompt).toContain("Do not mention her stage");
  expect(prompt).not.toMatch(/you are \d+ months/i);
  expect(prompt).toContain("She is nursing");
  expect(prompt).toContain("Do not shrink the plate");
  expect(prompt).toContain("eggs and oats");
  expect(prompt).toContain("salmon and rice");
  expect(prompt).toContain("yogurt");
  expect(prompt).toContain("nursing a toddler");
  expect(prompt).toContain("mushrooms");
  expect(prompt).toContain("dairy (milk");
  expect(prompt).toContain("Sausage scramble");
  expect(prompt).not.toContain("banner she dismissed");
}

function modelReturns(value) {
  openrouter.callOpenRouter.mockResolvedValue({
    ok: true,
    text: JSON.stringify(value),
    model: "google/gemini-3.1-flash-lite",
  });
  openrouter.parseJsonLoose.mockReturnValue({ ok: true, value });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  modelReturns({ scope: "food", reply: "The chicken bowl fits and gets your protein in.", meals: [] });
});

describe("access", () => {
  it("refuses without a token", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: new Request("https://app.macrosandmamas.com/api/coach", {
        method: "POST",
        body: JSON.stringify({ mode: "ask", text: "what should I eat" }),
      }),
      env,
    });
    expect(resp.status).toBe(401);
  });

  it("refuses an unpaid mama", async () => {
    mockSupabase({ paid: false });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat" }), env });
    expect(resp.status).toBe(403);
  });

  it("answers a typed food question from unapproved working numbers", async () => {
    mockSupabase({ macrosRow: { cal: 1750, protein: 140, carbs: 160, fat: 55, approved: false } });
    modelReturns({
      scope: "food",
      reply: "A veggie scramble with two or three eggs and the vegetables you have.",
      meals: [{
        name: "Veggie scramble",
        desc: "Eggs and whatever vegetables are in the fridge.",
        cal: 320,
        p: 22,
        c: 8,
        f: 20,
        ingredients: [{ item: "eggs", amount: "2–3" }, { item: "mixed vegetables", amount: "1 cup" }],
        steps: ["Scramble the eggs with the vegetables."],
      }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "I want something new. I just have eggs and vegetables in my fridge.",
        requestId: "ask-eggs-unapproved",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.reply).toBe(
      "Callie's still fine-tuning your numbers, so here's an easy one for now. A veggie scramble with two or three eggs and the vegetables you have.",
    );
    expect(data.meals.length).toBeGreaterThanOrEqual(1);
    expect(data.meals[0].name).toBe("Veggie scramble");
    expect(data.meals[0].desc).toMatch(/estimate/i);
    expect(data.mealSource).toBe("new");
    const prompt = promptText();
    expect(prompt).toContain("Working numbers");
    expect(prompt).toContain("Callie has not finished");
    expect(prompt).not.toContain("Approved ranges");
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].body).toBe(data.reply);
    expect(posts[0].request_id).toBe("ask-eggs-unapproved");
    expect(posts[0].payload.requestId).toBe("ask-eggs-unapproved");
  });

  it("answers a typed food question when she has no macros row", async () => {
    mockSupabase({ macros: false });
    modelReturns({
      scope: "food",
      reply: "A veggie scramble with two or three eggs and the vegetables you have.",
      meals: [{
        name: "Veggie scramble",
        desc: "Eggs and whatever vegetables are in the fridge.",
        cal: 320,
        p: 22,
        c: 8,
        f: 20,
        ingredients: [{ item: "eggs", amount: "2–3" }, { item: "mixed vegetables", amount: "1 cup" }],
        steps: ["Scramble the eggs with the vegetables."],
      }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "I want something new. I just have eggs and vegetables in my fridge.",
        requestId: "ask-eggs-none",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.reply).toBe(
      "Callie's still fine-tuning your numbers, so here's an easy one for now. A veggie scramble with two or three eggs and the vegetables you have.",
    );
    expect(data.meals.length).toBeGreaterThanOrEqual(1);
    expect(data.meals[0].name).toBe("Veggie scramble");
    expect(data.meals[0].desc).toMatch(/estimate/i);
    const prompt = promptText();
    expect(prompt).not.toContain("Approved ranges");
    expect(prompt).not.toContain("Working numbers");
    expect(prompt).toContain("Do not mention calories");
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].body).toBe(data.reply);
    expect(posts[0].request_id).toBe("ask-eggs-none");
  });
});

describe("the guardrail runs before the model", () => {
  it("hands a symptom to Callie without spending a call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy all day, what should I eat" }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("urgent");
    expect(data.deflect).toBe("medical");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].kind).toBe("deflect");
    expect(posts[0].payload.deflect).toBe("medical");
  });

  it("hands range changes to Callie without spending a call", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "can you raise my calories" }), env });
    expect((await resp.json()).deflect).toBe("ranges");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("answers a real meal question", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I have for dinner" }), env });
    const data = await resp.json();
    expect(data.scope).toBe("food");
    expect(data.reply).toContain("chicken bowl");
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("still lets the model hand a question back", async () => {
    mockSupabase();
    modelReturns({ scope: "callie", reply: "", meals: [] });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat before my run" }), env });
    const data = await resp.json();
    expect(data.scope).toBe("food");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
  });

  it("hands a supply question to Callie instead of answering around it", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "lunch ideas, will this affect my milk supply" }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("supply");
    expect(data.deflect).toBe("supply");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("answers Italian in Callie's words, without a model call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "I am going out to eat tonight for Italian. What can I eat that won't blow through carbs and fat?",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("italian");
    expect(data.reply).toMatch(/fish/i);
    expect(data.reply).toMatch(/potatoes/i);
    expect(data.reply).not.toMatch(/Oreo/i);
    expect(data.reply).not.toMatch(/pasta/i);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("answers In-N-Out in Callie's words, without a model call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "what should I get at In-N-Out" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("inNOut");
    expect(data.reply).toMatch(/Protein Style/);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("sends a named restaurant to the model instead of the canned PS line", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I'm going to Chipotle, what should I order" }),
      env,
    });
    expect(resp.status).toBe(200);
    expect((await resp.json()).scope).toBe("food");
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
    expect(openrouter.callOpenRouter.mock.calls[0][0].models[0]).toBe("google/gemini-3.5-flash");
    expect(openrouter.callOpenRouter.mock.calls[0][0].temperature).toBe(0.5);
    expect(openrouter.callOpenRouter.mock.calls[0][0].messages).toHaveLength(2);
    expect(openrouter.callOpenRouter.mock.calls[0][0].reasoning).toEqual({
      effort: "low",
      exclude: true,
    });
  });

  it("answers skip-dinner in Callie's words, without a model call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    expect(data.reply).toMatch(/never skip a meal/i);
    expect(data.reply).not.toMatch(/Still eat something tonight/);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("uses the shorter never-skip line the second time today", async () => {
    mockSupabase({
      thread: [{ role: "coach", source: "server", payload: { teach: "neverSkip" } }],
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    expect(data.reply).toMatch(/Still eat something tonight/);
    expect(data.reply).not.toMatch(/You never skip a meal/);
  });
});

describe("what comes back", () => {
  it("drops a meal whose macros do not add up", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Here you go.",
      meals: [
        { name: "Real bowl", cal: 430, p: 45, c: 30, f: 12, ingredients: [], steps: [] },
        { name: "Made up bowl", cal: 200, p: 60, c: 60, f: 30, ingredients: [], steps: [] },
      ],
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    const data = await resp.json();
    expect(data.meals[0].name).toBe("Real bowl");
    expect(data.meals.length).toBeGreaterThanOrEqual(1);
  });

  it("drops a reply that quotes her ranges back", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "Your ranges are 1750-1900 calories, so eat light.", meals: [] });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    const quoted = await resp.json();
    expect(quoted.reply).toMatch(/Here's /);
    expect(quoted.meals.length).toBeGreaterThanOrEqual(2);
  });

  it("drops a jargon reply and keeps the cards", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Try the salmon from Callie's bank tonight.",
      meals: [{ name: "Salmon bowl", cal: 430, p: 40, c: 28, f: 14, ingredients: [], steps: [] }],
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    const data = await resp.json();
    expect(data.reply).toMatch(/Salmon bowl/);
    expect(data.meals[0].name).toBe("Salmon bowl");
    expect(data.meals.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to local plates when the model is down, not a busy wall", async () => {
    mockSupabase();
    openrouter.callOpenRouter.mockResolvedValue({ ok: false, kind: "credits", status: 402 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.reply).not.toMatch(/\bAI\b|Callie has been notified/);
    expect(openrouter.messageForKind).not.toHaveBeenCalled();
    expect(coachMessagePosts()[0].kind).toBe("cards");
  });

  it("fills plates when the model returns nothing on a food question", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "", meals: [] });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I just have eggs and vegetables in my fridge." }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.meals[0].name).toMatch(/scramble|egg/i);
    expect(data.reply).toMatch(/Here's /);
    expect(coachMessagePosts()).toHaveLength(1);
  });

  it("offers a next meal when she photographs a plate she already logged", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "That looks like last night's salmon.",
      meals: [{ name: "Leftover salmon", cal: 420, p: 38, c: 28, f: 16, ingredients: [], steps: [] }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "kitchen",
        text: "I already logged this",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.meals.length).toBeGreaterThanOrEqual(1);
    expect(data.meals.some((meal) => meal.name !== "Leftover salmon")).toBe(true);
    expect(coachMessagePosts()).toHaveLength(1);
  });

  it("treats a kitchen photo plus a what-can-I-make caption as food", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "From what you have.", meals: [] });
    const resp = await onRequestPost({
      request: request({
        mode: "kitchen",
        text: "this is what I have, what can I make",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.scope === "food" || data.meals.length >= 2).toBe(true);
    expect(data.deflect).toBeFalsy();
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
  });

  it("fills plates for a kitchen photo with only a short note", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "", meals: [] });
    const resp = await onRequestPost({
      request: request({
        mode: "kitchen",
        text: "this",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(coachMessagePosts()).toHaveLength(1);
  });

  it("fills a plate when the model answer is unreadable, instead of the busy line", async () => {
    mockSupabase();
    openrouter.callOpenRouter.mockResolvedValue({ ok: true, text: "not json", model: "google/gemini-3.5-flash" });
    openrouter.parseJsonLoose.mockReturnValue({ ok: false, error: new Error("bad json") });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.reply).toMatch(/Here's /);
    expect(coachMessagePosts()).toHaveLength(1);
    expect(openrouter.messageForKind).not.toHaveBeenCalled();
  });

  it("skips the log-ahead sentence when she is not logging", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "is pizza ok",
        context: { notLogging: true },
      }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("realFood");
    expect(data.reply).toMatch(/real food/i);
    expect(data.reply).not.toMatch(/log it ahead/);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("asks for a photo when a pasted link cannot be read, and does not spend a call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ Can you tell me what to eat from this menu",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("menuClosed");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.reply).toMatch(/couldn't open that link/i);
    expect(data.reply).toMatch(/photo/i);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("does not fetch a private address pasted as a menu", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "http://169.254.169.254/latest/meta-data what should I order",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("menuClosed");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    const hosts = globalThis.fetch.mock.calls.map(([url]) => String(url));
    expect(hosts.some((url) => url.includes("169.254"))).toBe(false);
  });

  it("keeps only dishes that are printed on the fetched page", async () => {
    mockSupabase({ pages: { "itsjane.com": { body: JANE_HTML } } });
    modelReturns({
      scope: "food",
      reply: "Get the Jane Salad with Chicken.",
      meals: [
        {
          name: "Jane Salad with Chicken",
          desc: "invented",
          cal: 440,
          p: 38,
          c: 30,
          f: 21,
          ingredients: [{ item: "chicken", amount: "1 breast" }],
          steps: ["Bake the chicken for 12 minutes."],
        },
        {
          name: "Chicken Taco Salad",
          desc: "as printed",
          cal: 440,
          p: 38,
          c: 30,
          f: 21,
          ingredients: [{ item: "chicken", amount: "1 breast" }],
          steps: ["Bake the chicken for 12 minutes.", "Ask for dressing on the side."],
        },
      ],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ Can you tell me what to eat from this menu",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.meals).toHaveLength(1);
    expect(data.meals[0].name).toBe("Chicken Taco Salad");
    expect(data.meals[0].ingredients).toEqual([]);
    expect(data.meals[0].steps).toEqual(["Ask for dressing on the side."]);
    expect(data.mealSource).toBe("menu");
    expect(data.reply).toMatch(/From the page: Chicken Taco Salad/);
    expect(data.reply).not.toMatch(/Jane Salad/i);
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
    const prompt = openrouter.callOpenRouter.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Chicken Taco Salad");
    expect(prompt).toMatch(/must appear in the page text/);
    expect(reserveTypes()).toEqual(["coach_note", "coach"]);
  });

  it("gives the note bucket its own ticket so a pasted menu link still reaches the model", async () => {
    mockSupabase({ pages: { "itsjane.com": { body: JANE_HTML } } });
    modelReturns({
      scope: "food",
      reply: "Get the Chicken Taco Salad.",
      meals: [{
        name: "Chicken Taco Salad",
        desc: "as printed",
        cal: 440,
        p: 38,
        c: 30,
        f: 21,
        ingredients: [],
        steps: [],
      }],
    });
    const requestId = "11111111-1111-4111-8111-111111111111";
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ what should I eat",
        requestId,
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.meals).toHaveLength(1);
    expect(data.meals[0].name).toBe("Chicken Taco Salad");
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
    const reserves = globalThis.fetch.mock.calls
      .filter(([url]) => String(url).includes("rpc/reserve_estimate_call"))
      .map(([, init]) => JSON.parse(init.body || "{}"));
    expect(reserves).toEqual([
      expect.objectContaining({ p_type: "coach_note", p_request_id: `${requestId}-note` }),
      expect.objectContaining({ p_type: "coach", p_request_id: requestId }),
    ]);
  });

  it("asks for a photo when the page has no dish the model named", async () => {
    mockSupabase({ pages: { "itsjane.com": { body: JANE_HTML } } });
    modelReturns({
      scope: "food",
      reply: "Try the Jane Salad with Chicken.",
      meals: [{
        name: "Jane Salad with Chicken",
        cal: 440,
        p: 38,
        c: 30,
        f: 21,
        ingredients: [],
        steps: [],
      }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ what should I eat",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("menuMiss");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.reply).toMatch(/couldn't find on the page/i);
    expect(data.reply).not.toMatch(/Jane Salad/i);
  });

  it("keeps a menu photo as an order, not a recipe", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "The printed salad, dressing on the side.",
      meals: [{
        name: "Market salad",
        desc: "as printed",
        cal: 440,
        p: 38,
        c: 30,
        f: 21,
        ingredients: [{ item: "chicken", amount: "1 breast" }, { item: "mixed greens", amount: "2 cups" }],
        steps: ["Grill the chicken for 8 minutes.", "Ask for the dressing on the side."],
      }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "menu",
        slot: "lunch",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(data.meals[0].ingredients).toEqual([]);
    expect(data.meals[0].steps).toEqual(["Ask for the dressing on the side."]);
  });

  it("marks menu picks as estimates", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "The grilled bowl is the one.",
      meals: [{ name: "Grilled chicken bowl", desc: "grilled chicken, rice, beans", cal: 520, p: 42, c: 55, f: 12, ingredients: [], steps: [] }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "menu",
        slot: "dinner",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(data.mealSource).toBe("menu");
    expect(data.meals[0].desc).toMatch(/estimate/i);
  });

  it("keeps a named tonight as dinner when the model says breakfast", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Chicken and rice tonight.",
      meals: [{ name: "Chicken and rice", cal: 440, p: 38, c: 30, f: 14, slot: "breakfast" }],
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "what should I eat tonight", slot: "breakfast" }),
      env,
    });
    const data = await resp.json();
    expect(data.meals[0].slot).toBe("dinner");
  });

  it("needs a photo for a menu read", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "menu", slot: "dinner" }), env });
    expect(resp.status).toBe(400);
  });
});

describe("the model ask sees the file the ranker sees", () => {
  const askBody = {
    mode: "ask",
    text: "what should I have for dinner",
    slot: "dinner",
    context: {
      eaten: ["lunch: Turkey wrap"],
      planned: ["dinner: Pencilled salmon"],
      usual: ["Sheet pan chicken"],
      skipped: [],
      turnedDown: [],
      snackCount: 1,
    },
    recent: ["Greek yogurt bowl"],
  };

  it("puts ranges, stage, notes, nursing, prefs, today, and saved meals on the ask prompt", async () => {
    mockSupabase(FILE);
    const resp = await onRequestPost({ request: request(askBody), env });
    expect(resp.status).toBe(200);
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
    const prompt = promptText();
    expectFileInPrompt(prompt, 2);
    expect(prompt).toContain("lunch: Turkey wrap");
    expect(prompt).toContain("dinner: Pencilled salmon");
    expect(prompt).toContain("Sheet pan chicken");
    expect(prompt).toContain("Greek yogurt bowl");
  });

  it("puts already-suggested plates on the ask prompt", async () => {
    mockSupabase(FILE);
    const resp = await onRequestPost({
      request: request({
        ...askBody,
        context: {
          ...askBody.context,
          alreadySuggested: ["Pulled chicken tacos", "Sheet pan chicken"],
        },
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const prompt = promptText();
    expect(prompt).toContain("Already suggested in this chat — don't offer again unless she asks:");
    expect(prompt).toContain("Pulled chicken tacos");
    expect(prompt).toContain("Sheet pan chicken");
  });

  it("keeps 2–3 distinct plates and drops a half of the same dish", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Chicken bowl tonight.",
      meals: [
        { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, servings: 1 },
        { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, servings: 1 },
        { name: "Turkey meatballs", cal: 420, p: 40, c: 28, f: 12, servings: 1 },
      ],
    });
    const two = await onRequestPost({
      request: request({ mode: "ask", text: "what should I have for dinner", slot: "dinner" }),
      env,
    });
    expect((await two.json()).meals.map((m) => m.name)).toEqual([
      "Chicken bowl",
      "Salmon and rice",
      "Turkey meatballs",
    ]);

    modelReturns({
      scope: "food",
      reply: "Chicken bowl, or a half.",
      meals: [
        { name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, servings: 1 },
        { name: "Chicken bowl", cal: 215, p: 22, c: 15, f: 6, servings: 0.5 },
        { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, servings: 1 },
      ],
    });
    const half = await onRequestPost({
      request: request({ mode: "ask", text: "what should I have for dinner", slot: "dinner" }),
      env,
    });
    const halfMeals = (await half.json()).meals;
    expect(halfMeals.length).toBeGreaterThanOrEqual(2);
    expect(halfMeals.length).toBeLessThanOrEqual(3);
    expect(halfMeals.map((m) => m.name)).toContain("Chicken bowl");
    expect(halfMeals.map((m) => m.name)).toContain("Salmon and rice");
    expect(halfMeals.filter((m) => m.name === "Chicken bowl")).toHaveLength(1);
    expect(new Set(halfMeals.map((m) => m.name)).size).toBe(halfMeals.length);
    expect(halfMeals.every((m) => Number(m.servings) !== 0.5)).toBe(true);
  });

  it("keeps the same file on a menu photo, a kitchen photo, and a menu link", async () => {
    const photo = [{ image_b64: "abc", media_type: "image/jpeg" }];
    mockSupabase({ ...FILE, profile: { ...FILE.profile, months_pp: 14 } });
    let resp = await onRequestPost({
      request: request({ mode: "menu", slot: "dinner", text: "tonight", images: photo }),
      env,
    });
    expect(resp.status).toBe(200);
    expectFileInPrompt(promptText(), 14);

    mockSupabase({ ...FILE, profile: { ...FILE.profile, months_pp: 2 } });
    resp = await onRequestPost({
      request: request({ mode: "kitchen", slot: "dinner", text: "tonight", images: photo }),
      env,
    });
    expect(resp.status).toBe(200);
    expectFileInPrompt(promptText(), 2);

    mockSupabase({
      ...FILE,
      pages: { "itsjane.com": { body: JANE_HTML } },
    });
    resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ what should I eat",
        slot: "dinner",
        context: askBody.context,
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const linked = promptText();
    expectFileInPrompt(linked, 2);
    expect(linked).toContain("Chicken Taco Salad");
    expect(linked).toContain("lunch: Turkey wrap");
  });
});

describe("an escalate lands on her card", () => {
  function summaryFetch({ thread = [] } = {}) {
    let row = {
      summary: "Callie already wrote this.",
      suggested_touch: "Say hi.",
      model: "admin-model",
    };
    const posts = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
      }
      if (value.includes("select=paid,refunded,role")) {
        return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
      }
      if (value.includes("estimate_calls") && init?.method !== "POST") {
        return new Response("[]", {
          status: 200,
          headers: { "content-range": "0-0/0" },
        });
      }
      if (value.includes("estimate_calls")) return new Response(null, { status: 201 });
      if (value.includes("client_summaries") && init?.method === "POST") {
        const body = JSON.parse(init.body);
        posts.push(body);
        row = body;
        return new Response(null, { status: 201 });
      }
      if (value.includes("client_summaries")) {
        return new Response(JSON.stringify([row]), { status: 200 });
      }
      if (value.includes("coach_messages") && init?.method !== "POST") {
        return new Response(JSON.stringify(thread), { status: 200 });
      }
      if (value.includes("coach_messages")) return new Response(null, { status: 201 });
      if (value.includes("api.resend.com")) {
        return new Response(JSON.stringify({ id: "re_test" }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    return posts;
  }

  it("writes a medical brief onto the Pacific day, not the UTC date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T01:05:00.000Z"));
    const posts = [];
    const reads = [];
    try {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const value = String(url);
        if (value.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
        }
        if (value.includes("select=paid,refunded,role")) {
          return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
        }
        if (value.includes("client_summaries") && init?.method === "POST") {
          posts.push(JSON.parse(init.body));
          return new Response(null, { status: 201 });
        }
        if (value.includes("client_summaries")) {
          reads.push(value);
          return new Response(JSON.stringify([{
            summary: "QA prior summary — keep this paragraph.",
            suggested_touch: "Say hi.",
            model: "admin-model",
          }]), { status: 200 });
        }
        return new Response("[]", { status: 200 });
      });

      const dizzy = await onRequestPost({
        request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
        env,
      });
      expect((await dizzy.json()).deflect).toBe("medical");
      expect(posts).toHaveLength(1);
      expect(posts[0].for_date).toBe("2026-10-01");
      expect(String(reads[0])).toContain("for_date=eq.2026-10-01");
      expect(posts[0].summary.startsWith("QA prior summary — keep this paragraph.")).toBe(true);
      expect(posts[0].summary).toContain("Coach refused (medical): I've been dizzy since this morning");

      const supply = await onRequestPost({
        request: request({ mode: "ask", text: "will this affect my milk supply" }),
        env,
      });
      expect((await supply.json()).deflect).toBe("supply");
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("appends a medical brief without replacing her summary", async () => {
    const posts = summaryFetch();
    const dizzy = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
      env,
    });
    expect((await dizzy.json()).deflect).toBe("medical");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(posts).toHaveLength(1);
    expect(posts[0].summary.startsWith("Callie already wrote this.")).toBe(true);
    expect(posts[0].summary).toContain("Coach refused (medical): I've been dizzy since this morning");
    expect(posts[0].summary).not.toContain("\nI've been dizzy");
    expect(posts[0].suggested_touch).toBe("Say hi.");
    expect(posts[0].model).toBe("admin-model");

    const repeat = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
      env,
    });
    expect((await repeat.json()).deflect).toBe("medical");
    expect(posts).toHaveLength(1);
  });

  it("appends a stuck brief on the third pain teach and does not wipe the seed", async () => {
    const posts = summaryFetch({
      thread: [
        { role: "coach", source: "server", payload: { teach: "neverSkip" } },
        { role: "coach", source: "server", payload: { teach: "neverSkip" } },
      ],
    });
    const stuck = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner", escalate: "stuck" }),
      env,
    });
    expect((await stuck.json()).deflect).toBe("again");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(posts).toHaveLength(1);
    expect(posts[0].summary.startsWith("Callie already wrote this.")).toBe(true);
    expect(posts[0].summary).toContain("Coach refused (stuck): should I skip dinner");
    expect(posts[0].suggested_touch).toBe("Say hi.");
  });

  it("does not pin Stuck on real ask + recorded teach + real ask", async () => {
    mockSupabase({
      thread: [
        { role: "coach", source: "server", payload: { teach: "neverSkip" } },
        { role: "coach", source: "client", payload: { teach: "neverSkip" } },
      ],
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    expect(data.deflect).toBeUndefined();
    expect(coachMessagePosts()[0].source).toBe("server");
    expect(summaryPosts()).toHaveLength(0);
  });

  it("does not mint a Stuck pin from two recorded client teaches plus one real ask", async () => {
    mockSupabase({
      thread: [
        { role: "coach", source: "client", payload: { teach: "neverSkip" } },
        { role: "coach", source: "client", payload: { teach: "neverSkip" } },
      ],
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    expect(data.deflect).toBeUndefined();
    expect(coachMessagePosts()[0].source).toBe("server");
    expect(coachMessagePosts()[0].payload.teach).toBe("neverSkip");
    expect(summaryPosts()).toHaveLength(0);
  });

  it("still shows a canned refuse over the note cap and does not save or append", async () => {
    mockSupabase({ noteCallsUsed: 20 });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "will this affect my milk supply" }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.deflect).toBe("supply");
    expect(coachMessagePosts()).toHaveLength(0);
    expect(summaryPosts()).toHaveLength(0);
    expect(reserveTypes()).toEqual(["coach_note"]);
  });

  it("still closes an unreadable menu over the note cap without saving", async () => {
    mockSupabase({ noteCallsUsed: 20 });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "https://www.itsjane.com/location/jane-on-fillmore/ what should I order",
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.teach).toBe("menuClosed");
    expect(coachMessagePosts()).toHaveLength(0);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(globalThis.fetch.mock.calls.every(([url]) => !String(url).includes("itsjane.com"))).toBe(true);
  });

  it("still teaches over the note cap without saving the row", async () => {
    mockSupabase({ noteCallsUsed: 20 });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.teach).toBe("neverSkip");
    expect(data.reply).toMatch(/never skip a meal/i);
    expect(coachMessagePosts()).toHaveLength(0);
    expect(summaryPosts()).toHaveLength(0);
  });

  it("still returns a stuck line over the note cap without saving or appending", async () => {
    mockSupabase({
      noteCallsUsed: 20,
      thread: [
        { role: "coach", source: "server", payload: { teach: "neverSkip" } },
        { role: "coach", source: "server", payload: { teach: "neverSkip" } },
      ],
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.deflect).toBe("again");
    expect(coachMessagePosts()).toHaveLength(0);
    expect(summaryPosts()).toHaveLength(0);
  });

  it("appends a crisis over the note cap and does not save the pin", async () => {
    mockSupabase({ noteCallsUsed: 20 });
    const medical = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
      env,
    });
    expect((await medical.json()).deflect).toBe("medical");
    expect(coachMessagePosts()).toHaveLength(0);
    expect(summaryPosts()).toHaveLength(0);

    const crisis = await onRequestPost({
      request: request({ mode: "ask", text: "I want to die" }),
      env,
    });
    expect((await crisis.json()).deflect).toBe("emergency");
    expect(coachMessagePosts()).toHaveLength(0);
    expect(summaryPosts()).toHaveLength(1);
    expect(summaryPosts()[0].summary).toContain("Coach refused (crisis): I want to die");
  });

  it("keeps a same-day medical line and a later crisis line", async () => {
    const posts = summaryFetch();
    await onRequestPost({
      request: request({ mode: "ask", text: "I have a migraine" }),
      env,
    });
    await onRequestPost({
      request: request({ mode: "ask", text: "I want to die" }),
      env,
    });
    expect(posts.at(-1).summary).toContain("Coach refused (medical): I have a migraine");
    expect(posts.at(-1).summary).toContain("Coach refused (crisis): I want to die");
  });

  it("ignores a client stuck flag when she has not asked three times", async () => {
    const posts = summaryFetch({ thread: [] });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner", escalate: "stuck" }),
      env,
    });
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    expect(data.deflect).toBeUndefined();
    expect(posts).toHaveLength(0);
  });

  it("does not write a summary for an ordinary refuse", async () => {
    const posts = summaryFetch();
    const supply = await onRequestPost({
      request: request({ mode: "ask", text: "will this affect my milk supply" }),
      env,
    });
    expect((await supply.json()).deflect).toBe("supply");
    const care = await onRequestPost({
      request: request({ mode: "ask", text: "I feel awful about what I ate" }),
      env,
    });
    expect((await care.json()).deflect).toBe("care");
    const scale = await onRequestPost({
      request: request({ mode: "ask", text: "why has the scale not moved" }),
      env,
    });
    expect((await scale.json()).deflect).toBe("weight");
    const off = await onRequestPost({
      request: request({ mode: "ask", text: "what workout should I do today" }),
      env,
    });
    expect((await off.json()).deflect).toBe("offTopic");
    expect(posts).toHaveLength(0);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("classifies a photo note and refuses a red flag without a model call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "menu",
        slot: "dinner",
        text: "I fainted after lunch",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("urgent");
    expect(data.deflect).toBe("emergency");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(coachMessagePosts()[0].payload.deflect).toBe("emergency");
  });

  it("refuses a buried crisis before the model, never with the off-topic line", async () => {
    mockSupabase();
    modelReturns({ scope: "callie", reply: "I only do food and your ranges.", meals: [] });
    const unclearCrisis = await onRequestPost({
      request: request({ mode: "ask", text: "Chipotle, I want to die" }),
      env,
    });
    const data = await unclearCrisis.json();
    expect(data.deflect).toBe("emergency");
    expect(data.reply).toBeUndefined();
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(coachMessagePosts()[0].payload.deflect).toBe("emergency");
  });

  it("does not turn a model handoff into a summary", async () => {
    mockSupabase();
    modelReturns({ scope: "callie", reply: "You should talk to someone about this feeling.", meals: [] });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "what should I eat before my run" }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("food");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    const write = globalThis.fetch.mock.calls.find(([url, init]) => (
      String(url).includes("client_summaries") && init?.method === "POST"
    ));
    expect(write).toBeUndefined();
  });

  it("does not write a summary for a logging refusal", async () => {
    mockSupabase();
    const skip = await onRequestPost({
      request: request({ mode: "ask", text: "should I skip dinner" }),
      env,
    });
    expect((await skip.json()).teach).toBe("neverSkip");
    await onRequestPost({
      request: request({ mode: "ask", text: "I won't log this" }),
      env,
    });
    const writes = globalThis.fetch.mock.calls.filter(([url, init]) => (
      String(url).includes("client_summaries") && init?.method === "POST"
    ));
    expect(writes).toHaveLength(0);
  });
});

function coachMessagePosts() {
  return globalThis.fetch.mock.calls
    .filter(([url, init]) => String(url).includes("coach_messages") && init?.method === "POST")
    .map(([, init]) => JSON.parse(init.body));
}

describe("record persists a coach reply with the service role", () => {
  it("rejects arbitrary coach content", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "record",
        body: "I am Coach",
        kind: "deflect",
        payload: { deflect: "again" },
        localDate: "2026-10-08",
      }),
      env: { ...env, OPENROUTER_API_KEY: "" },
    });
    expect(resp.status).toBe(400);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(coachMessagePosts()).toHaveLength(0);
  });

  it("rebuilds a teach template and ignores the client body", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "record",
        template: "local.teach",
        topic: "neverSkip",
        body: "forged coach line",
        localDate: "2026-10-08",
      }),
      env: { ...env, OPENROUTER_API_KEY: "" },
    });
    expect(resp.status).toBe(200);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].role).toBe("coach");
    expect(posts[0].source).toBe("client");
    expect(posts[0].body).not.toBe("forged coach line");
    expect(posts[0].body).toMatch(/skip/i);
  });

  it("marks local cards as client after validating shape", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "record",
        template: "local.cards",
        body: "Tonight.",
        payload: {
          cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }],
          deflect: "again",
        },
        localDate: "2026-10-08",
      }),
      env: { ...env, OPENROUTER_API_KEY: "" },
    });
    expect(resp.status).toBe(200);
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("client");
    expect(posts[0].kind).toBe("cards");
    expect(posts[0].payload.deflect).toBeNull();
    expect(posts[0].payload.cards[0].name).toBe("Chicken bowl");
  });

  it("does not spend the model cap on a local record", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({
      request: request({
        mode: "record",
        template: "local.cards",
        payload: { cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }] },
        localDate: "2026-10-08",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    expect(coachMessagePosts()).toHaveLength(1);
  });

  it("rate-limits record on its own generous cap", async () => {
    mockSupabase({ recordCallsUsed: 200 });
    const resp = await onRequestPost({
      request: request({
        mode: "record",
        template: "local.cards",
        payload: { cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12 }] },
      }),
      env,
    });
    expect(resp.status).toBe(429);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(coachMessagePosts()).toHaveLength(0);
  });

  it("refuses a record from someone who is not paid", async () => {
    mockSupabase({ paid: false });
    const resp = await onRequestPost({
      request: request({ mode: "record", template: "local.noneFit" }),
      env,
    });
    expect(resp.status).toBe(403);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });
});

describe("ask persists the server's own reply", () => {
  it("writes the generated reply, not a client body", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "should I skip dinner",
        localDate: "2026-10-08",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.teach).toBe("neverSkip");
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].role).toBe("coach");
    expect(posts[0].source).toBe("server");
    expect(posts[0].body).toBe(data.reply);
    expect(posts[0].payload.teach).toBe("neverSkip");
  });

  it("defaults a missing localDate to the Pacific day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T01:05:00.000Z"));
    try {
      mockSupabase();
      const resp = await onRequestPost({
        request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
        env,
      });
      expect(resp.status).toBe(200);
      expect(coachMessagePosts()[0].local_date).toBe("2026-10-01");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still writes a medical refusal when she is already at the model cap", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
      env,
    });
    expect(resp.status).toBe(200);
    expect((await resp.json()).deflect).toBe("medical");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    expect(coachMessagePosts()).toHaveLength(1);
    expect(reserveTypes()).toEqual(["coach_note"]);
  });

  it("writes a model reply from its own output", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "The chicken bowl fits.",
      meals: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, desc: "Fits." }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "what can I make with leftover chicken tonight",
        localDate: "2026-10-08",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.reply).toBe("The chicken bowl fits.");
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].body).toBe("The chicken bowl fits.");
    expect(posts[0].kind).toBe("cards");
    expect(posts[0].payload.cards[0].name).toBe("Chicken bowl");
  });

  it("saves the plate sized as she would see it, not the raw model meal", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Two servings of the salmon.",
      meals: [{ name: "Salmon bowl", cal: 280, p: 28, c: 18, f: 10, desc: "Fits." }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "what can I make with leftover salmon tonight",
        budget: { cal: 700, pNeed: 50, c: 80, f: 30 },
        localDate: "2026-10-08",
      }),
      env,
    });
    expect(resp.status).toBe(200);
    const card = coachMessagePosts()[0].payload.cards[0];
    expect(card.servings).toBe(2);
    expect(card.title).toBe("Salmon bowl · 2 servings");
    expect(card.cal).toBe(560);
    expect(card.p).toBe(56);
  });
});

describe("cost", () => {
  it("does not cache a reply by requestId — a reuse still spends one model call", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "The chicken bowl fits.", meals: [] });
    const first = await onRequestPost({
      request: request({ mode: "ask", text: "dinner ideas", requestId: "ask-retry-1" }),
      env,
    });
    const second = await onRequestPost({
      request: request({ mode: "ask", text: "dinner ideas", requestId: "ask-retry-1" }),
      env,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(2);
  });

  it("mints a requestId when the client sends something other than a uuid or 8–64 ticket", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "dinner ideas", requestId: "ask-1<script>" }),
      env,
    });
    expect(resp.status).toBe(200);
    const stored = coachMessagePosts()[0].payload.requestId;
    expect(stored).not.toBe("ask-1<script>");
    expect(stored).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    const reserved = JSON.parse(postedCalls().find(([url]) => (
      String(url).includes("rpc/reserve_estimate_call")
    ))[1].body);
    expect(reserved.p_request_id).toBe(stored);
  });

  it("stops her at the daily cap", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "dinner ideas", requestId: "ask-rate-limit" }),
      env,
    });
    expect(resp.status).toBe(429);
    const data = await resp.json();
    expect(data.message).toMatch(/That's all the thinking I've got for today/);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].kind).toBe("cards");
    expect(posts[0].payload.cards.length).toBeGreaterThanOrEqual(2);
    expect(posts[0].request_id).toBe("ask-rate-limit");
    expect(posts[0].payload.requestId).toBe("ask-rate-limit");
  });

  it("does not cap Callie", async () => {
    mockSupabase({ role: "admin", callsUsed: 500 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(200);
  });

  it("treats a counter outage as model-down and does not show the daily-limit line", async () => {
    mockSupabase();
    const inner = globalThis.fetch.getMockImplementation();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("rpc/reserve_estimate_call") || (value.includes("estimate_calls") && init?.method !== "POST")) {
        return new Response("boom", { status: 500 });
      }
      return inner(url, init);
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(String(data.reply || data.message || "")).not.toMatch(/That's all the thinking I've got for today/);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("returns picks on 5 over-cap asks and saves at most one row", async () => {
    mockSupabase({ callsUsed: 30, customMeals: FILE.customMeals });
    const replies = [];
    for (let i = 0; i < 5; i += 1) {
      const resp = await onRequestPost({
        request: request({
          mode: "ask",
          text: "what should I have for dinner",
          requestId: `ask-over-cap-${i + 1}x`,
        }),
        env,
      });
      expect(resp.status).toBe(429);
      const data = await resp.json();
      replies.push(data);
      expect(data.meals.length).toBeGreaterThanOrEqual(2);
    }
    expect(replies).toHaveLength(5);
    expect(coachMessagePosts().filter((row) => row.payload?.limited)).toHaveLength(1);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("does not put her custom meal name in a Coach-labelled body", async () => {
    mockSupabase({
      callsUsed: 30,
      customMeals: [{ name: "Grandma's Secret Casserole XYZ", cal: 380, p: 32, c: 12, f: 18 }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "dinner ideas",
        requestId: "ask-saved-meal",
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(429);
    expect(data.reply).not.toMatch(/Grandma's Secret Casserole XYZ/);
    expect(data.meals.some((meal) => meal.fromSaved)).toBe(true);
    const post = coachMessagePosts()[0];
    expect(post.body).not.toMatch(/Grandma's Secret Casserole XYZ/);
    expect(post.payload.cards.some((card) => card.fromSaved)).toBe(true);
  });
});

describe("preview follow-ups and teach fills", () => {
  it("fills 2–3 breakfast plates when coffee teach also asks for food", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "can i have coffee while nursing? what should i eat with it in the morning",
        requestId: "ask-coffee-food",
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.teach).toBe("coffee");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(new Set(data.meals.map((meal) => meal.name)).size).toBe(data.meals.length);
    expect(data.meals.map((meal) => meal.name).join(" ")).toMatch(/egg|yogurt|toast|sausage|pancake|oat/i);
    expect(data.reply).toMatch(/Coffee is allowed/);
    expect(data.aside).toBeFalsy();
  });

  it("leads a supply drop with the warm line and 2–3 simple plates", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "i feel like my milk supply dropped",
        requestId: "ask-supply-warm",
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.deflect).toBe("supply");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(COACH_DEFLECT.supply.line).toBe(
      "I'm sorry, that's really stressful. Your supply always comes first. If you think it's dropping, message Callie and she'll get back to you. In the meantime, here are a few easy ones:",
    );
    expect(data.meals.every((meal) => meal.desc && meal.desc.toLowerCase() !== meal.name.toLowerCase())).toBe(true);
  });

  it("treats a kitchen note on a menu photo as home cooking", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "From the menu.",
      meals: [{ name: "Salmon salad", cal: 400, p: 35, c: 12, f: 18, desc: "Salmon salad", ingredients: [] }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "menu",
        text: "this is what's in my kitchen, what can i make tonight",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
        requestId: "ask-kitchen-infer",
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.mealSource).toBe("kitchen");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
  });

  it("excludes chicken after she said she is sick of it", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "",
      meals: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, desc: "Chicken." }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "something else",
        requestId: "ask-follow-dislike",
        context: {
          alreadySuggested: ["Chicken bowl"],
          priorAsks: ["I'm so sick of eggs and chicken"],
        },
      }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.reply).toBeTruthy();
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.meals.every((meal) => !/\bchicken\b/i.test(`${meal.name} ${meal.desc}`))).toBe(true);
  });
});

const ALLERGY_CASES = [
  { id: "dairy", leak: /yogurt|cheese|milk|whey|butter|cottage/i },
  { id: "eggs", leak: /\beggs?\b/i },
  { id: "peanuts", leak: /peanut/i },
  { id: "tree_nuts", leak: /\b(almond|cashew|walnut|pecan|hazelnut|pistachio)\b/i },
  { id: "shellfish", leak: /\b(shrimp|prawn|crab|lobster|shellfish)\b/i },
  { id: "fish", leak: /\b(salmon|tuna|halibut|cod|fish|tilapia)\b/i },
  { id: "gluten", leak: /\b(wheat|barley|rye|gluten|sourdough|bread|flour|pasta)\b/i },
  { id: "soy", leak: /\b(soy|tofu|tempeh|edamame)\b/i },
  { id: "sesame", leak: /\b(sesame|tahini)\b/i },
];
const DIET_CASES = [
  { diet: "vegetarian", leak: /\b(chicken|turkey|beef|pork|steak|sausage|salmon|tuna|fish|halibut)\b/i },
  { diet: "pescatarian", leak: /\b(chicken|turkey|beef|pork|steak|sausage)\b/i },
  { diet: "vegan", leak: /\b(chicken|turkey|beef|egg|yogurt|cheese|honey|salmon|fish)\b/i },
];

function hay(meal) {
  return `${meal?.name || ""} ${meal?.desc || ""} ${(meal?.ingredients || []).map((row) => row?.item || row).join(" ")}`;
}

describe("saved allergies and diets on every plate path", () => {
  async function askOnPath(path, { allergens = [], diet = "none", text = "dinner ideas" } = {}) {
    mockSupabase({
      callsUsed: path === "429" ? 30 : 0,
      profile: { ...FILE.profile, allergens, diet, food_avoids: "mushrooms" },
    });
    if (path === "down") {
      openrouter.callOpenRouter.mockResolvedValue({ ok: false, kind: "timeout", status: 504, detail: "down" });
      openrouter.parseJsonLoose.mockReturnValue({ ok: false });
    } else if (path === "normal") {
      modelReturns({
        scope: "food",
        reply: "Toast and peanut butter, or eggs and toast.",
        meals: [
          { name: "Toast and peanut butter", cal: 250, p: 10, c: 26, f: 12, desc: "Toast and peanut butter." },
          { name: "Eggs and toast", cal: 310, p: 18, c: 22, f: 14, desc: "Eggs and toast." },
          { name: "Salmon and rice", cal: 440, p: 38, c: 30, f: 14, desc: "Salmon and rice." },
        ],
      });
    }
    const asked = path === "teach"
      ? "can i have coffee while nursing? what should i eat with it in the morning"
      : path === "medical"
        ? "I've been dizzy since this morning, what should I eat"
        : path === "supply"
          ? "i feel like my milk supply dropped"
          : text;
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: asked, requestId: `ask-${path}-${allergens[0] || diet}` }),
      env,
    });
    return { resp, data: await resp.json() };
  }

  for (const path of ["429", "down", "teach", "medical", "supply", "normal"]) {
    for (const { id, leak } of ALLERGY_CASES) {
      it(`${path} drops ${id}`, async () => {
        const { data } = await askOnPath(path, { allergens: [id] });
        expect(data.meals?.length || 0).toBeGreaterThanOrEqual(1);
        expect(data.meals.every((meal) => !leak.test(hay(meal))), hay(data.meals?.[0])).toBe(true);
      });
    }
    for (const { diet, leak } of DIET_CASES) {
      it(`${path} honors ${diet}`, async () => {
        const { data } = await askOnPath(path, { diet });
        expect(data.meals?.length || 0).toBeGreaterThanOrEqual(1);
        expect(data.meals.every((meal) => !leak.test(hay(meal))), hay(data.meals?.[0])).toBe(true);
      });
    }
  }
});

describe("reviewer follow-ups", () => {
  it("fills food for the five leftover asks when the model is down", async () => {
    const asks = [
      "can I have tacos?",
      "what about a sandwich",
      "what's healthy at mcdonalds",
      "how many almonds can I have?",
      "help me plan tomorrow",
    ];
    for (const text of asks) {
      mockSupabase();
      openrouter.callOpenRouter.mockResolvedValue({ ok: false, kind: "timeout", status: 504, detail: "down" });
      const resp = await onRequestPost({ request: request({ mode: "ask", text, requestId: `ask-five-${text.slice(0, 8)}` }), env });
      const data = await resp.json();
      expect(resp.status, text).toBe(200);
      expect(data.meals.length, text).toBeGreaterThanOrEqual(2);
      expect(String(data.reply || data.message || ""), text).not.toBe("I can't think straight right now. Try again in a minute, or pick something from Meals.");
    }
  });

  it("returns the crisis line with no plates when the profile read throws", async () => {
    mockSupabase();
    const inner = globalThis.fetch.getMockImplementation();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("/rest/v1/profiles") && !value.includes("select=paid,refunded,role")) {
        throw new Error("profile boom");
      }
      return inner(url, init);
    });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I want to die", requestId: "ask-crisis-profile" }),
      env,
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.deflect).toBe("emergency");
    expect(data.meals).toEqual([]);
    expect(summaryPosts().length).toBeGreaterThanOrEqual(1);
  });

  it("returns no plates on every crisis path", async () => {
    const paths = [
      async () => {
        mockSupabase();
        return onRequestPost({ request: request({ mode: "ask", text: "I want to die", requestId: "ask-crisis-ask" }), env });
      },
      async () => {
        mockSupabase({ callsUsed: 30 });
        return onRequestPost({ request: request({ mode: "ask", text: "I want to die", requestId: "ask-crisis-429" }), env });
      },
      async () => {
        mockSupabase();
        openrouter.callOpenRouter.mockResolvedValue({ ok: false, kind: "timeout" });
        return onRequestPost({ request: request({ mode: "ask", text: "I want to die", requestId: "ask-crisis-down" }), env });
      },
    ];
    for (const run of paths) {
      const resp = await run();
      const data = await resp.json();
      expect(resp.status).toBe(200);
      expect(data.deflect).toBe("emergency");
      expect(data.meals).toEqual([]);
    }
  });

  it("hands disordered eating to Callie with number-free plates", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "I've been making myself throw up after meals",
        requestId: "ask-disordered",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.deflect).toBe("disordered");
    expect(data.noted).toBe(true);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.meals.every((meal) => meal.hideMacros && !meal.cal && !meal.p)).toBe(true);
    expect(COACH_DEFLECT.disordered.lineNoted).toBe(
      "I'm really glad you told me. I've added a note for Callie, and she'd love to hear from you directly too. Message her whenever you're ready. For now, here's something simple:",
    );
  });

  it("does not claim a Callie note when the pin write fails", async () => {
    mockSupabase({ refusalWrite: false });
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "I've been making myself throw up after meals",
        requestId: "ask-disordered-fail",
      }),
      env,
    });
    const data = await resp.json();
    expect(data.deflect).toBe("disordered");
    expect(data.noted).toBe(false);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(COACH_DEFLECT.disordered.line).toBe(
      "I'm really glad you told me. Callie would love to hear from you directly. Message her whenever you're ready. For now, here's something simple:",
    );
  });

  it("hides numbers on careful plates in no-logging mode", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({
        mode: "ask",
        text: "should I take ibuprofen",
        requestId: "ask-ibu-nolog",
        context: { notLogging: true },
      }),
      env,
    });
    const data = await resp.json();
    expect(data.deflect).toBe("medication");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(data.meals.every((meal) => meal.hideMacros && !meal.cal && !meal.p)).toBe(true);
  });

  it("hands a medication question to Callie with simple food, never off-topic", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "should I take ibuprofen", requestId: "ask-ibu" }),
      env,
    });
    const data = await resp.json();
    expect(data.deflect).toBe("medication");
    expect(data.deflect).not.toBe("offTopic");
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
    expect(COACH_DEFLECT.medication.line).toBe(
      "That one's for your doctor or pharmacist, not me. Let Callie know too so she can plan around it. Here's something easy in the meantime:",
    );
  });

  it("only adds the draft line when a plate follows and does not double curly apostrophes", async () => {
    const { leadFineTuningReply, COACH_FINE_TUNING_LINE } = await import("../../src/content/coachVoice.js");
    expect(leadFineTuningReply("", { hasPlates: false })).toBe("");
    expect(leadFineTuningReply("", { hasPlates: true })).toBe(COACH_FINE_TUNING_LINE);
    const curly = "Callie\u2019s still fine-tuning your numbers, so here\u2019s an easy one for now. Eggs.";
    expect(leadFineTuningReply(curly, { hasPlates: true })).not.toMatch(/fine-tuning your numbers.*fine-tuning your numbers/);
    expect(leadFineTuningReply(curly, { hasPlates: true })).toMatch(/Eggs/);
  });
});
