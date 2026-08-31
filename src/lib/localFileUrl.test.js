import { describe, expect, it } from "vitest";
import { isLocalFilePaste, isLocalFileUrl } from "./localFileUrl";

describe("isLocalFileUrl", () => {
  it("matches file:// and iOS SMS attachment paths", () => {
    expect(isLocalFileUrl("file:///Users/me/recipe.pdf")).toBe(true);
    expect(isLocalFileUrl("FILE://localhost/tmp/photo.jpg")).toBe(true);
    expect(isLocalFileUrl("/var/mobile/Library/SMS/Attachments/xx/IMG_1.jpg")).toBe(true);
    expect(isLocalFileUrl("/private/var/mobile/Library/SMS/Attachments/xx/IMG_1.jpg")).toBe(true);
  });

  it("does not match a filename mentioned in normal text", () => {
    expect(isLocalFileUrl("cookies.pdf")).toBe(false);
    expect(isLocalFileUrl("https://example.com/recipe")).toBe(false);
    expect(isLocalFileUrl("")).toBe(false);
  });
});

describe("isLocalFilePaste", () => {
  it("fails only when the whole trimmed body is a local path", () => {
    expect(isLocalFilePaste("  file:///Users/me/chili.txt  ")).toBe(true);
    expect(isLocalFilePaste("/var/mobile/Library/SMS/Attachments/aa/IMG_9.heic")).toBe(true);
  });

  it("does not block a recipe that merely mentions a filename", () => {
    expect(isLocalFilePaste("Turkey chili\n2 lb ground turkey\nsee chili.pdf")).toBe(false);
    expect(isLocalFilePaste("file:///tmp/x.txt\n2 lb turkey")).toBe(false);
    expect(isLocalFilePaste("2 cups flour and cookies.pdf")).toBe(false);
  });
});
