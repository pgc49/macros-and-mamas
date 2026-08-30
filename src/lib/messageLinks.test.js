import { describe, expect, it } from "vitest";
import { hrefForMessageUrl, splitLinkedMessageText } from "./messageLinks.js";

const YT = "https://youtu.be/EDjE15Ktzcs?si=abc";

describe("hrefForMessageUrl", () => {
  it("keeps http and https", () => {
    expect(hrefForMessageUrl("https://youtu.be/EDjE15Ktzcs")).toBe("https://youtu.be/EDjE15Ktzcs");
    expect(hrefForMessageUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("prefixes bare youtu.be with https", () => {
    expect(hrefForMessageUrl("youtu.be/EDjE15Ktzcs")).toBe("https://youtu.be/EDjE15Ktzcs");
  });

  it("rejects non-http schemes", () => {
    expect(hrefForMessageUrl("javascript:alert(1)")).toBe("");
  });
});

describe("splitLinkedMessageText", () => {
  it("returns empty for blank input", () => {
    expect(splitLinkedMessageText("")).toEqual([]);
    expect(splitLinkedMessageText(null)).toEqual([]);
  });

  it("leaves plain text as a single text part", () => {
    expect(splitLinkedMessageText("Hey mama")).toEqual([
      { type: "text", value: "Hey mama" },
    ]);
  });

  it("linkifies https youtu.be with query string", () => {
    expect(splitLinkedMessageText(`Watch this ${YT} tonight`)).toEqual([
      { type: "text", value: "Watch this " },
      { type: "link", value: YT, href: YT },
      { type: "text", value: " tonight" },
    ]);
  });

  it("linkifies a URL that is the whole body", () => {
    expect(splitLinkedMessageText(YT)).toEqual([
      { type: "link", value: YT, href: YT },
    ]);
  });

  it("peels trailing punctuation off the href", () => {
    const href = hrefForMessageUrl("https://example.com/a");
    expect(splitLinkedMessageText("See https://example.com/a.")).toEqual([
      { type: "text", value: "See " },
      { type: "link", value: "https://example.com/a", href },
      { type: "text", value: "." },
    ]);
  });

  it("does not rewrite the source string — only splits for display", () => {
    const body = `Callie posted ${YT}`;
    const parts = splitLinkedMessageText(body);
    expect(parts.map((p) => p.value).join("")).toBe(body);
  });
});
