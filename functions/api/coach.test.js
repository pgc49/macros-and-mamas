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

function mockSupabase({
  paid = true,
  role = "client",
  macros = true,
  callsUsed = 0,
  recordCallsUsed = 0,
  thread = [],
  pages = null,
  profile = null,
  macrosRow = null,
  customMeals = [],
} = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
    }
    if (value.includes("select=paid,refunded,role")) {
      return new Response(JSON.stringify([{ paid, refunded: false, role }]), { status: 200 });
    }
    if (value.includes("estimate_calls") && init?.method !== "POST") {
      const used = value.includes("type=eq.coach_record") ? recordCallsUsed : callsUsed;
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
      const row = macrosRow || { cal: 1750, protein: 140, carbs: 160, fat: 55 };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (value.includes("custom_meals")) return new Response(JSON.stringify(customMeals), { status: 200 });
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
    String(url).includes("estimate_calls") && init?.method === "POST"
  ));
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

  it("waits for Callie to approve her ranges", async () => {
    mockSupabase({ macros: false });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat" }), env });
    expect(resp.status).toBe(409);
    expect((await resp.json()).error).toBe("macros_required");
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
    expect(data.deflect).toBe("care");
    expect(data.meals).toEqual([]);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
    const posts = coachMessagePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toBe("server");
    expect(posts[0].kind).toBe("deflect");
    expect(posts[0].payload.deflect).toBe("care");
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
    expect(data.scope).toBe("off_topic");
    expect(data.meals).toEqual([]);
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
    expect(data.meals).toEqual([]);
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
    expect(data.meals).toEqual([]);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
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
    expect(data.meals).toHaveLength(1);
    expect(data.meals[0].name).toBe("Real bowl");
  });

  it("drops a reply that quotes her ranges back", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "Your ranges are 1750-1900 calories, so eat light.", meals: [] });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect((await resp.json()).reply).toBe("");
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
    expect(data.meals).toEqual([]);
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
    expect(postedCalls()).toHaveLength(1);
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
    expect(data.meals).toEqual([]);
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
      expect((await dizzy.json()).deflect).toBe("care");
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
    expect((await dizzy.json()).deflect).toBe("care");
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
    expect((await repeat.json()).deflect).toBe("care");
    expect(posts).toHaveLength(1);
  });

  it("appends a stuck brief on the third pain teach and does not wipe the seed", async () => {
    const posts = summaryFetch({
      thread: [
        { role: "coach", payload: { teach: "neverSkip" } },
        { role: "coach", payload: { teach: "neverSkip" } },
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

  it("does not turn a model handoff into a summary", async () => {
    mockSupabase();
    modelReturns({ scope: "callie", reply: "You should talk to someone about this feeling.", meals: [] });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "what should I eat before my run" }),
      env,
    });
    expect((await resp.json()).deflect).toBe("offTopic");
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
    expect(posts[0].source).toBe("server");
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

  it("does not write a refusal when she is already at the cap", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy since this morning" }),
      env,
    });
    expect(resp.status).toBe(429);
    expect(coachMessagePosts()).toHaveLength(0);
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
});

describe("cost", () => {
  it("stops her at the daily cap", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(429);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("does not cap Callie", async () => {
    mockSupabase({ role: "admin", callsUsed: 500 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(200);
  });

  it("refuses rather than uncapping when the counter is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
      if (value.includes("select=paid,refunded,role")) {
        return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
      }
      if (value.includes("estimate_calls") && init?.method !== "POST") return new Response("boom", { status: 500 });
      return new Response("[]", { status: 200 });
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(429);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });
});
