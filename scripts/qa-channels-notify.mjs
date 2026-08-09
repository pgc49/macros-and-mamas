#!/usr/bin/env node
/**
 * Pure unit checks for channel notify eligibility (no network).
 * Run: npm run qa:channels
 */

function shouldNotifyMember({
  member,
  senderId,
  senderIsAdmin,
  messageKind,
  replyTo,
}) {
  if (!member?.user_id || member.removed_at) return false;
  if (senderId && member.user_id === senderId) return false;
  const level = String(member.notify_level || "highlights").toLowerCase();
  if (level === "mute") return false;
  if (level === "all") return true;
  if (level === "highlights") {
    return senderIsAdmin
      || String(messageKind || "") === "system"
      || (replyTo?.sender_id && replyTo.sender_id === member.user_id);
  }
  return false;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const mamaA = { user_id: "a", notify_level: "highlights", removed_at: null };
const mamaB = { user_id: "b", notify_level: "highlights", removed_at: null };
const muted = { user_id: "c", notify_level: "mute", removed_at: null };
const allMode = { user_id: "d", notify_level: "all", removed_at: null };

assert(!shouldNotifyMember({
  member: mamaA, senderId: "a", senderIsAdmin: false, messageKind: "chat", replyTo: null,
}), "sender never notified");

assert(!shouldNotifyMember({
  member: mamaB, senderId: "a", senderIsAdmin: false, messageKind: "chat", replyTo: null,
}), "peer chat suppressed on highlights");

assert(shouldNotifyMember({
  member: mamaB, senderId: "coach", senderIsAdmin: true, messageKind: "chat", replyTo: null,
}), "Callie chat notifies highlights");

assert(shouldNotifyMember({
  member: mamaB, senderId: null, senderIsAdmin: false, messageKind: "system", replyTo: null,
}), "system prompt notifies highlights");

assert(shouldNotifyMember({
  member: mamaB, senderId: "a", senderIsAdmin: false, messageKind: "chat", replyTo: { sender_id: "b" },
}), "reply to member notifies");

assert(!shouldNotifyMember({
  member: muted, senderId: "coach", senderIsAdmin: true, messageKind: "chat", replyTo: null,
}), "mute blocks Callie");

assert(shouldNotifyMember({
  member: allMode, senderId: "a", senderIsAdmin: false, messageKind: "chat", replyTo: null,
}), "all mode gets peer posts");

assert(!shouldNotifyMember({
  member: { user_id: "x", notify_level: "highlights", removed_at: "2026-01-01" },
  senderId: "coach", senderIsAdmin: true, messageKind: "chat", replyTo: null,
}), "removed members skipped");

assert(!shouldNotifyMember({
  member: mamaB, senderId: "a", senderIsAdmin: false, messageKind: "chat",
  replyTo: { sender_id: "z" },
}), "reply to someone else does not notify");

assert(shouldNotifyMember({
  member: allMode, senderId: null, senderIsAdmin: false, messageKind: "system", replyTo: null,
}), "all mode gets system prompts");

/** Attachment path shape used by storage + insert RLS. */
function isValidChannelAttachmentPath(conversationId, userId, path, { admin = false } = {}) {
  if (!path) return true;
  if (!path.startsWith(`${conversationId}/`)) return false;
  if (admin) return true;
  return path.startsWith(`${conversationId}/${userId}/`);
}

const conv = "11111111-1111-1111-1111-111111111111";
const uid = "22222222-2222-2222-2222-222222222222";
assert(isValidChannelAttachmentPath(conv, uid, `${conv}/${uid}/file.jpg`), "own folder ok");
assert(!isValidChannelAttachmentPath(conv, uid, `${conv}/other/file.jpg`), "peer folder blocked");
assert(!isValidChannelAttachmentPath(conv, uid, `${conv}/file.jpg`), "legacy 2-segment blocked for members");
assert(isValidChannelAttachmentPath(conv, uid, `${conv}/file.jpg`, { admin: true }), "admin may use conv root");
assert(!isValidChannelAttachmentPath(conv, uid, `other/${uid}/file.jpg`), "wrong conversation blocked");

console.log("qa-channels-notify: ok");
