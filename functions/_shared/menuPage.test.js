import { describe, expect, it, vi } from "vitest";

import {
  dishOnPage,
  fetchMenuPage,
  firstMenuLink,
  htmlToText,
  isBlockedMenuHost,
  MENU_FETCH_TIMEOUT_MS,
  MENU_MAX_BYTES,
} from "./menuPage.js";

const MENU = `<html><head><script>Jane Salad with Chicken</script><style>.x{color:red}</style></head>
<body><h1>Jane on Fillmore</h1>
<p>Chicken Taco Salad</p><p>Caesar Salad</p><p>Nicoise</p>
<p>Order at the counter. Dressings listed beside each plate.</p></body></html>`;

function htmlResponse(body, { status = 200, headers = { "content-type": "text/html" } } = {}) {
  return new Response(body, { status, headers });
}

describe("reading a menu page", () => {
  it("strips scripts so a dish named only in code is not on the menu", () => {
    const text = htmlToText(MENU);
    expect(text).toContain("Chicken Taco Salad");
    expect(text).not.toContain("Jane Salad");
    expect(dishOnPage("Chicken Taco Salad", text)).toBe(true);
    expect(dishOnPage("The Chicken Taco Salad", text)).toBe(true);
    expect(dishOnPage("Jane Salad with Chicken", text)).toBe(false);
    expect(dishOnPage("Rice", text)).toBe(false);
  });

  it("accepts a public https link and a www link", () => {
    expect(firstMenuLink("see https://www.itsjane.com/location/jane-on-fillmore/ please")).toBe(
      "https://www.itsjane.com/location/jane-on-fillmore/",
    );
    expect(firstMenuLink("www.itsjane.com/menu")).toBe("https://www.itsjane.com/menu");
  });

  it("refuses http, private, loopback, link-local, metadata, and credentialed hosts", () => {
    for (const url of [
      "http://www.itsjane.com/menu",
      "http://127.0.0.1/menu",
      "https://127.0.0.1/menu",
      "https://10.0.0.8/menu",
      "https://192.168.1.4/menu",
      "https://172.16.0.4/menu",
      "https://169.254.169.254/latest/meta-data",
      "https://100.100.100.200/latest/meta-data",
      "https://localhost/menu",
      "https://metadata/computeMetadata/v1/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://metadata.internal/latest",
      "https://instance-data/latest/meta-data",
      "https://[::1]/menu",
      "https://[::]/menu",
      "https://[fe80::1]/menu",
      "https://[fc00::1]/menu",
      "https://[fd00:ec2::254]/latest",
      "https://[::ffff:127.0.0.1]/menu",
      "https://[::ffff:169.254.169.254]/latest",
      "https://2130706433/menu",
      "https://user:pass@www.itsjane.com/menu",
      "file:///etc/passwd",
    ]) {
      expect(firstMenuLink(url), url).toBeNull();
    }
    expect(isBlockedMenuHost("fe80::1")).toBe(true);
    expect(isBlockedMenuHost("fd00:ec2::254")).toBe(true);
    expect(isBlockedMenuHost("www.itsjane.com")).toBe(false);
  });

  it("returns the page text when the site serves html", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(MENU));
    const page = await fetchMenuPage("https://www.itsjane.com/location/jane-on-fillmore/", fetchImpl);
    expect(page.ok).toBe(true);
    expect(page.text).toContain("Chicken Taco Salad");
    expect(dishOnPage("Jane Salad with Chicken", page.text)).toBe(false);
  });

  it("does not follow a redirect onto a private host", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/secret" },
    }));
    const page = await fetchMenuPage("https://www.itsjane.com/menu", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "redirect" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not call the network for a blocked url", async () => {
    const fetchImpl = vi.fn();
    const page = await fetchMenuPage("http://169.254.169.254/latest/meta-data", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "bad-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a script shell as an unreadable menu", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<html><body><div id='root'></div></body></html>"));
    const page = await fetchMenuPage("https://www.example.com/menu", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a response that is not a page", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("{}", {
      headers: { "content-type": "application/json" },
    }));
    const page = await fetchMenuPage("https://www.example.com/menu", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "type" });
  });

  it("uses a short timeout and refuses a body over the byte cap", async () => {
    expect(MENU_FETCH_TIMEOUT_MS).toBe(5_000);
    expect(MENU_MAX_BYTES).toBe(1_500_000);
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.signal).toBeDefined();
      return htmlResponse(MENU, {
        headers: { "content-type": "text/html", "content-length": String(MENU_MAX_BYTES + 1) },
      });
    });
    const page = await fetchMenuPage("https://www.example.com/menu", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "too-big" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not follow an http redirect even onto a public host", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://www.itsjane.com/menu" },
    }));
    const page = await fetchMenuPage("https://www.itsjane.com/menu", fetchImpl);
    expect(page).toEqual({ ok: false, reason: "redirect" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
