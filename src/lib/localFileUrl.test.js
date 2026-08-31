import { describe, expect, it } from "vitest";
import { isLocalFileUrl } from "./localFileUrl.js";

const MAKAELA_SMS_PATH =
  "file:///var/mobile/Library/SMS/Attachments/ab/11/F53E021E-19F9-4635-B509-B5B88E1808F8/Macros%20and%20Mamas.png";

describe("isLocalFileUrl", () => {
  it("matches a file:// png URL", () => {
    expect(isLocalFileUrl("file:///tmp/photo.png")).toBe(true);
    expect(isLocalFileUrl("FILE://localhost/Users/mama/photo.PNG")).toBe(true);
  });

  it("matches the exact iOS Messages SMS attachment path", () => {
    expect(isLocalFileUrl(MAKAELA_SMS_PATH)).toBe(true);
    expect(isLocalFileUrl(MAKAELA_SMS_PATH.replace(/^file:\/\//, ""))).toBe(true);
  });

  it("ignores whitespace around a local file URL", () => {
    expect(isLocalFileUrl(`  ${MAKAELA_SMS_PATH}  \n`)).toBe(true);
    expect(isLocalFileUrl("\n/var/mobile/Library/SMS/Attachments/ab/11/x.png\t")).toBe(true);
  });

  it("does not block a real sentence", () => {
    expect(isLocalFileUrl("What's my protein goal for today?")).toBe(false);
    expect(isLocalFileUrl("I tried to send Macros and Mamas.png")).toBe(false);
    expect(isLocalFileUrl(`See this later ${MAKAELA_SMS_PATH}`)).toBe(false);
  });

  it("does not treat empty or caption-less bodies as local URLs", () => {
    expect(isLocalFileUrl("")).toBe(false);
    expect(isLocalFileUrl("   ")).toBe(false);
    expect(isLocalFileUrl(null)).toBe(false);
    expect(isLocalFileUrl(undefined)).toBe(false);
  });
});
