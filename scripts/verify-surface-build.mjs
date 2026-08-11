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
const surface = process.env.APP_SURFACE || "combined";
if (!existsSync(assets)) throw new Error("dist/assets missing");

const files = readdirSync(assets);
const adminChunks = files.filter((name) => name.startsWith("AdminPortal-"));
const js = files
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(join(assets, name), "utf8"))
  .join("\n");

if (surface === "customer") {
  if (adminChunks.length || js.includes("./admin/AdminPortal") || js.includes("AdminPortal.jsx")) {
    throw new Error("customer artifact contains admin portal code");
  }
}

if (surface === "admin" && adminChunks.length !== 1) {
  throw new Error(`admin artifact expected one AdminPortal chunk, found ${adminChunks.length}`);
}

if (surface === "admin") {
  writeFileSync(
    join(dist, "_redirects"),
    "/ /admin 302\n/* /index.html 200\n",
  );
}

writeFileSync(
  join(dist, "surface-manifest.json"),
  JSON.stringify({
    surface,
    buildId: process.env.CF_PAGES_COMMIT_SHA || process.env.VITE_APP_BUILD_ID || "dev",
    adminChunkCount: adminChunks.length,
  }, null, 2),
);

console.log(`[surface] ${surface} verified; admin chunks=${adminChunks.length}`);

