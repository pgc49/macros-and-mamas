#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  chronologicalMessages,
  mergeMessagesById,
} from "../src/lib/messageOrdering.js";

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
assert(ordered[1].body === "second", "newest-first database duplicate wins by ID");

const merged = mergeMessagesById(ordered, [
  {
    id: "b",
    created_at: "2026-08-10T10:01:00Z",
    body: "authoritative refresh",
    reply_to: { id: "parent", missing: true },
  },
  { id: "d", created_at: "2026-08-10T10:03:00Z", body: "new" },
]);
assert(merged.length === 4, "merge does not duplicate IDs");
assert(merged[1].body === "authoritative refresh", "incoming row replaces local copy");

const hydrated = mergeMessagesById([
  {
    id: "x",
    created_at: "2026-08-10T10:04:00Z",
    body: "local",
    reactions: [{ emoji: "❤️", count: 1, mine: true }],
    reply_to: { id: "parent", body: "Resolved parent" },
    attachmentUrl: "signed-url",
  },
], [{
  id: "x",
  created_at: "2026-08-10T10:04:00Z",
  body: "server",
  reply_to: { id: "parent", missing: true },
}]);
assert(hydrated.length === 1, "hydrated race remains one row");
assert(hydrated[0].reactions.length === 1, "merge preserves hydrated reactions");
assert(hydrated[0].reply_to.body === "Resolved parent", "merge preserves resolved reply");
assert(hydrated[0].attachmentUrl === "signed-url", "merge preserves signed attachment URL");

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

