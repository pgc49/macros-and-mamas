#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const assets = join(dist, "assets");
const viteManifestPath = join(dist, ".vite", "manifest.json");
const surface = process.env.APP_SURFACE || "combined";
if (!existsSync(assets)) throw new Error("dist/assets missing");

const files = readdirSync(assets);
if (!existsSync(viteManifestPath)) throw new Error("Vite bundle manifest missing");
const viteManifest = JSON.parse(readFileSync(viteManifestPath, "utf8"));
const manifestText = JSON.stringify(viteManifest);
const adminModuleRefs = (manifestText.match(/src\/admin\//g) || []).length;
const adminChunks = files.filter((name) => name.startsWith("AdminPortal-"));
const js = files
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(join(assets, name), "utf8"))
  .join("\n");

if (surface === "customer") {
  const adminUrl = new URL(
    process.env.VITE_ADMIN_APP_URL || "https://admin.macrosandmamas.com",
  );
  const allowedHosts = new Set([
    "admin.macrosandmamas.com",
    ...String(process.env.ADMIN_APP_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ]);
  if (
    adminUrl.protocol !== "https:"
    || adminUrl.username
    || adminUrl.password
    || !allowedHosts.has(adminUrl.hostname)
  ) {
    throw new Error(`unsafe VITE_ADMIN_APP_URL: ${adminUrl.toString()}`);
  }
  const customerUrl = new URL(
    process.env.CUSTOMER_APP_URL
      || process.env.CF_PAGES_URL
      || "https://www.macrosandmamas.com",
  );
  if (customerUrl.hostname === adminUrl.hostname) {
    throw new Error("admin redirect target cannot equal customer origin");
  }
  const maps = files
    .filter((name) => name.endsWith(".map"))
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
  if (
    adminChunks.length
    || adminModuleRefs
    || js.includes("./admin/AdminPortal")
    || js.includes("AdminPortal.jsx")
    || maps.includes("/src/admin/")
  ) {
    throw new Error("customer artifact contains admin portal code");
  }
}

if (surface === "admin" && (adminChunks.length !== 1 || adminModuleRefs < 1)) {
  throw new Error(
    `admin artifact expected AdminPortal module/chunk; modules=${adminModuleRefs} chunks=${adminChunks.length}`,
  );
}

if (surface === "admin") {
  const manifestPath = join(dist, "site.webmanifest");
  if (!existsSync(manifestPath)) throw new Error("site.webmanifest missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.name = "Macros and Mamas Admin";
  manifest.short_name = "M&M Admin";
  manifest.start_url = "/admin";
  manifest.scope = "/";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(dist, "_redirects"),
    "/ /admin 302\n",
  );
}

writeFileSync(
  join(dist, "surface-manifest.json"),
  JSON.stringify({
    surface,
    buildId: process.env.CF_PAGES_COMMIT_SHA || process.env.VITE_APP_BUILD_ID || "dev",
    adminChunkCount: adminChunks.length,
    adminModuleRefs,
    supabaseProjectRef: (() => {
      try {
        return new URL(process.env.VITE_SUPABASE_URL || "").hostname.split(".")[0] || "";
      } catch {
        return "";
      }
    })(),
  }, null, 2),
);

console.log(`[surface] ${surface} verified; admin chunks=${adminChunks.length}`);

