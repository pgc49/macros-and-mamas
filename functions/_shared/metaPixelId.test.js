import { describe, expect, it } from "vitest";
import {
  DEFAULT_META_PIXEL_ID,
  resolveMetaPixelId,
} from "./metaPixelId.js";

describe("resolveMetaPixelId", () => {
  it("uses the live Macros and Mamas pixel when env is empty", () => {
    expect(DEFAULT_META_PIXEL_ID).toBe("1078367721716098");
    expect(resolveMetaPixelId({})).toBe("1078367721716098");
    expect(resolveMetaPixelId(undefined)).toBe("1078367721716098");
  });

  it("lets Cloudflare env override the default", () => {
    expect(resolveMetaPixelId({ META_PIXEL_ID: " 999 " })).toBe("999");
  });
});
