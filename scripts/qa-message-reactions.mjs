#!/usr/bin/env node
/**
 * Pure unit checks for message tapback aggregation / toggle.
 * Run: npm run qa:reactions
 */

import {
  REACTION_EMOJIS,
  aggregateReactions,
  isAllowedReactionEmoji,
  toggleReactionRows,
} from "../src/lib/messageReactions.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(REACTION_EMOJIS.length === 6, "six tapbacks");
assert(isAllowedReactionEmoji("❤️"), "heart allowed");
assert(!isAllowedReactionEmoji("🔥"), "fire blocked");
assert(!isAllowedReactionEmoji(""), "empty blocked");

const rows = [
  { emoji: "❤️", user_id: "a" },
  { emoji: "❤️", user_id: "b" },
  { emoji: "👍", user_id: "c" },
  { emoji: "🔥", user_id: "d" }, // invalid — ignored
];

const agg = aggregateReactions(rows, "a");
assert(agg.length === 2, "two chip groups");
assert(agg[0].emoji === "❤️" && agg[0].count === 2 && agg[0].mine === true, "heart mine");
assert(agg[1].emoji === "👍" && agg[1].count === 1 && agg[1].mine === false, "thumbs");

const afterAdd = toggleReactionRows([], "a", "😂");
assert(afterAdd.length === 1 && afterAdd[0].emoji === "😂", "add reaction");

const afterSame = toggleReactionRows(afterAdd, "a", "😂");
assert(afterSame.length === 0, "same emoji clears");

const afterReplace = toggleReactionRows(
  [{ emoji: "👍", user_id: "a" }, { emoji: "❤️", user_id: "b" }],
  "a",
  "‼️",
);
assert(afterReplace.length === 2, "replace keeps peer");
assert(afterReplace.find((r) => r.user_id === "a")?.emoji === "‼️", "replaced mine");
assert(afterReplace.find((r) => r.user_id === "b")?.emoji === "❤️", "peer untouched");

const ignoreBad = toggleReactionRows([{ emoji: "👍", user_id: "a" }], "a", "🔥");
assert(ignoreBad.length === 1 && ignoreBad[0].emoji === "👍", "invalid emoji no-op");

console.log("qa:reactions OK");
