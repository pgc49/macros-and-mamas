import { describe, expect, it } from "vitest";
import {
  applyFetchedReplyParents,
  findLoadedMatchIndexes,
  missingReplyIds,
  nextMatchIndex,
  replyPreviewFrom,
} from "./messageReplyParent";

describe("reply parent preview", () => {
  it("lists ids whose parent is outside the loaded page", () => {
    const rows = [
      { id: "2", reply_to_id: "1", reply_to: { id: "1", missing: true } },
      { id: "3", reply_to_id: "1", reply_to: { id: "1", missing: true } },
      { id: "4", reply_to_id: "2", reply_to: { id: "2", missing: false, body: "here" } },
    ];
    expect(missingReplyIds(rows)).toEqual(["1"]);
  });

  it("fills only the quote preview, without inserting the parent as a bubble", () => {
    const rows = [{ id: "2", body: "later", reply_to_id: "1", reply_to: { missing: true } }];
    const next = applyFetchedReplyParents(rows, [{
      id: "1",
      body: "original taco night",
      sender_id: "callie",
    }]);
    expect(next).toHaveLength(1);
    expect(next[0].reply_to).toEqual(replyPreviewFrom({
      id: "1",
      body: "original taco night",
      sender_id: "callie",
    }));
    expect(next[0].reply_to.missing).toBe(false);
  });
});

describe("find in loaded rows", () => {
  const rows = [
    { id: "a", body: "protein oatmeal" },
    { id: "b", body: "taco night" },
    { id: "c", body: "more tacos tomorrow" },
  ];

  it("matches loaded bodies only", () => {
    expect(findLoadedMatchIndexes(rows, "taco")).toEqual([1, 2]);
    expect(findLoadedMatchIndexes(rows, "")).toEqual([]);
  });

  it("walks matches forward and wraps", () => {
    expect(nextMatchIndex([1, 2], 1, 1)).toBe(2);
    expect(nextMatchIndex([1, 2], 2, 1)).toBe(1);
    expect(nextMatchIndex([1, 2], 2, -1)).toBe(1);
  });
});
