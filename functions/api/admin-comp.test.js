import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contact: vi.fn(),
  welcome: vi.fn(),
  cohort: vi.fn(),
}));

vi.mock("../_shared/supabaseEmail.js", () => ({
  loadUserContact: mocks.contact,
  sendWelcomeMamaEmail: mocks.welcome,
}));

vi.mock("../_shared/channels.js", () => ({
  handlePaidEnrollmentChannel: mocks.cohort,
}));

import { onRequestPost } from "./admin-comp.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "00000000-0000-4000-8000-000000000010";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
};

function request(body, { token = "admin-token" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://admin.macrosandmamas.com/api/admin-comp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function mockAuthAndPatch({ role = "admin", patched = { comp: true, paid: true } } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: ADMIN_ID }), { status: 200 });
    }
    if (value.includes("/rest/v1/profiles?id=eq.") && value.includes("select=role")) {
      return new Response(JSON.stringify([{ role }]), { status: 200 });
    }
    if (value.includes(`/rest/v1/profiles?id=eq.${CLIENT_ID}`) && options.method === "PATCH") {
      return new Response(JSON.stringify([patched]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.contact.mockResolvedValue({
    email: "mama@example.com",
    name: null,
    profile: { id: CLIENT_ID, name: null },
  });
  mocks.welcome.mockResolvedValue({ ok: true });
  mocks.cohort.mockResolvedValue({ label: "2026-08" });
});

describe("POST /api/admin-comp", () => {
  it("rejects missing auth", async () => {
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: true }, { token: "" }),
      env,
    });
    expect(res.status).toBe(401);
    expect(mocks.welcome).not.toHaveBeenCalled();
  });

  it("rejects a non-admin", async () => {
    mockAuthAndPatch({ role: "client" });
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: true }),
      env,
    });
    expect(res.status).toBe(403);
    expect(mocks.welcome).not.toHaveBeenCalled();
  });

  it("requires clientId and a boolean comp flag", async () => {
    mockAuthAndPatch();
    const missingId = await onRequestPost({
      request: request({ comp: true }),
      env,
    });
    expect(missingId.status).toBe(400);

    const missingComp = await onRequestPost({
      request: request({ clientId: CLIENT_ID }),
      env,
    });
    expect(missingComp.status).toBe(400);
    expect(mocks.welcome).not.toHaveBeenCalled();
  });

  it("marks complimentary, sets paid, and sends the welcome once", async () => {
    mockAuthAndPatch({ patched: { comp: true, paid: true } });
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: true, name: "Brittany" }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      comp: true,
      paid: true,
      welcome: "sent",
      cohort_label: "2026-08",
    });
    expect(mocks.cohort).toHaveBeenCalledWith(env, CLIENT_ID);

    const patchCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(patchCall[1].body)).toEqual({ comp: true, paid: true });
    expect(JSON.parse(patchCall[1].body)).not.toHaveProperty("stripe_customer_id");
    expect(JSON.parse(patchCall[1].body)).not.toHaveProperty("paid_at");

    expect(mocks.welcome).toHaveBeenCalledWith(env, {
      email: "mama@example.com",
      name: "Brittany",
      userId: CLIENT_ID,
      source: "comp",
    });
  });

  it("prefers the profile name over the roster fallback", async () => {
    mockAuthAndPatch();
    mocks.contact.mockResolvedValue({
      email: "mama@example.com",
      name: "Profile Name",
      profile: { id: CLIENT_ID, name: "Profile Name" },
    });
    await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: true, name: "Roster Name" }),
      env,
    });
    expect(mocks.welcome).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ name: "Profile Name" }),
    );
  });

  it("does not send welcome when clearing complimentary", async () => {
    mockAuthAndPatch({ patched: { comp: false, paid: true } });
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: false }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      comp: false,
      paid: true,
      welcome: "skipped",
      cohort_label: null,
    });
    const patchCall = globalThis.fetch.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(patchCall[1].body)).toEqual({ comp: false });
    expect(mocks.welcome).not.toHaveBeenCalled();
    expect(mocks.cohort).not.toHaveBeenCalled();
  });

  it("keeps the seat when the welcome was already sent", async () => {
    mockAuthAndPatch({ patched: { comp: true, paid: true } });
    mocks.welcome.mockResolvedValue({ ok: false, skipped: "already_sent" });
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, comp: true }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      comp: true,
      paid: true,
      welcome: "already_sent",
      cohort_label: "2026-08",
    });
    expect(mocks.cohort).toHaveBeenCalledWith(env, CLIENT_ID);
  });
});
