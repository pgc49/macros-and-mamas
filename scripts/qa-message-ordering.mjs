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

const deletedThenDelayed = mergeMessagesById([{
  id: "deleted",
  created_at: "2026-08-10T10:05:00Z",
  body: "",
  deleted_at: "2026-08-10T10:06:00Z",
  attachmentUrl: null,
}], [{
  id: "deleted",
  created_at: "2026-08-10T10:05:00Z",
  body: "stale send response",
  deleted_at: null,
  attachmentUrl: "stale-url",
}]);
assert(deletedThenDelayed[0].deleted_at, "delayed response cannot undo deletion");
assert(deletedThenDelayed[0].body === "", "deleted content is not resurrected");
assert(deletedThenDelayed[0].attachmentUrl === null, "deleted attachment URL stays cleared");

const editedThenDelayed = mergeMessagesById([{
  id: "edited",
  created_at: "2026-08-10T10:07:00Z",
  body: "new edit",
  edited_at: "2026-08-10T10:08:00Z",
}], [{
  id: "edited",
  created_at: "2026-08-10T10:07:00Z",
  body: "old send response",
  edited_at: null,
}]);
assert(editedThenDelayed[0].body === "new edit", "delayed response cannot undo edit");

const pendingThenServer = mergeMessagesById([{
  id: "cli-1",
  client_message_id: "cli-1",
  created_at: "2026-08-10T10:09:00Z",
  body: "pending",
  send_status: "pending",
  attachmentUrl: "blob:preview",
}], [{
  id: "srv-1",
  client_message_id: "cli-1",
  created_at: "2026-08-10T10:09:00Z",
  body: "pending",
}]);
assert(pendingThenServer.length === 1, "pending and server rows collapse");
assert(pendingThenServer[0].id === "srv-1", "server id wins after send");
assert(pendingThenServer[0].attachmentUrl === "blob:preview", "local preview survives until signed");

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

