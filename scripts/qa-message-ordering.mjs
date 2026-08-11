#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { chronologicalMessages } from "../src/lib/messageOrdering.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rows = [
  { id: "c", created_at: "2026-08-10T10:02:00Z", body: "latest" },
  { id: "b", created_at: "2026-08-10T10:01:00Z", body: "second" },
  { id: "a", created_at: "2026-08-10T10:01:00Z", body: "first tie" },
  { id: "b", created_at: "2026-08-10T10:01:00Z", body: "second reconciled" },
  null,
  { body: "missing id" },
];

const ordered = chronologicalMessages(rows);
assert(ordered.length === 3, "dedupes IDs and skips malformed rows");
assert(ordered.map((row) => row.id).join(",") === "a,b,c", "stable chronological order");
assert(ordered[1].body === "second reconciled", "newest reconciliation wins by ID");

const dbSource = readFileSync(new URL("../src/db/db.js", import.meta.url), "utf8");
assert(
  dbSource.includes('.rpc("load_admin_message_inbox")'),
  "admin inbox must use server-side latest-per-thread query",
);
assert(
  (dbSource.match(/\.order\("created_at", \{ ascending: false \}\)/g) || []).length >= 3,
  "message queries must request newest rows first",
);

console.log("qa:message-ordering OK");

