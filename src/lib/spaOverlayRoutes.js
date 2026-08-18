import { MARKETING_OWNED_PATHS, PATHS } from "./appPaths.js";

/** Cold-load aliases that live in the SPA router but are not PATHS values. */
export const EXTRA_SPA_FOLDERS = ["home"];

/**
 * Folder paths to plant as Vite SPA shells after the Astro overlay.
 * Nested PATHS (e.g. /account/payments) must be real folders — Cloudflare
 * serves Astro 404.html instead of parent-folder 200 rewrites.
 * Deeper paths first so _redirects matches /account/profile before /account/*.
 */
export function spaOverlayFoldersFromPaths(paths = PATHS) {
  const folders = [];
  for (const value of Object.values(paths)) {
    if (typeof value !== "string" || !value.startsWith("/")) continue;
    if (MARKETING_OWNED_PATHS.has(value)) continue;
    folders.push(value.replace(/^\//, ""));
  }
  for (const extra of EXTRA_SPA_FOLDERS) {
    if (!folders.includes(extra)) folders.push(extra);
  }
  return [...new Set(folders)].sort((a, b) => {
    const depth = b.split("/").length - a.split("/").length;
    if (depth) return depth;
    return a.localeCompare(b);
  });
}

export const ALL_SPA_ROUTES = spaOverlayFoldersFromPaths();
