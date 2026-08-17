/**
 * Overlay the Astro marketing site onto the SPA dist/ for:
 *   - Production `main` (www cutover — Option C)
 *   - Marketing feature-branch previews
 *   - Local/forced runs via MARKETING_WWW_CUTOVER=1 or PREVIEW_MARKETING=1
 *
 * Production cutover (main):
 *   - Keeps www on the SPA Pages project (homescreen / PWA safe)
 *   - `/`, `/quiz`, `/waitlist`, `/_astro/*` → Astro static files
 *   - App routes get a real copy of the Vite shell at /{route}/index.html
 *     (avoids CF turning 200 rewrites into 308 redirects to a shared /spa/)
 *   - Nested app paths use same-folder rewrites (/dashboard/* → /dashboard/index.html)
 *   - Copies marketing Pages Functions into functions/ for /api/lead + /api/waitlist
 *
 * Do NOT move the www custom domain onto macrosandmamas-marketing.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.APP_SURFACE === "admin") {
  console.log("[overlay-marketing] skip for isolated admin surface");
  process.exit(0);
}
const branch = process.env.CF_PAGES_BRANCH || "";
const forceCutover = process.env.MARKETING_WWW_CUTOVER === "1";
const forcePreview = process.env.PREVIEW_MARKETING === "1";
const isMain = branch === "main" || branch === "master";
// All feature-branch previews should match production's Astro landing page.
// (Previously only marketing-named branches got the overlay, so app PRs showed
// the old Vite SPA homepage at `/` — confusing when testing against prod UX.)
const isPreviewBranch = branch.startsWith("cursor/");

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
const spaIndex = join(out, "index.html");

/** Top-level SPA client routes from src/routing.js (not `/`, not marketing). */
const ALL_SPA_ROUTES = [
  "home",
  "join",
  "welcome",
  "goodbye",
  "onboarding",
  "signin",
  "pending",
  "declined",
  "dashboard",
  "admin",
  "terms",
  "privacy",
  "reset-password",
  "support",
  "account",
];
const customerSurface = process.env.APP_SURFACE === "customer";
const SPA_ROUTES = customerSurface
  ? ALL_SPA_ROUTES.filter((route) => route !== "admin")
  : ALL_SPA_ROUTES;
const ADMIN_ORIGIN = String(process.env.VITE_ADMIN_APP_URL || "https://admin.macrosandmamas.com")
  .trim()
  .replace(/\/$/, "") || "https://admin.macrosandmamas.com";

const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
  cwd: marketingDir,
  stdio: "inherit",
  env: process.env,
});
if (install.status !== 0) process.exit(install.status ?? 1);

const buildEnv = { ...process.env };
if (runCutover) {
  delete buildEnv.PUBLIC_NOINDEX;
} else {
  buildEnv.PUBLIC_NOINDEX = "true";
}
if (!buildEnv.PUBLIC_META_PIXEL_ID) {
  buildEnv.PUBLIC_META_PIXEL_ID =
    buildEnv.VITE_META_PIXEL_ID || "1078367721716098";
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

const spaShellHtml = readFileSync(spaIndex, "utf8");

// Remove broken cutover leftovers before overlay.
for (const stale of ["app.html", "spa", "_app"]) {
  const p = join(out, stale);
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {
    try {
      unlinkSync(p);
    } catch {
      /* ok */
    }
  }
}

cpSync(marketingDist, out, { recursive: true });
console.log("[overlay-marketing] Astro site overlaid onto dist/");

if (!existsSync(join(out, "404.html"))) {
  console.warn("[overlay-marketing] missing 404.html — CF may SPA-fallback unknown URLs to /");
} else {
  console.log("[overlay-marketing] 404.html present (disables CF SPA fallback)");
}

// Belt-and-suspenders: tiny redirect shell so stale /spa caches can't linger as app HTML.
mkdirSync(join(out, "spa"), { recursive: true });
writeFileSync(
  join(out, "spa", "index.html"),
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/dashboard/"><link rel="canonical" href="/dashboard/"><title>Redirecting…</title><script>location.replace("/dashboard/")</script><p><a href="/dashboard/">Continue to dashboard</a></p>\n`,
);
console.log("[overlay-marketing] planted /spa/index.html redirect shim");

// Marketing ships a default Astro favicon.svg — restore brand icons from SPA public/.
for (const icon of [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "favicon-16.png",
  "favicon-32.png",
  "apple-touch-icon-v6.png",
]) {
  const from = join(root, "public", icon);
  const to = join(out, icon);
  if (existsSync(from)) {
    cpSync(from, to);
  }
}
console.log("[overlay-marketing] restored brand favicons from public/");

try {
  unlinkSync(join(out, "app.html"));
} catch {
  /* ok */
}

if (!existsSync(join(out, "index.html"))) {
  console.error("[overlay-marketing] marketing index.html missing after overlay");
  process.exit(1);
}

// Plant SPA shell at each app route so /dashboard stays /dashboard (no 308 to /spa/).
for (const route of SPA_ROUTES) {
  const dir = join(out, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), spaShellHtml);
}
console.log(
  `[overlay-marketing] planted SPA shell in ${SPA_ROUTES.length} route folders`,
);

copyMarketingFunctions();

const redirectLines = [
  "# www cutover: Astro at /; SPA shells planted per app route folder.",
  "# Nested paths rewrite to the same-folder index (keeps URL prefix).",
  "https://macrosandmamas.com/* https://www.macrosandmamas.com/:splat 301",
  "# Clean up broken cutover leftovers (force over any stale static /spa).",
  "/spa /dashboard/ 302!",
  "/spa/ /dashboard/ 302!",
  "/spa/* /dashboard/ 302!",
  "/app /dashboard/ 302!",
  "/app/ /dashboard/ 302!",
  "/app.html /dashboard/ 302!",
];
if (customerSurface) {
  redirectLines.push(
    `# Isolated admin origin — do not plant an /admin SPA shell on customer.`,
    `/admin ${ADMIN_ORIGIN}/admin 302`,
    `/admin/ ${ADMIN_ORIGIN}/admin/ 302`,
    `/admin/* ${ADMIN_ORIGIN}/admin/:splat 302`,
  );
}
for (const route of SPA_ROUTES) {
  // Prefer /dashboard/ folder indexes; help clear bad edge redirects.
  redirectLines.push(`/${route} /${route}/ 302`);
  redirectLines.push(`/${route}/* /${route}/index.html 200`);
}
redirectLines.push("");

writeFileSync(join(out, "_redirects"), redirectLines.join("\n"));
console.log("[overlay-marketing] wrote dist/_redirects (nested SPA rewrites only)");

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
    [
      join(marketingDir, "functions/_shared/metaPixelId.js"),
      join(root, "functions/_shared/metaPixelId.js"),
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
  const engineShim = join(root, "functions/_shared/rangesEngine.mjs");
  writeFileSync(
    engineShim,
    "/** Re-export canonical quiz engine for SPA Pages Functions (www cutover). */\n" +
      "export * from '../../marketing/src/lib/rangesEngine.mjs';\n",
  );
  console.log(
    "[overlay-marketing] functions/_shared/rangesEngine.mjs → marketing/src/lib",
  );
  const emailShim = join(root, "functions/_shared/emailLayout.mjs");
  writeFileSync(
    emailShim,
    "/** Re-export branded email layout for SPA Pages Functions (www cutover). */\n" +
      "export * from '../../marketing/src/lib/emailLayout.mjs';\n",
  );
  console.log(
    "[overlay-marketing] functions/_shared/emailLayout.mjs → marketing/src/lib",
  );
}
