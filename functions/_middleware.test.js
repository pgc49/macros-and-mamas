import { describe, expect, it } from "vitest";
import { adminOriginFromEnv, isAdminPath, onRequest } from "./_middleware.js";

function request(url) {
  return { request: new Request(url), env: {}, next: async () => new Response("ok") };
}

describe("admin origin helper", () => {
  it("defaults to the production admin host", () => {
    expect(adminOriginFromEnv({})).toBe("https://admin.macrosandmamas.com");
  });

  it("rejects non-https overrides", () => {
    expect(adminOriginFromEnv({ VITE_ADMIN_APP_URL: "http://evil.example" })).toBe(
      "https://admin.macrosandmamas.com",
    );
  });
});

describe("www /admin transfer", () => {
  it("sends www /admin to the admin origin and keeps the query", async () => {
    const response = await onRequest(
      request("https://www.macrosandmamas.com/admin?tab=messages&client=deana"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://admin.macrosandmamas.com/admin?tab=messages&client=deana",
    );
  });

  it("sends apex /admin straight to the admin origin", async () => {
    const response = await onRequest(request("https://macrosandmamas.com/admin/"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://admin.macrosandmamas.com/admin/");
  });

  it("does not bounce the admin origin itself", async () => {
    const response = await onRequest(request("https://admin.macrosandmamas.com/admin?tab=messages"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("still sends non-admin apex traffic to www", async () => {
    const response = await onRequest(request("https://macrosandmamas.com/dashboard?x=1"));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://www.macrosandmamas.com/dashboard?x=1");
  });

  it("leaves customer dashboard on www", async () => {
    const response = await onRequest(request("https://www.macrosandmamas.com/dashboard"));
    expect(response.status).toBe(200);
  });

  it("does not transfer Pages preview /admin", async () => {
    const response = await onRequest(
      request("https://abc.macros-and-mamas.pages.dev/admin?tab=messages"),
    );
    expect(response.status).toBe(200);
  });

  it("recognizes admin paths", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/dashboard")).toBe(false);
  });
});

describe("admin enrollment 302 to www", () => {
  it("sends admin /join to www /join and keeps the query", async () => {
    const response = await onRequest(
      request("https://admin.macrosandmamas.com/join?from=quiz&email=a%40b.com"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://www.macrosandmamas.com/join?from=quiz&email=a%40b.com",
    );
  });

  it("sends admin quiz handoff and checkout return to www", async () => {
    const quiz = await onRequest(
      request("https://admin.macrosandmamas.com/signin?from=quiz&auth=create"),
    );
    const welcome = await onRequest(
      request("https://admin.macrosandmamas.com/welcome?session_id=cs_123"),
    );
    const preview = await onRequest(
      request("https://deadbeef.macros-and-mamas-admin.pages.dev/join"),
    );
    expect(quiz.status).toBe(302);
    expect(quiz.headers.get("location")).toBe(
      "https://www.macrosandmamas.com/signin?from=quiz&auth=create",
    );
    expect(welcome.status).toBe(302);
    expect(welcome.headers.get("location")).toBe(
      "https://www.macrosandmamas.com/welcome?session_id=cs_123",
    );
    expect(preview.status).toBe(302);
    expect(preview.headers.get("location")).toBe("https://www.macrosandmamas.com/join");
  });

  it("leaves admin sign-in, reset-password, and /admin on admin", async () => {
    const signin = await onRequest(request("https://admin.macrosandmamas.com/signin"));
    const reset = await onRequest(request("https://admin.macrosandmamas.com/reset-password"));
    const admin = await onRequest(request("https://admin.macrosandmamas.com/admin"));
    expect(signin.status).toBe(200);
    expect(reset.status).toBe(200);
    expect(admin.status).toBe(200);
  });

  it("does not 302 POST /api/checkout on admin (session builder rewrites URLs)", async () => {
    const response = await onRequest({
      request: new Request("https://admin.macrosandmamas.com/api/checkout", { method: "POST" }),
      env: {},
      next: async () => new Response("ok"),
    });
    expect(response.status).toBe(200);
  });

  it("leaves www quiz / join / checkout unchanged", async () => {
    const join = await onRequest(request("https://www.macrosandmamas.com/join?from=quiz"));
    const quiz = await onRequest(request("https://www.macrosandmamas.com/signin?from=quiz"));
    const welcome = await onRequest(request("https://www.macrosandmamas.com/welcome"));
    expect(join.status).toBe(200);
    expect(quiz.status).toBe(200);
    expect(welcome.status).toBe(200);
  });
});
