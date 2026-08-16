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
