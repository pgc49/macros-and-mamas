/** iMessage-style tapback set — keep in sync with migration 057. */
export const REACTION_EMOJIS = Object.freeze(["❤️", "👍", "👎", "😂", "‼️", "❓"]);

export function isAllowedReactionEmoji(emoji) {
  return REACTION_EMOJIS.includes(String(emoji || ""));
}

/**
 * Collapse raw reaction rows into chip summary for a message.
 * @param {{ emoji: string, user_id: string }[]} rows
 * @param {string} selfId
 * @returns {{ emoji: string, count: number, mine: boolean }[]}
 */
export function aggregateReactions(rows = [], selfId = null) {
  const byEmoji = new Map();
  for (const row of rows || []) {
    const emoji = String(row?.emoji || "");
    if (!isAllowedReactionEmoji(emoji)) continue;
    let entry = byEmoji.get(emoji);
    if (!entry) {
      entry = { emoji, count: 0, mine: false };
      byEmoji.set(emoji, entry);
    }
    entry.count += 1;
    if (selfId && row.user_id === selfId) entry.mine = true;
  }
  // Stable order matching the picker
  return REACTION_EMOJIS
    .map((emoji) => byEmoji.get(emoji))
    .filter(Boolean)
    .filter((e) => e.count > 0);
}

/**
 * Pure toggle preview for optimistic UI / unit tests.
 * One reaction per user: same emoji clears; different emoji replaces.
 * @returns {{ emoji: string, user_id: string }[]}
 */
export function toggleReactionRows(rows = [], selfId, emoji) {
  if (!selfId || !isAllowedReactionEmoji(emoji)) return rows || [];
  const list = (rows || []).filter((r) => r && r.user_id && r.emoji);
  const mine = list.find((r) => r.user_id === selfId);
  if (mine && mine.emoji === emoji) {
    return list.filter((r) => r.user_id !== selfId);
  }
  const withoutMine = list.filter((r) => r.user_id !== selfId);
  return [...withoutMine, { emoji, user_id: selfId }];
}
