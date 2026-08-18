import { describe, expect, it } from "vitest";
import { renderEmail } from "./emailLayout.mjs";
import {
  buildUnsubscribeUrl,
  listUnsubscribeHeaders,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./emailUnsubscribe.mjs";

const env = { UNSUBSCRIBE_SECRET: "test-unsub-secret" };

describe("unsubscribe tokens", () => {
  it("accepts a matching signed token and rejects a tampered one", async () => {
    const token = await signUnsubscribeToken(env.UNSUBSCRIBE_SECRET, "Mama@Example.com");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyUnsubscribeToken(env.UNSUBSCRIBE_SECRET, "mama@example.com", token)).toBe(true);
    expect(await verifyUnsubscribeToken(env.UNSUBSCRIBE_SECRET, "other@example.com", token)).toBe(false);
    expect(await verifyUnsubscribeToken(env.UNSUBSCRIBE_SECRET, "mama@example.com", "ab")).toBe(false);
  });

  it("builds a www unsubscribe URL and List-Unsubscribe headers", async () => {
    const url = await buildUnsubscribeUrl(env, "mama@example.com");
    expect(url).toMatch(/^https:\/\/www\.macrosandmamas\.com\/api\/unsubscribe\?/);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("e")).toBe("mama@example.com");
    expect(await verifyUnsubscribeToken(
      env.UNSUBSCRIBE_SECRET,
      parsed.searchParams.get("e"),
      parsed.searchParams.get("t"),
    )).toBe(true);
    expect(listUnsubscribeHeaders(url)["List-Unsubscribe"]).toBe(`<${url}>`);
  });
});

describe("renderEmail unsubscribe footer", () => {
  it("omits the link when no URL is passed", () => {
    const html = renderEmail({ header: "Hi", body: "<p>Hello</p>" });
    expect(html).not.toMatch(/Unsubscribe/);
  });

  it("adds an unsubscribe link when given a https URL", () => {
    const html = renderEmail({
      header: "Hi",
      body: "<p>Hello</p>",
      unsubscribe_url: "https://www.macrosandmamas.com/api/unsubscribe?e=a&t=b",
    });
    expect(html).toMatch(/Unsubscribe from quiz emails/);
    expect(html).toContain("https://www.macrosandmamas.com/api/unsubscribe?e=a&amp;t=b");
  });
});
