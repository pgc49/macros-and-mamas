import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LIVE_TABLE_COLUMNS, postgrestColumnsFromUrl } from "./postgrestFake.js";

function sourceUrls(src) {
  const urls = [];
  for (const match of String(src).matchAll(/`([^`]*\/rest\/v1\/[^`]+)`/g)) {
    urls.push(match[1]);
  }
  for (const match of String(src).matchAll(/"([^"]*\/rest\/v1\/[^"]+)"/g)) {
    urls.push(match[1]);
  }
  return urls;
}

describe("PostgREST columns in clientAiAccess and coach match live tables", () => {
  it("never orders or filters macros on created_at or id", () => {
    const access = readFileSync(new URL("./clientAiAccess.js", import.meta.url), "utf8");
    const coach = readFileSync(new URL("../api/coach.js", import.meta.url), "utf8");
    const src = `${access}\n${coach}`;
    expect(src).not.toMatch(/macros\?[^`"'\n]*order=created_at/);
    expect(src).not.toMatch(/macros\?[^`"'\n]*order=id/);
    const urls = sourceUrls(src);
    expect(urls.some((url) => url.includes("/rest/v1/macros"))).toBe(true);
    for (const url of urls) {
      const { table, columns } = postgrestColumnsFromUrl(url.replace(/\$\{[^}]+\}/g, "x"));
      const allowed = LIVE_TABLE_COLUMNS[table];
      if (!allowed) continue;
      for (const col of columns) {
        expect(allowed.has(col), `${table}.${col} from ${url}`).toBe(true);
      }
    }
  });
});
