/**
 * Overlay the Astro marketing site onto the SPA dist/ for:
 *   - Production `main` (www cutover — Option C)
 *   - Marketing feature-branch previews
 *   - Local/forced runs via MARKETING_WWW_CUTOVER=1 or PREVIEW_MARKETING=1
 *
 * Production cutover (main):
 *   - Keeps www on the SPA Pages project (homescreen / PWA safe)
 *   - `/`, `/quiz`, `/waitlist`, `/_astro/*` → Astro static files
 *   - App routes (`/dashboard`, `/join`, …) → SPA shell at /app.html
 *   - Copies marketing Pages Functions into functions/ for /api/lead + /api/waitlist
 *
 * Do NOT move the www custom domain onto macrosandmamas-marketing.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const branch = process.env.CF_PAGES_BRANCH || "";
const forceCutover = process.env.MARKETING_WWW_CUTOVER === "1";
const forcePreview = process.env.PREVIEW_MARKETING === "1";
const isMain = branch === "main" || branch === "master";
const isPreviewBranch =
  branch.startsWith("cursor/full-marketing-execution") ||
  branch.startsWith("cursor/astro-marketing-homepage") ||
  branch.startsWith("cursor/ranges-quiz-lead") ||
  branch.startsWith("cursor/web-analytics-supabase") ||
  branch.startsWith("cursor/waitlist-cta-copy") ||
  branch.startsWith("cursor/enrollment-open") ||
  branch.startsWith("cursor/www-marketing-cutover");

const runCutover = forceCutover || isMain;
const runPreview = forcePreview || isPreviewBranch;

if (!runCutover && !runPreview) {
  console.log(`[overlay-marketing] skip (branch=${branch || "local"})`);
  process.exit(0);
}

const mode = runCutover ? "www-cutover" : "preview";
console.log(
  `[overlay-marketing] mode=${mode} branch=${branch || "local"}`,
);

const marketingDir = join(root, "marketing");
const marketingDist = join(marketingDir, "dist");
const out = join(root, "dist");
const spaShell = join(out, "app.html");
const spaIndex = join(out, "index.html");

const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
  cwd: marketingDir,
  stdio: "inherit",
  env: process.env,
});
if (install.status !== 0) process.exit(install.status ?? 1);

const buildEnv = { ...process.env };
if (runCutover) {
  // www should be indexable; enrollment mode comes from marketing/wrangler.toml
  delete buildEnv.PUBLIC_NOINDEX;
} else {
  buildEnv.PUBLIC_NOINDEX = "true";
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: marketingDir,
  stdio: "inherit",
  env: buildEnv,
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(marketingDist) || !existsSync(out)) {
  console.error("[overlay-marketing] missing marketing/dist or dist/");
  process.exit(1);
}

if (!existsSync(spaIndex)) {
  console.error("[overlay-marketing] missing SPA dist/index.html");
  process.exit(1);
}

// Preserve the Vite SPA shell under /app.html before Astro replaces index.html.
try {
  unlinkSync(spaShell);
} catch {
  /* ok */
}
renameSync(spaIndex, spaShell);
console.log("[overlay-marketing] SPA shell → dist/app.html");

cpSync(marketingDist, out, { recursive: true });
console.log("[overlay-marketing] Astro site overlaid onto dist/");

// Ensure SPA shell survived the overlay (Astro should not emit app.html).
if (!existsSync(spaShell)) {
  console.error("[overlay-marketing] dist/app.html missing after overlay");
  process.exit(1);
}
if (!existsSync(join(out, "index.html"))) {
  console.error("[overlay-marketing] marketing index.html missing after overlay");
  process.exit(1);
}

// Marketing quiz + waitlist APIs must run on the SPA project (www origin).
copyMarketingFunctions();

// Static assets win over plain 200 rewrites on Pages: `/` and `/quiz` stay Astro.
// Unknown paths ( /dashboard, /join, … ) rewrite to the SPA shell.
const redirectsPath = join(out, "_redirects");
writeFileSync(
  redirectsPath,
  [
    "# www cutover: marketing static files + SPA shell for app routes",
    "# Do NOT use /* → /index.html — index.html is the Astro homepage.",
    "https://macrosandmamas.com/* https://www.macrosandmamas.com/:splat 301",
    "/*    /app.html   200",
    "",
  ].join("\n"),
);
console.log("[overlay-marketing] wrote dist/_redirects (SPA → /app.html)");

console.log(`[overlay-marketing] done (${mode})`);

function copyMarketingFunctions() {
  const pairs = [
    [
      join(marketingDir, "functions/api/lead.ts"),
      join(root, "functions/api/lead.ts"),
    ],
    [
      join(marketingDir, "functions/api/waitlist.ts"),
      join(root, "functions/api/waitlist.ts"),
    ],
  ];
  for (const [from, to] of pairs) {
    if (!existsSync(from)) {
      console.error(`[overlay-marketing] missing ${from}`);
      process.exit(1);
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    console.log(
      `[overlay-marketing] functions ← ${from.replace(root + "/", "")}`,
    );
  }
  // marketing/functions/_shared re-exports ../../src/lib (marketing-relative).
  // On the SPA project the engine lives under marketing/src/lib — write the
  // correct re-export for root functions/.
  const engineShim = join(root, "functions/_shared/rangesEngine.mjs");
  writeFileSync(
    engineShim,
    "/** Re-export canonical quiz engine for SPA Pages Functions (www cutover). */\n" +
      "export * from '../../marketing/src/lib/rangesEngine.mjs';\n",
  );
  console.log("[overlay-marketing] functions/_shared/rangesEngine.mjs → marketing/src/lib");
}
