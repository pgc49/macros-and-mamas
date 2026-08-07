/**
 * On Cloudflare Pages preview builds for the marketing PR branch only,
 * build the Astro marketing site and overlay it onto Vite dist/ so the
 * preview URL shows the homepage. Production / main is untouched.
 */
import { cpSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const branch = process.env.CF_PAGES_BRANCH || "";
const force = process.env.PREVIEW_MARKETING === "1";
const match =
  force ||
  branch.startsWith("cursor/full-marketing-execution") ||
  branch.startsWith("cursor/astro-marketing-homepage");

if (!match) {
  console.log(`[preview-marketing] skip (branch=${branch || "local"})`);
  process.exit(0);
}

const root = process.cwd();
const marketingDir = join(root, "marketing");
const marketingDist = join(marketingDir, "dist");
const out = join(root, "dist");

console.log(`[preview-marketing] building Astro site for branch ${branch || "local"}`);
const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
  cwd: marketingDir,
  stdio: "inherit",
  env: process.env,
});
if (install.status !== 0) process.exit(install.status ?? 1);

const build = spawnSync("npm", ["run", "build"], {
  cwd: marketingDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PUBLIC_ENROLLMENT_MODE: "open",
    PUBLIC_NOINDEX: "true",
  },
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(marketingDist) || !existsSync(out)) {
  console.error("[preview-marketing] missing marketing/dist or dist/");
  process.exit(1);
}

cpSync(marketingDist, out, { recursive: true });

// SPA public/_redirects uses /* → /index.html which would break /waitlist.
// Replace with apex→www only (same as production SPA) for this preview overlay.
const redirectsPath = join(out, "_redirects");
try {
  unlinkSync(redirectsPath);
} catch {
  /* ok if missing */
}
writeFileSync(
  redirectsPath,
  "https://macrosandmamas.com/* https://www.macrosandmamas.com/:splat 301\n",
);

console.log("[preview-marketing] overlaid Astro marketing site onto dist/ (preview only)");
