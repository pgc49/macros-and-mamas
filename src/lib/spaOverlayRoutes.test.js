import { describe, expect, it } from "vitest";
import { MARKETING_OWNED_PATHS, PATHS } from "./appPaths";
import {
  ALL_SPA_ROUTES,
  spaOverlayFoldersFromPaths,
} from "./spaOverlayRoutes";
import { PATHS as routingPaths } from "../routing";

describe("spa overlay routes", () => {
  it("keeps routing PATHS and appPaths PATHS in lockstep", () => {
    expect(routingPaths).toEqual(PATHS);
  });

  it("plants every non-marketing PATHS folder, including nested account shells", () => {
    const folders = spaOverlayFoldersFromPaths(PATHS);
    for (const value of Object.values(PATHS)) {
      if (MARKETING_OWNED_PATHS.has(value)) continue;
      expect(folders).toContain(value.replace(/^\//, ""));
    }
    expect(folders).toContain("account/profile");
    expect(folders).toContain("account/payments");
    expect(folders).toContain("account/share");
    expect(folders).toContain("membership");
    expect(folders).not.toContain("waitlist");
  });

  it("ALL_SPA_ROUTES cannot drift from PATHS", () => {
    expect(ALL_SPA_ROUTES).toEqual(spaOverlayFoldersFromPaths(PATHS));
  });

  it("lists nested folders before their parents so _redirects matches first", () => {
    const idxProfile = ALL_SPA_ROUTES.indexOf("account/profile");
    const idxAccount = ALL_SPA_ROUTES.indexOf("account");
    expect(idxProfile).toBeGreaterThan(-1);
    expect(idxAccount).toBeGreaterThan(-1);
    expect(idxProfile).toBeLessThan(idxAccount);
  });
});
