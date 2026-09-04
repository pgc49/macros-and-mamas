import { supabase } from "../lib/supabase";
import { programWeekNumber } from "../lib/cohorts";
import { parseLiveChannelCohorts } from "../lib/liveChannelCohorts";
import { adherenceForItems, programGoalItems } from "../lib/goals";
import {
  aggregateReactions,
  isAllowedReactionEmoji,
} from "../lib/messageReactions";
import { chronologicalMessages } from "../lib/messageOrdering";
import { referredByByUserId } from "../lib/referredBy";
import { fullName, joinPersonName } from "../lib/personName";
import { addDaysIso, localDateIso, wkStartOf } from "../utils/dates";
import { ageFromDateOfBirth } from "../utils/dateOfBirth";
import { sanitizeWeekMeals } from "../utils/planMealShape";

export { ageFromDateOfBirth };

/** Display name: first + last, without doubling a last name already in `name`. */
export { fullName };

// `export { fullName } from` is not a local binding. loadRoster calls fullName(p);
// after #309 that throw emptied the admin roster and every inbox DM titled "Mama".

/* ------------------------------------------------------------------ */
/*  DATA LAYER — per-event Supabase writes (not blob persistence)      */
/*  Tables (RLS on all):                                               */
/*    profiles, macros, checkins, weighins, meal_logs, water_logs      */
/* ------------------------------------------------------------------ */

function profileToRow(p) {
  const dob = p.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateOfBirth))
    ? String(p.dateOfBirth)
    : null;
  const ageFromDob = ageFromDateOfBirth(dob);
  return {
    name: p.name || null,
    last_name: p.lastName || null,
    age: ageFromDob != null
      ? ageFromDob
      : (p.age === "" || p.age == null ? null : Number(p.age)),
    date_of_birth: dob,
    phone: p.phone || null,
    current_weight: p.currentWeight === "" || p.currentWeight == null ? null : Number(p.currentWeight),
    goal_weight: p.goalWeight === "" || p.goalWeight == null ? null : Number(p.goalWeight),
    months_pp: p.monthsPP === "" || p.monthsPP == null ? null : Number(p.monthsPP),
    breastfeeding: p.breastfeeding,
    pregnant: p.pregnant,
    goal: p.goal || null,
    activity: p.activity || null,
    stress: p.stress || null,
    insulin_resistance: !!p.insulinResistance,
    diet: p.diet || null,
    pref_b: p.prefB || null,
    pref_l: p.prefL || null,
    pref_d: p.prefD || null,
    pref_s: p.prefS || null,
    season_note: p.seasonNote?.trim() ? p.seasonNote.trim() : null,
    allergens: Array.isArray(p.allergens) ? p.allergens : [],
    allergen_note: p.allergenNote?.trim() ? p.allergenNote.trim() : null,
    food_avoids: p.foodAvoids?.trim() ? p.foodAvoids.trim() : null,
    bottle_oz: p.bottleOz != null && p.bottleOz !== "" ? Math.round(Number(p.bottleOz)) : 24,
    avatar_path: p.avatarPath || null,
  };
}

/** Public URL for a profile avatar path in the avatars bucket. */
export function avatarPublicUrl(avatarPath) {
  if (!avatarPath) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
  return data?.publicUrl || null;
}

function rowToProfile(row) {
  if (!row) return null;
  const avatarPath = row.avatar_path || null;
  return {
    name: row.name || "",
    lastName: row.last_name || "",
    age: row.age != null ? String(row.age) : "",
    dateOfBirth: row.date_of_birth || "",
    phone: row.phone || "",
    currentWeight: row.current_weight != null ? String(row.current_weight) : "",
    goalWeight: row.goal_weight != null ? String(row.goal_weight) : "",
    monthsPP: row.months_pp != null ? String(row.months_pp) : "",
    breastfeeding: row.breastfeeding,
    pregnant: row.pregnant,
    goal: row.goal || "lose",
    activity: row.activity || "moderate",
    stress: row.stress || "medium",
    insulinResistance: !!row.insulin_resistance,
    diet: row.diet || "none",
    prefB: row.pref_b || "",
    prefL: row.pref_l || "",
    prefD: row.pref_d || "",
    prefS: row.pref_s || "",
    seasonNote: row.season_note || "",
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    allergenNote: row.allergen_note || "",
    foodAvoids: row.food_avoids || "",
    coachNote: row.coach_note || "",
    coachNoteAt: row.coach_note_at || null,
    coachNoteDismissedAt: row.coach_note_dismissed_at || null,
    homescreenTipDismissedAt: row.homescreen_tip_dismissed_at || null,
    bottleOz: row.bottle_oz != null ? Number(row.bottle_oz) : 24,
    avatarPath,
    avatarUrl: avatarPublicUrl(avatarPath),
    status: row.status,
    paid: !!row.paid,
    refunded: !!row.refunded,
    comp: !!row.comp,
    paidAt: row.paid_at || null,
    week: row.week ?? 0,
    role: row.role,
    createdAt: row.created_at || null,
    cohort_label: row.cohort_label || null,
    tier: row.tier || "none",
    subscription_status: row.subscription_status || null,
    subscription_current_period_end: row.subscription_current_period_end || null,
    subscription_trial_end: row.subscription_trial_end || null,
    stripe_subscription_id: row.stripe_subscription_id || null,
  };
}

function adherenceFromChecks(checkRows, weekStart) {
  const checksByWeek = { [weekStart]: {} };
  (checkRows || []).forEach((r) => {
    if (r.week_start === weekStart) {
      checksByWeek[weekStart][`${r.item_id}|${r.day}`] = true;
    }
  });
  // Roster % uses program goals only (custom goals are per-mama coaching signal).
  return adherenceForItems(checksByWeek, weekStart, programGoalItems());
}

/** Approved = macros.approved, or profiles.status already flipped to active
 *  (admin Approve button / manual SQL both set status=active). */
function isApproved({ profileRow, macrosRow }) {
  return !!(macrosRow?.approved || profileRow?.status === "active");
}

function viewFromState({ profileRow, macrosRow }) {
  if (!profileRow) return "join";
  if (profileRow.refunded) return "goodbye";
  const paid = !!profileRow.paid;
  if (!paid) return "join";
  const hasIntake = !!(macrosRow || profileRow.name || profileRow.phone);
  if (!hasIntake) return "onboarding";
  const approved = isApproved({ profileRow, macrosRow });
  if (approved) return "dashboard";
  return "pending";
}

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not signed in");
  return user.id;
}

/**
 * Page a PostgREST select past the default 1000-row cap.
 * `buildQuery` must return a fresh filter builder each call (no prior .range).
 */
async function fetchAllRows(buildQuery, { pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

/** Fold { profile_id, date } rows into max date per profile. */
function maxDateByProfile(rows, into = {}) {
  (rows || []).forEach((r) => {
    if (!r?.profile_id || !r?.date) return;
    if (!into[r.profile_id] || r.date > into[r.profile_id]) {
      into[r.profile_id] = r.date;
    }
  });
  return into;
}

function emptyAdminStats() {
  return {
    signups: 0,
    paid: 0,
    unpaid: 0,
    awaitingIntake: 0,
    awaitingApproval: 0,
    active: 0,
    refunded: 0,
  };
}

/** Normalize legacy `source` into `via` (photo | describe | recipe | manual | adjusted | menu | custom). */
export function normalizeVia(row) {
  if (row?.via) return row.via;
  if (row?.source === "text") return "describe";
  if (
    row?.source === "photo"
    || row?.source === "recipe"
    || row?.source === "manual"
    || row?.source === "adjusted"
    || row?.source === "menu"
    || row?.source === "custom"
  ) {
    return row.source;
  }
  return "manual";
}

function viaToLegacySource(via) {
  if (via === "describe") return "text";
  return via || "manual";
}

function normalizeMealSlot(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "breakfast" || s === "lunch" || s === "dinner" || s === "snack") return s;
  if (s === "snacks" || s === "pantry") return "snack";
  return null;
}

async function loadMealLogsRange(uid, startDate, endDate) {
  const withSlot = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source, via, slot")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!withSlot.error) return withSlot.data || [];

  console.warn("meal_logs select (with slot) failed; retrying", withSlot.error);
  const withVia = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source, via")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!withVia.error) return withVia.data || [];

  console.warn("meal_logs select (with via) failed; retrying", withVia.error);
  const withSource = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!withSource.error) return withSource.data || [];

  console.warn("meal_logs select (with source) failed; retrying", withSource.error);
  const bare = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!bare.error) return bare.data || [];
  console.warn("meal_logs select failed; continuing without logs", bare.error);
  return [];
}

async function loadMealLogsForDate(uid, date) {
  return loadMealLogsRange(uid, date, date);
}

/** Water logs for any profile_id in a date range → { [iso]: [{id,oz,created_at}] }. */
async function loadWaterLogsRange(uid, startDate, endDate) {
  const { data, error } = await supabase
    .from("water_logs")
    .select("id, date, oz, created_at")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("loadWaterLogsRange failed", error);
    return {};
  }
  const byDate = {};
  (data || []).forEach((r) => {
    const d = r.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push({
      id: r.id,
      oz: Number(r.oz),
      created_at: r.created_at,
    });
  });
  return byDate;
}

function mapMealRows(mealRows) {
  return (mealRows || []).map((r) => {
    const via = normalizeVia(r);
    return {
      id: r.id,
      date: r.date,
      name: r.name,
      cal: r.cal,
      p: r.p,
      c: r.c,
      f: r.f,
      via,
      slot: normalizeMealSlot(r.slot),
      source: r.source || viaToLegacySource(via),
      origin: r.origin || null,
    };
  });
}

function groupMealRowsByDate(mealRows) {
  const byDate = {};
  mapMealRows(mealRows).forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  return byDate;
}

/** Matches the CHECK in migration 019 so a bad yield fails locally, not in Postgres. */
function normalizeServes(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 24);
}

function mapCustomMeal(r) {
  const slot = normalizeMealSlot(r.slot);
  return {
    id: r.id,
    name: r.name,
    cal: Number(r.cal) || 0,
    p: Number(r.p) || 0,
    c: Number(r.c) || 0,
    f: Number(r.f) || 0,
    serves: normalizeServes(r.serves ?? 1),
    ingredients: r.ingredients || "",
    steps: r.steps || "",
    slot,
    cat: slot,
    updated_at: r.updated_at,
  };
}

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";
const CHANNEL_ATTACHMENT_BUCKET = "channel-attachments";
const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Monday voice drop PSA — longer than chat memos; keep in sync with migration 059. */
const VOICE_DROP_MAX_BYTES = 50 * 1024 * 1024;
const MESSAGE_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
]);
const MESSAGE_ATTACHMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  ...MESSAGE_AUDIO_MIME,
]);

function safeAttachmentName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "file";
}

function messageIdempotencyKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    return key;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : ((random & 0x3) | 0x8)).toString(16);
  });
}

function assertIdempotentPayload(existing, {
  body,
  replyToId,
  file,
  targetField,
  targetId,
}) {
  if (!existing) return;
  const sameTarget = existing[targetField] === targetId;
  const sameBody = String(existing.body || "") === String(body || "");
  const sameReply = String(existing.reply_to_id || "") === String(replyToId || "");
  let sameFile = true;
  if (file) {
    const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
    sameFile = existing.attachment_name === String(file.name || "attachment").slice(0, 120)
      && existing.attachment_mime === mime
      && Number(existing.attachment_bytes || 0) === Number(file.size || 0);
  } else if (existing.attachment_path) {
    sameFile = false;
  }
  if (!sameTarget || !sameBody || !sameReply || !sameFile) {
    throw new Error("This retry no longer matches the original send.");
  }
}

function isDefinitiveInsertRejection(error) {
  const code = String(error?.code || "");
  // Data/constraint/authorization rejection means Postgres did not commit.
  // Network, timeout, and generic 5xx outcomes remain ambiguous.
  return /^(22|23)/.test(code) || code === "42501";
}

function isAudioMime(mime) {
  const base = String(mime || "").toLowerCase().split(";")[0].trim();
  return MESSAGE_AUDIO_MIME.has(base) || base.startsWith("audio/");
}

async function uploadMessageAttachment({ clientId, file, allowAudio = false }) {
  if (!file) return null;
  // Strip codec params (e.g. audio/webm;codecs=opus) for allowlist + Storage.
  const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
  if (isAudioMime(mime) && !allowAudio) {
    throw new Error("Only Callie can send voice memos.");
  }
  if (!MESSAGE_ATTACHMENT_MIME.has(mime) && !(allowAudio && isAudioMime(mime))) {
    throw new Error(
      allowAudio
        ? "Attachments must be a photo, PDF, or voice memo."
        : "Attachments must be a photo (JPG/PNG/WebP) or PDF.",
    );
  }
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      isAudioMime(mime)
        ? "That voice memo is over 10 MB — try a shorter recording."
        : "That file is over 10 MB — try a smaller photo.",
    );
  }
  const id = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${clientId}/${id}-${safeAttachmentName(file.name)}`;
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    console.error("message attachment upload failed", error);
    throw new Error("Couldn’t upload that attachment — try again.");
  }
  return {
    path,
    name: String(file.name || "attachment").slice(0, 120),
    mime,
    bytes: Number(file.size) || null,
  };
}

async function hydrateMessageAttachments(rows) {
  const list = rows || [];
  return Promise.all(list.map(async (m) => {
    if (!m?.attachment_path) return m;
    try {
      const { data, error } = await supabase.storage
        .from(MESSAGE_ATTACHMENT_BUCKET)
        .createSignedUrl(m.attachment_path, 60 * 60);
      if (error) {
        console.warn("message attachment signed url failed", error);
        return m;
      }
      return { ...m, attachmentUrl: data?.signedUrl || null };
    } catch (e) {
      console.warn("message attachment signed url failed", e);
      return m;
    }
  }));
}

async function uploadChannelAttachment({ conversationId, file, allowAudio = false }) {
  if (!file) return null;
  if (!conversationId) throw new Error("channel required");
  const uid = await requireUserId();
  const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
  if (isAudioMime(mime) && !allowAudio) {
    throw new Error("Only Callie can send voice memos.");
  }
  if (!MESSAGE_ATTACHMENT_MIME.has(mime) && !(allowAudio && isAudioMime(mime))) {
    throw new Error(
      allowAudio
        ? "Attachments must be a photo, PDF, or voice memo."
        : "Attachments must be a photo (JPG/PNG/WebP) or PDF.",
    );
  }
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      isAudioMime(mime)
        ? "That voice memo is over 10 MB — try a shorter recording."
        : "That file is over 10 MB — try a smaller photo.",
    );
  }
  const id = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // {conversationId}/{userId}/{file} — storage delete scoped to own folder.
  const path = `${conversationId}/${uid}/${id}-${safeAttachmentName(file.name)}`;
  const { error } = await supabase.storage
    .from(CHANNEL_ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    console.error("channel attachment upload failed", error);
    throw new Error("Couldn’t upload that attachment — try again.");
  }
  return {
    path,
    name: String(file.name || "attachment").slice(0, 120),
    mime,
    bytes: Number(file.size) || null,
  };
}

async function hydrateChannelAttachments(rows) {
  const list = rows || [];
  return Promise.all(list.map(async (m) => {
    if (!m?.attachment_path) return m;
    try {
      const { data, error } = await supabase.storage
        .from(CHANNEL_ATTACHMENT_BUCKET)
        .createSignedUrl(m.attachment_path, 60 * 60);
      if (error) {
        console.warn("channel attachment signed url failed", error);
        return m;
      }
      return { ...m, attachmentUrl: data?.signedUrl || null };
    } catch (e) {
      console.warn("channel attachment signed url failed", e);
      return m;
    }
  }));
}

async function removeUploadedAttachment(bucket, path) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) console.warn("message attachment cleanup failed", bucket, path, error);
  } catch (error) {
    console.warn("message attachment cleanup failed", bucket, path, error);
  }
}

async function loadChannelSenderLabels(conversationId, userIds) {
  if (!conversationId || !userIds?.length) return {};
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return {};
    const resp = await fetch("/api/channel-members", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        userIds,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      console.warn("channel sender label lookup failed", data);
      return {};
    }
    return data.labels || {};
  } catch (e) {
    console.warn("channel sender label lookup failed", e);
    return {};
  }
}

function profileToInboxPeer(p) {
  if (!p?.id) return null;
  return {
    id: p.id,
    name: p.name || "",
    firstName: p.name || "",
    lastName: p.last_name || "",
    email: p.email || "",
    role: p.role || "",
  };
}

/** Attach first/last/email onto inbox rows so a missed roster lookup still has a real title. */
export function attachInboxPeers(rows, profiles) {
  const byId = new Map((profiles || []).map((p) => [p.id, profileToInboxPeer(p)]));
  return (rows || []).map((row) => {
    const last = row.lastMessage || null;
    const senderId = last?.sender_id;
    const sender = (senderId && byId.get(senderId)) || null;
    return {
      ...row,
      peer: byId.get(row.clientId) || null,
      participantPeers: (row.participantIds || [])
        .map((id) => byId.get(id))
        .filter(Boolean),
      lastMessage: last
        ? { ...last, sender_profile: last.sender_profile || sender }
        : last,
    };
  });
}

async function hydrateInboxPeers(rows) {
  const list = rows || [];
  const ids = [...new Set(
    list.flatMap((row) => [row.clientId, ...(row.participantIds || [])]).filter(Boolean),
  )];
  if (!ids.length) return list;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, last_name, email, role")
      .in("id", ids);
    if (error) {
      console.warn("inbox peer profile lookup failed", error);
      return list;
    }
    return attachInboxPeers(list, data || []);
  } catch (e) {
    console.warn("inbox peer profile lookup failed", e);
    return list;
  }
}

async function hydrateChannelSenders(rows, conversationId = null) {
  const list = rows || [];
  const ids = [...new Set(list.map((m) => m?.sender_id).filter(Boolean))];
  if (!ids.length) return list;
  let byId = new Map();
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, last_name, email, role")
      .in("id", ids);
    if (error) {
      console.warn("channel sender profile lookup failed", error);
    } else {
      byId = new Map((data || []).map((p) => [p.id, p]));
    }
  } catch (e) {
    console.warn("channel sender profile lookup failed", e);
  }
  const missingIds = ids.filter((id) => !byId.has(id));
  const labels = await loadChannelSenderLabels(conversationId, missingIds);
  return list.map((m) => {
    const profile = byId.get(m.sender_id)
      || (labels[m.sender_id] ? { id: m.sender_id, name: labels[m.sender_id] } : null);
    return { ...m, sender_profile: profile };
  });
}

const CHANNEL_MESSAGE_SELECT = "id, conversation_id, sender_id, client_message_id, body, kind, reply_to_id, created_at, edited_at, deleted_at, notified_at, attachment_path, attachment_name, attachment_mime, attachment_bytes";
const DM_MESSAGE_SELECT = "id, client_id, sender_id, client_message_id, body, kind, reply_to_id, created_at, read_at, edited_at, deleted_at, attachment_path, attachment_name, attachment_mime, attachment_bytes";

/** Attach in-thread reply preview objects from the loaded window (DMs + channels). */
function attachReplyPreviews(rows) {
  const list = rows || [];
  const byId = new Map(list.map((m) => [m.id, m]));
  return list.map((m) => {
    if (!m?.reply_to_id) return m;
    const parent = byId.get(m.reply_to_id);
    if (!parent) {
      return {
        ...m,
        reply_to: {
          id: m.reply_to_id,
          body: "",
          missing: true,
          deleted_at: null,
          sender_id: null,
        },
      };
    }
    return {
      ...m,
      reply_to: {
        id: parent.id,
        body: parent.deleted_at ? "" : (parent.body || ""),
        deleted_at: parent.deleted_at || null,
        sender_id: parent.sender_id || null,
        sender_profile: parent.sender_profile || null,
        attachment_name: parent.deleted_at ? null : (parent.attachment_name || null),
        missing: false,
      },
    };
  });
}

const attachChannelReplyPreviews = attachReplyPreviews;

export function channelHasUnread(_conversation, membership, messages = []) {
  const userId = membership?.user_id;
  if (!userId) return false;
  const lastReadMs = membership?.last_read_at
    ? new Date(membership.last_read_at).getTime()
    : 0;
  return (messages || []).some((m) => {
    if (!m || m.deleted_at || m.sender_id === userId) return false;
    const createdMs = m.created_at ? new Date(m.created_at).getTime() : 0;
    return createdMs > (Number.isFinite(lastReadMs) ? lastReadMs : 0);
  });
}

async function loadReactionRows(table, messageIds) {
  const ids = [...new Set((messageIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from(table)
    .select("id, message_id, user_id, emoji, created_at")
    .in("message_id", ids);
  if (error) throw error;
  return data || [];
}

function attachReactions(messages, rows, selfId) {
  const byMessage = new Map();
  for (const row of rows || []) {
    if (!row?.message_id) continue;
    const list = byMessage.get(row.message_id) || [];
    list.push(row);
    byMessage.set(row.message_id, list);
  }
  return (messages || []).map((m) => {
    const reactionRows = byMessage.get(m.id) || [];
    return {
      ...m,
      reaction_rows: reactionRows,
      reactions: aggregateReactions(reactionRows, selfId),
    };
  });
}

async function hydrateDmReactions(messages) {
  const list = messages || [];
  if (!list.length) return list;
  let selfId = null;
  try {
    selfId = await requireUserId();
  } catch {
    selfId = null;
  }
  try {
    const rows = await loadReactionRows("message_reactions", list.map((m) => m.id));
    return attachReactions(list, rows, selfId);
  } catch (e) {
    console.warn("dm reactions hydrate failed", e);
    return list.map((m) => ({ ...m, reaction_rows: [], reactions: [] }));
  }
}

async function hydrateChannelReactions(messages) {
  const list = messages || [];
  if (!list.length) return list;
  let selfId = null;
  try {
    selfId = await requireUserId();
  } catch {
    selfId = null;
  }
  try {
    const rows = await loadReactionRows(
      "conversation_message_reactions",
      list.map((m) => m.id),
    );
    return attachReactions(list, rows, selfId);
  } catch (e) {
    console.warn("channel reactions hydrate failed", e);
    return list.map((m) => ({ ...m, reaction_rows: [], reactions: [] }));
  }
}

/**
 * Toggle / replace tapback. Same emoji clears; different emoji replaces.
 * @param {"dm"|"channel"} scope
 */
async function toggleMessageReaction(scope, messageId, emoji) {
  const uid = await requireUserId();
  if (!messageId) throw new Error("message required");
  if (!isAllowedReactionEmoji(emoji)) throw new Error("That reaction isn’t available.");
  const table = scope === "channel"
    ? "conversation_message_reactions"
    : "message_reactions";

  const { data: existing, error: findErr } = await supabase
    .from(table)
    .select("id, emoji")
    .eq("message_id", messageId)
    .eq("user_id", uid)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing?.id && existing.emoji === emoji) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq("id", existing.id)
      .eq("user_id", uid);
    if (delErr) throw delErr;
    return { messageId, emoji, cleared: true };
  }

  if (existing?.id) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq("id", existing.id)
      .eq("user_id", uid);
    if (delErr) throw delErr;
  }

  const { error: insErr } = await supabase
    .from(table)
    .insert({ message_id: messageId, user_id: uid, emoji });
  if (insErr) throw insErr;
  return { messageId, emoji, cleared: false };
}

export const db = {
  async loadClientState() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const uid = user.id;
    const today = localDateIso();

    const [
      { data: profileRow, error: pErr },
      { data: macrosRow, error: mErr },
      { data: checkRows, error: cErr },
      { data: weighRows, error: wErr },
      customGoalsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("macros").select("*").eq("profile_id", uid).maybeSingle(),
      supabase.from("checkins").select("week_start, item_id, day").eq("profile_id", uid),
      supabase.from("weighins").select("date, weight").eq("profile_id", uid).order("date", { ascending: true }),
      supabase
        .from("custom_goals")
        .select("id, title, subtitle, frequency, n_target, sort, archived_at, created_at")
        .eq("profile_id", uid)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
    ]);

    if (pErr) throw pErr;
    if (mErr) throw mErr;
    if (cErr) throw cErr;
    if (wErr) throw wErr;
    // Non-fatal if migration 056 not applied yet on a preview env.
    const customGoals = customGoalsRes?.error ? [] : (customGoalsRes?.data || []);
    if (customGoalsRes?.error) {
      console.warn("custom_goals load failed", customGoalsRes.error);
    }

    // Meal logs are non-fatal: missing via/source columns must not block dashboard.
    const weekStart = wkStartOf();
    // Progress charts need ~4 weeks of history; day strip still uses the current week subset.
    const historyStart = addDaysIso(today, -27);
    const mealRows = await loadMealLogsRange(uid, historyStart, today);
    const historyByDate = groupMealRowsByDate(mealRows);
    const byDate = {};
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(weekStart, i);
      if (historyByDate[d]) byDate[d] = historyByDate[d];
    }

    // Water history (same 28-day window) — non-fatal if migration 012 not applied yet
    let waterByDate = {};
    try {
      const { data: waterRows, error: waterErr } = await supabase
        .from("water_logs")
        .select("id, date, oz, created_at")
        .eq("profile_id", uid)
        .gte("date", historyStart)
        .lte("date", today)
        .order("created_at", { ascending: true });
      if (!waterErr && waterRows) {
        waterRows.forEach((r) => {
          if (!waterByDate[r.date]) waterByDate[r.date] = [];
          waterByDate[r.date].push({
            id: r.id,
            oz: Number(r.oz),
            created_at: r.created_at,
          });
        });
      }
    } catch (e) {
      console.warn("water history load failed", e);
    }

    const checksByWeek = {};
    (checkRows || []).forEach((r) => {
      const wk = r.week_start;
      if (!checksByWeek[wk]) checksByWeek[wk] = {};
      checksByWeek[wk][`${r.item_id}|${r.day}`] = true;
    });

    const profile = rowToProfile(profileRow) || undefined;
    const macros = macrosRow
      ? {
          cal: macrosRow.cal,
          protein: macrosRow.protein,
          fat: macrosRow.fat,
          carbs: macrosRow.carbs,
          notes: macrosRow.notes || [],
        }
      : null;

    return {
      profile,
      macros,
      approved: isApproved({ profileRow, macrosRow }),
      paid: !!profileRow?.paid,
      refunded: !!profileRow?.refunded,
      status: profileRow?.status || "pending",
      view: viewFromState({ profileRow, macrosRow }),
      checksByWeek,
      weighins: (weighRows || []).map((r) => ({ date: r.date, w: Number(r.weight) })),
      todayLog: {
        date: today,
        entries: historyByDate[today] || [],
      },
      mealLogsByDate: byDate,
      mealLogWeekStart: weekStart,
      mealHistoryByDate: historyByDate,
      waterLogsByDate: waterByDate,
      customGoals,
    };
  },

  async loadMealLogs(date = localDateIso()) {
    const uid = await requireUserId();
    const mealRows = await loadMealLogsForDate(uid, date);
    return { date, entries: mapMealRows(mealRows) };
  },

  /** Load one Mon–Sun week of meal logs in a single query (for day-strip dots). */
  async loadMealLogsWeek(weekStart = wkStartOf()) {
    const uid = await requireUserId();
    const end = addDaysIso(weekStart, 6);
    const mealRows = await loadMealLogsRange(uid, weekStart, end);
    return {
      weekStart,
      byDate: groupMealRowsByDate(mealRows),
    };
  },

  /** Longer history for Progress charts (defaults to last 28 local days). */
  async loadMealLogsHistory(days = 28) {
    const uid = await requireUserId();
    const today = localDateIso();
    const start = addDaysIso(today, -(Math.max(1, days) - 1));
    const mealRows = await loadMealLogsRange(uid, start, today);
    return { start, end: today, byDate: groupMealRowsByDate(mealRows) };
  },

  /**
   * Admin: progress payload for one client (meals + water + all checkins).
   * Relies on RLS own-or-admin SELECT policies.
   */
  async loadClientProgress(clientId, days = 28) {
    if (!clientId) throw new Error("clientId required");
    const today = localDateIso();
    const start = addDaysIso(today, -(Math.max(1, days) - 1));

    const [{ data: checkRows, error: cErr }, mealRows, waterByDate, customGoalsRes] = await Promise.all([
      supabase
        .from("checkins")
        .select("week_start, item_id, day")
        .eq("profile_id", clientId),
      loadMealLogsRange(clientId, start, today),
      loadWaterLogsRange(clientId, start, today),
      supabase
        .from("custom_goals")
        .select("id, title, subtitle, frequency, n_target, sort, archived_at, created_at")
        .eq("profile_id", clientId)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
    ]);
    if (cErr) throw cErr;

    const checksByWeek = {};
    (checkRows || []).forEach((r) => {
      const wk = r.week_start;
      if (!checksByWeek[wk]) checksByWeek[wk] = {};
      checksByWeek[wk][`${r.item_id}|${r.day}`] = true;
    });

    return {
      mealHistoryByDate: groupMealRowsByDate(mealRows),
      waterLogsByDate: waterByDate,
      checksByWeek,
      customGoals: customGoalsRes?.error ? [] : (customGoalsRes?.data || []),
      start,
      end: today,
    };
  },

  /**
   * Admin: one Mon–Sun week of meal + water logs for any client (read-only UI).
   * Writes stay client-scoped via requireUserId().
   */
  async loadClientLogsWeek(clientId, weekStart = wkStartOf()) {
    if (!clientId) throw new Error("clientId required");
    const end = addDaysIso(weekStart, 6);
    const [mealRows, waterByDate] = await Promise.all([
      loadMealLogsRange(clientId, weekStart, end),
      loadWaterLogsRange(clientId, weekStart, end),
    ]);
    return {
      weekStart,
      end,
      mealByDate: groupMealRowsByDate(mealRows),
      waterByDate,
    };
  },

  /**
   * Eligibility-hold waitlist (pregnant / early_nursing) — POST /api/intake-waitlist.
   * Do not insert with the anon key; RLS no longer allows public inserts.
   * Live marketing / SPA form is joinCohortWaitlist → /api/waitlist.
   */
  async joinWaitlist({ email, reason, monthsPp = null }) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    const resp = await fetch("/api/intake-waitlist", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: String(email || "").trim().toLowerCase().slice(0, 200),
        reason: String(reason || "").slice(0, 40),
        months_pp: monthsPp,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429 || data?.error === "rate_limited") {
      throw new Error("rate_limited");
    }
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || `waitlist_failed_${resp.status}`);
    }
  },

  /**
   * Cohort waitlist — goes through POST /api/waitlist (rate-limited, service-role insert).
   * Do not insert with the anon key; RLS no longer allows public inserts.
   */
  async joinCohortWaitlist({
    firstName,
    lastName,
    email,
    phone,
    cohort = "cohort_2",
    source = "homepage",
    attribution = null,
  }) {
    const body = {
      first_name: String(firstName || "").trim().slice(0, 80),
      last_name: String(lastName || "").trim().slice(0, 80),
      email: String(email || "").trim().toLowerCase().slice(0, 200),
      phone: String(phone || "").trim().slice(0, 40),
      cohort: String(cohort || "cohort_2").slice(0, 40),
      source: String(source || "homepage").slice(0, 40),
    };
    if (attribution && typeof attribution === "object") {
      if (attribution.utm_source) body.utm_source = String(attribution.utm_source).slice(0, 120);
      if (attribution.utm_medium) body.utm_medium = String(attribution.utm_medium).slice(0, 120);
      if (attribution.utm_campaign) body.utm_campaign = String(attribution.utm_campaign).slice(0, 120);
      if (attribution.utm_content) body.utm_content = String(attribution.utm_content).slice(0, 120);
      if (attribution.fbclid) body.fbclid = String(attribution.fbclid).slice(0, 200);
      if (attribution.fbp) body.fbp = String(attribution.fbp).slice(0, 128);
      if (attribution.fbc) body.fbc = String(attribution.fbc).slice(0, 128);
      if (attribution.event_id) body.event_id = String(attribution.event_id).slice(0, 120);
    }
    const resp = await fetch("/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429 || data?.error === "rate_limited") {
      throw new Error("rate_limited");
    }
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || `waitlist_failed_${resp.status}`);
    }
  },


  async submitIntake(profile, macros) {
    const uid = await requireUserId();
    const { data: prof, error: gateErr } = await supabase
      .from("profiles")
      .select("paid, refunded, role")
      .eq("id", uid)
      .maybeSingle();
    if (gateErr) throw gateErr;
    const isAdmin = prof?.role === "admin";
    if (prof?.refunded) throw new Error("Enrollment was refunded");
    if (!prof?.paid && !isAdmin) throw new Error("Payment required before intake");

    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        ...profileToRow(profile),
        status: "pending",
        week: 0,
      })
      .eq("id", uid);
    if (pErr) throw pErr;

    const { error: mErr } = await supabase.from("macros").upsert({
      profile_id: uid,
      cal: macros.cal,
      protein: macros.protein,
      fat: macros.fat,
      carbs: macros.carbs,
      notes: macros.notes || [],
      approved: false,
    });
    if (mErr) throw mErr;
  },

  async toggleCheckin(weekStart, itemId, day, checked) {
    const uid = await requireUserId();
    if (checked) {
      const { error } = await supabase.from("checkins").upsert(
        { profile_id: uid, week_start: weekStart, item_id: itemId, day },
        { onConflict: "profile_id,week_start,item_id,day" }
      );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("checkins")
        .delete()
        .eq("profile_id", uid)
        .eq("week_start", weekStart)
        .eq("item_id", itemId)
        .eq("day", day);
      if (error) throw error;
    }
  },

  async listCustomGoals(profileId = null) {
    const uid = profileId || (await requireUserId());
    const { data, error } = await supabase
      .from("custom_goals")
      .select("id, title, subtitle, frequency, n_target, sort, archived_at, created_at, profile_id")
      .eq("profile_id", uid)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createCustomGoal({ title, subtitle = null, frequency = "daily", n_target = null }) {
    const uid = await requireUserId();
    const row = {
      profile_id: uid,
      title: String(title || "").trim().slice(0, 30),
      subtitle: subtitle ? String(subtitle).trim().slice(0, 20) : null,
      frequency: frequency === "n_per_week" ? "n_per_week" : "daily",
      n_target: frequency === "n_per_week" ? Number(n_target) || 3 : null,
      sort: 100,
    };
    const { data, error } = await supabase
      .from("custom_goals")
      .insert(row)
      .select("id, title, subtitle, frequency, n_target, sort, archived_at, created_at")
      .single();
    if (error) throw error;
    return data;
  },

  async updateCustomGoal(id, { title, subtitle = null, frequency = "daily", n_target = null }) {
    const uid = await requireUserId();
    const patch = {
      title: String(title || "").trim().slice(0, 30),
      subtitle: subtitle ? String(subtitle).trim().slice(0, 20) : null,
      frequency: frequency === "n_per_week" ? "n_per_week" : "daily",
      n_target: frequency === "n_per_week" ? Number(n_target) || 3 : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("custom_goals")
      .update(patch)
      .eq("id", id)
      .eq("profile_id", uid)
      .is("archived_at", null)
      .select("id, title, subtitle, frequency, n_target, sort, archived_at, created_at")
      .single();
    if (error) throw error;
    return data;
  },

  async archiveCustomGoal(id) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("custom_goals")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", uid)
      .is("archived_at", null);
    if (error) throw error;
  },

  async addWeighin(weight, date = localDateIso()) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("weighins")
      .upsert(
        { profile_id: uid, date, weight: Number(weight) },
        { onConflict: "profile_id,date" },
      )
      .select("date, weight")
      .single();
    if (error) {
      // Fallback when unique index isn't migrated yet: update existing day, else insert.
      const existing = await supabase
        .from("weighins")
        .select("id")
        .eq("profile_id", uid)
        .eq("date", date)
        .maybeSingle();
      if (existing.data?.id) {
        const upd = await supabase
          .from("weighins")
          .update({ weight: Number(weight) })
          .eq("id", existing.data.id)
          .select("date, weight")
          .single();
        if (upd.error) throw upd.error;
        return { date: upd.data.date, w: Number(upd.data.weight) };
      }
      const ins = await supabase
        .from("weighins")
        .insert({ profile_id: uid, date, weight: Number(weight) })
        .select("date, weight")
        .single();
      if (ins.error) throw ins.error;
      return { date: ins.data.date, w: Number(ins.data.weight) };
    }
    return { date: data.date, w: Number(data.weight) };
  },

  async deleteWeighin(date) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("weighins")
      .delete()
      .eq("profile_id", uid)
      .eq("date", date);
    if (error) throw error;
  },

  async addMealLog(entry, date = entry?.logged_date || localDateIso()) {
    const uid = await requireUserId();
    const via = entry.via || normalizeVia({ source: entry.source, via: entry.via });
    const slot = normalizeMealSlot(entry.slot);
    const base = {
      profile_id: uid,
      date,
      name: entry.name,
      cal: entry.cal,
      p: entry.p,
      c: entry.c,
      f: entry.f,
    };
    const origin = entry.origin === "coach" ? "coach" : null;
    // Prefer origin + slot + via + source; degrade gracefully if columns aren't migrated yet.
    let { data, error } = await supabase
      .from("meal_logs")
      .insert({ ...base, via, source: viaToLegacySource(via), slot, origin })
      .select("id, date, name, cal, p, c, f, source, via, slot, origin")
      .single();
    if (error && /origin/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert({ ...base, via, source: viaToLegacySource(via), slot })
        .select("id, date, name, cal, p, c, f, source, via, slot")
        .single());
    }
    if (error && /slot/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert({ ...base, via, source: viaToLegacySource(via) })
        .select("id, date, name, cal, p, c, f, source, via")
        .single());
    }
    if (error && /via/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert({ ...base, source: viaToLegacySource(via) })
        .select("id, date, name, cal, p, c, f, source")
        .single());
    }
    if (error && /source/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert(base)
        .select("id, date, name, cal, p, c, f")
        .single());
    }
    if (error) throw error;
    const mapped = mapMealRows([data])[0];
    return mapped;
  },

  async updateMealLog(id, patch) {
    const uid = await requireUserId();
    const via = patch.via != null ? patch.via : undefined;
    const fields = {
      name: patch.name,
      cal: patch.cal,
      p: patch.p,
      c: patch.c,
      f: patch.f,
    };
    if (via != null) {
      fields.via = via;
      fields.source = viaToLegacySource(via);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "slot")) {
      fields.slot = normalizeMealSlot(patch.slot);
    }
    let { data, error } = await supabase
      .from("meal_logs")
      .update(fields)
      .eq("profile_id", uid)
      .eq("id", id)
      .select("id, date, name, cal, p, c, f, source, via, slot")
      .single();
    if (error && /slot/i.test(error.message || "")) {
      const { slot: _s, ...noSlot } = fields;
      ({ data, error } = await supabase
        .from("meal_logs")
        .update(noSlot)
        .eq("profile_id", uid)
        .eq("id", id)
        .select("id, date, name, cal, p, c, f, source, via")
        .single());
    }
    if (error && /via/i.test(error.message || "")) {
      const { via: _v, source: _src, ...noVia } = fields;
      ({ data, error } = await supabase
        .from("meal_logs")
        .update(noVia)
        .eq("profile_id", uid)
        .eq("id", id)
        .select("id, date, name, cal, p, c, f, source")
        .single());
    }
    if (error) throw error;
    return mapMealRows([data])[0];
  },

  async deleteMealLog(id) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("meal_logs")
      .delete()
      .eq("profile_id", uid)
      .eq("id", id);
    if (error) throw error;
  },

  async clearTodayMeals(date = localDateIso()) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("meal_logs")
      .delete()
      .eq("profile_id", uid)
      .eq("date", date);
    if (error) throw error;
  },

  /** Load water log rows for a Mon–Sun week → { byDate: { [iso]: [{id,oz,created_at}] } }. */
  async loadWaterLogsWeek(weekStart = wkStartOf()) {
    const uid = await requireUserId();
    const end = addDaysIso(weekStart, 6);
    return { byDate: await loadWaterLogsRange(uid, weekStart, end) };
  },

  async addWaterLog(oz, date = localDateIso()) {
    const uid = await requireUserId();
    const amount = Number(oz);
    if (!amount || amount <= 0) throw new Error("invalid oz");
    const { data, error } = await supabase
      .from("water_logs")
      .insert({ profile_id: uid, date, oz: amount })
      .select("id, date, oz, created_at")
      .single();
    if (error) throw error;
    return { id: data.id, oz: Number(data.oz), created_at: data.created_at, date: data.date };
  },

  /** Delete the most recent water_logs row for this date (undo last tap). */
  async undoLastWaterLog(date = localDateIso()) {
    const uid = await requireUserId();
    const { data: latest, error: findErr } = await supabase
      .from("water_logs")
      .select("id")
      .eq("profile_id", uid)
      .eq("date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!latest?.id) return null;
    const { error } = await supabase
      .from("water_logs")
      .delete()
      .eq("id", latest.id)
      .eq("profile_id", uid);
    if (error) throw error;
    return latest.id;
  },

  async updateBottleOz(oz) {
    const uid = await requireUserId();
    const n = Math.round(Number(oz));
    if (!n || n < 4 || n > 64) throw new Error("bottle size must be 4–64 oz");
    const { error } = await supabase
      .from("profiles")
      .update({ bottle_oz: n })
      .eq("id", uid);
    if (error) throw error;
    return n;
  },

  /**
   * Account page: name, DOB/age, phone, postpartum flags, goals, tastes.
   * Does not touch payment / role / status (DB triggers enforce).
   */
  async updateAccountProfile(patch = {}) {
    const uid = await requireUserId();
    const row = {};
    if (patch.name !== undefined) row.name = String(patch.name || "").trim().slice(0, 80) || null;
    if (patch.lastName !== undefined) row.last_name = String(patch.lastName || "").trim().slice(0, 80) || null;
    if (patch.phone !== undefined) row.phone = String(patch.phone || "").trim().slice(0, 40) || null;
    if (patch.dateOfBirth !== undefined) {
      const dob = String(patch.dateOfBirth || "").trim();
      if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        row.date_of_birth = dob;
        const derived = ageFromDateOfBirth(dob);
        if (derived != null) row.age = derived;
      } else if (!dob) {
        row.date_of_birth = null;
      }
    }
    if (patch.age !== undefined && row.age === undefined) {
      row.age = patch.age === "" || patch.age == null ? null : Number(patch.age);
    }
    if (patch.currentWeight !== undefined) {
      row.current_weight = patch.currentWeight === "" || patch.currentWeight == null
        ? null
        : Number(patch.currentWeight);
    }
    if (patch.goalWeight !== undefined) {
      row.goal_weight = patch.goalWeight === "" || patch.goalWeight == null
        ? null
        : Number(patch.goalWeight);
    }
    if (patch.pregnant !== undefined) row.pregnant = patch.pregnant;
    if (patch.breastfeeding !== undefined) row.breastfeeding = patch.breastfeeding;
    if (patch.monthsPP !== undefined) {
      row.months_pp = patch.monthsPP === "" || patch.monthsPP == null
        ? null
        : Number(patch.monthsPP);
    }
    if (patch.goal !== undefined) row.goal = patch.goal || null;
    if (patch.activity !== undefined) row.activity = patch.activity || null;
    if (patch.stress !== undefined) row.stress = patch.stress || null;
    if (patch.insulinResistance !== undefined) {
      row.insulin_resistance = !!patch.insulinResistance;
    }
    if (Object.keys(row).length === 0) return null;
    const { data, error } = await supabase
      .from("profiles")
      .update(row)
      .eq("id", uid)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return rowToProfile(data);
  },

  /** Upload/replace avatar image. Returns updated profile fields. */
  async uploadAvatar(file) {
    const uid = await requireUserId();
    if (!file || !(file instanceof Blob)) throw new Error("missing file");
    const mime = String(file.type || "").toLowerCase();
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    if (!allowed.has(mime)) throw new Error("Use a JPG, PNG, or WEBP photo.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");

    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${uid}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: mime, cacheControl: "3600" });
    if (upErr) throw upErr;

    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", uid)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return rowToProfile(data);
  },

  async removeAvatar() {
    const uid = await requireUserId();
    const { data: cur } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", uid)
      .maybeSingle();
    const path = cur?.avatar_path;
    if (path) {
      await supabase.storage.from("avatars").remove([path]);
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", uid)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return rowToProfile(data);
  },

  /** Update diet + allergens + food loves — used by planner + AI suggest. */
  async updateFoodPrefs({
    prefB, prefL, prefD, prefS, seasonNote, diet, allergens, allergenNote, foodAvoids,
  } = {}) {
    const uid = await requireUserId();
    const row = {
      pref_b: String(prefB || "").trim().slice(0, 500) || null,
      pref_l: String(prefL || "").trim().slice(0, 500) || null,
      pref_d: String(prefD || "").trim().slice(0, 500) || null,
      pref_s: String(prefS || "").trim().slice(0, 500) || null,
    };
    if (seasonNote !== undefined) {
      row.season_note = String(seasonNote || "").trim().slice(0, 1000) || null;
    }
    if (diet !== undefined) {
      const d = String(diet || "none").toLowerCase().trim();
      row.diet = ["none", "pescatarian", "vegetarian", "vegan"].includes(d) ? d : "none";
    }
    if (allergens !== undefined) {
      const allowed = new Set([
        "dairy", "eggs", "peanuts", "tree_nuts", "shellfish", "fish", "gluten", "soy", "sesame",
      ]);
      row.allergens = (Array.isArray(allergens) ? allergens : [])
        .map((a) => String(a || "").toLowerCase().trim())
        .filter((a, i, arr) => allowed.has(a) && arr.indexOf(a) === i);
    }
    if (allergenNote !== undefined) {
      row.allergen_note = String(allergenNote || "").trim().slice(0, 400) || null;
    }
    if (foodAvoids !== undefined) {
      row.food_avoids = String(foodAvoids || "").trim().slice(0, 500) || null;
    }
    const { error } = await supabase.from("profiles").update(row).eq("id", uid);
    if (error) throw error;
    return {
      prefB: row.pref_b || "",
      prefL: row.pref_l || "",
      prefD: row.pref_d || "",
      prefS: row.pref_s || "",
      ...(seasonNote !== undefined ? { seasonNote: row.season_note || "" } : {}),
      ...(diet !== undefined ? { diet: row.diet } : {}),
      ...(allergens !== undefined ? { allergens: row.allergens || [] } : {}),
      ...(allergenNote !== undefined ? { allergenNote: row.allergen_note || "" } : {}),
      ...(foodAvoids !== undefined ? { foodAvoids: row.food_avoids || "" } : {}),
    };
  },

  async loadRoster() {
    // Full admin directory: every profile including admins (so Callie/Patrick
    // can open their own row and test meal plans). Funnel stats still exclude admins.
    // RLS: only admins can select all profiles / email_events.
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;

    const allProfiles = profiles || [];
    const ids = allProfiles.map((p) => p.id);
    if (!ids.length) return { clients: [], stats: emptyAdminStats() };

    const curWk = wkStartOf();
    const today = localDateIso();
    // Enough history to know if she has logged within ~48h (yesterday or today).
    // Page past PostgREST’s 1000-row default — meal/water volume exceeds that in a cohort.
    const activitySince = addDaysIso(today, -14);
    const emailList = [...new Set(
      allProfiles
        .map((p) => String(p.email || "").trim().toLowerCase())
        .filter(Boolean),
    )];
    const [
      { data: macrosRows, error: mErr },
      { data: weighRows, error: wErr },
      { data: checkRows, error: cErr },
      mealPage,
      waterPage,
      leadPage,
      msgStatsPage,
      referralPage,
    ] = await Promise.all([
      supabase.from("macros").select("*").in("profile_id", ids),
      supabase.from("weighins").select("profile_id, date, weight").in("profile_id", ids).order("date", { ascending: true }),
      supabase.from("checkins").select("profile_id, week_start, item_id, day").in("profile_id", ids).eq("week_start", curWk),
      fetchAllRows(() =>
        supabase
          .from("meal_logs")
          .select("profile_id, date")
          .in("profile_id", ids)
          .gte("date", activitySince)
          .order("date", { ascending: false }),
      ),
      fetchAllRows(() =>
        supabase
          .from("water_logs")
          .select("profile_id, date")
          .in("profile_id", ids)
          .gte("date", activitySince)
          .order("date", { ascending: false }),
      ),
      emailList.length
        ? supabase.from("marketing_leads").select("email, first_name, last_name").in("email", emailList)
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc("admin_roster_message_stats"),
      supabase
        .from("referrals")
        .select("referred_user_id, advocate_user_id, code, status, created_at")
        .in("referred_user_id", ids)
        .in("status", ["paid", "pending_payment"]),
    ]);
    if (mErr) throw mErr;
    if (wErr) throw wErr;
    if (cErr) throw cErr;
    if (mealPage.error) console.warn("roster meal_logs lookup failed", mealPage.error);
    if (waterPage.error) console.warn("roster water_logs lookup failed", waterPage.error);
    if (leadPage.error) console.warn("roster marketing_leads lookup failed", leadPage.error);
    if (msgStatsPage.error) console.warn("roster message stats lookup failed", msgStatsPage.error);
    if (referralPage.error) console.warn("roster referrals lookup failed", referralPage.error);

    const leadByEmail = {};
    (leadPage.data || []).forEach((row) => {
      const key = String(row.email || "").trim().toLowerCase();
      if (key) leadByEmail[key] = row;
    });
    const msgById = {};
    (msgStatsPage.data || []).forEach((row) => {
      if (row?.client_id) msgById[row.client_id] = row;
    });
    const profilesById = Object.fromEntries(allProfiles.map((p) => [p.id, p]));
    const referredByById = referredByByUserId(referralPage.data || [], profilesById);

    const macrosBy = Object.fromEntries((macrosRows || []).map((m) => [m.profile_id, m]));
    const weighBy = {};
    (weighRows || []).forEach((w) => {
      if (!weighBy[w.profile_id]) weighBy[w.profile_id] = [];
      weighBy[w.profile_id].push({ date: w.date, w: Number(w.weight) });
    });
    const checksBy = {};
    (checkRows || []).forEach((c) => {
      if (!checksBy[c.profile_id]) checksBy[c.profile_id] = [];
      checksBy[c.profile_id].push(c);
    });
    const lastMealBy = maxDateByProfile(mealPage.data);
    const lastWaterBy = maxDateByProfile(waterPage.data);
    // Any logging event (meal / water / weigh-in) counts as active — not auth login.
    const lastActiveBy = { ...lastMealBy };
    maxDateByProfile(
      Object.entries(lastWaterBy).map(([profile_id, date]) => ({ profile_id, date })),
      lastActiveBy,
    );
    Object.entries(weighBy).forEach(([profileId, list]) => {
      (list || []).forEach((w) => {
        if (!w?.date || w.date < activitySince) return;
        if (!lastActiveBy[profileId] || w.date > lastActiveBy[profileId]) {
          lastActiveBy[profileId] = w.date;
        }
      });
    });

    const clients = allProfiles.map((p) => {
      const m = macrosBy[p.id] || null;
      const approved = !!(m?.approved || p.status === "active");
      const paid = !!p.paid;
      const refunded = !!p.refunded;
      const hasIntake = !!m;
      const isAdminRow = String(p.role || "").toLowerCase() === "admin";
      let stage = "signed_up";
      if (refunded) stage = "refunded";
      else if (paid && approved) stage = "active";
      else if (paid && hasIntake && !approved) stage = "awaiting_approval";
      else if (paid && !hasIntake) stage = "paid_awaiting_intake";
      else if (!paid) stage = "signed_up";
      // Admins with dashboard access often skip pay — still show as active when they have macros
      if (isAdminRow && hasIntake && approved) stage = "active";

      const lead = leadByEmail[String(p.email || "").trim().toLowerCase()] || {};
      const leadName = joinPersonName(lead.first_name, lead.last_name);
      const msg = msgById[p.id] || {};

      return {
        id: p.id,
        name: fullName(p) || leadName || "",
        firstName: p.name || lead.first_name || "",
        lastName: p.last_name || lead.last_name || "",
        email: p.email || "",
        age: p.age,
        currentWeight: p.current_weight,
        goalWeight: p.goal_weight,
        monthsPP: p.months_pp,
        breastfeeding: p.breastfeeding,
        pregnant: !!p.pregnant,
        diet: p.diet || "none",
        phone: p.phone,
        prefB: p.pref_b,
        prefL: p.pref_l,
        prefD: p.pref_d,
        prefS: p.pref_s,
        seasonNote: p.season_note || "",
        allergens: Array.isArray(p.allergens) ? p.allergens : [],
        allergenNote: p.allergen_note || "",
        foodAvoids: p.food_avoids || "",
        bottleOz: p.bottle_oz != null ? Number(p.bottle_oz) : 24,
        coachNote: p.coach_note || "",
        coachNoteAt: p.coach_note_at || null,
        coachNoteDismissedAt: p.coach_note_dismissed_at || null,
        status: p.status,
        // Live cohort calendar (profiles.week is often stuck at activate-time 1).
        // Guard so a calendar miss never blanks the whole admin roster / inbox names.
        week: (() => {
          try {
            return programWeekNumber(p.cohort_label) ?? p.week ?? 0;
          } catch (e) {
            console.warn("programWeekNumber failed", p.cohort_label, e);
            return p.week ?? 0;
          }
        })(),
        cohort_label: p.cohort_label || null,
        paid,
        refunded,
        comp: !!p.comp,
        paidAt: p.paid_at || null,
        createdAt: p.created_at || null,
        role: p.role,
        stage,
        hasIntake,
        macros: m
          ? {
              cal: m.cal,
              protein: m.protein,
              fat: m.fat,
              carbs: m.carbs,
              notes: m.notes || [],
              approved: !!m.approved,
            }
          : null,
        weighins: weighBy[p.id] || [],
        adherence: adherenceFromChecks(checksBy[p.id] || [], curWk),
        /** YYYY-MM-DD of most recent meal log in the last 14 days, or null. */
        lastMealDate: lastMealBy[p.id] || null,
        /**
         * YYYY-MM-DD of most recent meal, water, or weigh-in in the last 14 days.
         * Used for the roster “quiet” flag — not auth last_sign_in.
         */
        lastActiveDate: lastActiveBy[p.id] || null,
        lastAdminAt: msg.last_admin_at || null,
        unreadFromMama: Number(msg.unread_from_mama) || 0,
        referredBy: referredByById[p.id] || null,
      };
    });

    const nonAdminClients = clients.filter((c) => String(c.role || "").toLowerCase() !== "admin");
    const stats = {
      signups: nonAdminClients.length,
      paid: nonAdminClients.filter((c) => c.paid && !c.refunded && !c.comp).length,
      unpaid: nonAdminClients.filter((c) => !c.paid && !c.refunded).length,
      awaitingIntake: nonAdminClients.filter((c) => c.stage === "paid_awaiting_intake").length,
      awaitingApproval: nonAdminClients.filter((c) => c.stage === "awaiting_approval").length,
      active: nonAdminClients.filter((c) => c.stage === "active").length,
      refunded: nonAdminClients.filter((c) => c.stage === "refunded").length,
    };

    return { clients, stats };
  },

  async loadEmailEvents(profileId) {
    if (!profileId) return [];
    const { data, error } = await supabase
      .from("email_events")
      .select("id, profile_id, email_type, to_email, subject, status, resend_id, meta, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // Table may not exist until migration 006 is run
      console.warn("loadEmailEvents failed", error);
      return [];
    }
    return data || [];
  },

  /**
   * Admin: every logged send to this address (quiz drips included; profile_id may be null).
   * Case-insensitive exact match on to_email — not the last-N global log.
   */
  async loadEmailEventsByEmail(email, limit = 50) {
    const raw = String(email || "").trim();
    if (!raw) return [];
    const target = raw.toLowerCase();
    const pattern = raw.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
    const { data, error } = await supabase
      .from("email_events")
      .select("id, profile_id, email_type, to_email, subject, status, resend_id, meta, created_at")
      .ilike("to_email", pattern)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadEmailEventsByEmail failed", error);
      return [];
    }
    return (data || []).filter(
      (row) => String(row?.to_email || "").trim().toLowerCase() === target,
    );
  },

  async loadPersonOverrides() {
    const { data, error } = await supabase
      .from("person_overrides")
      .select("email_lower, snoozed_until, marked_cold, last_touch_at, updated_at");
    if (error) {
      console.warn("loadPersonOverrides failed", error);
      return [];
    }
    return data || [];
  },

  async savePersonOverride(email, patch = {}) {
    const email_lower = String(email || "").trim().toLowerCase();
    if (!email_lower) return null;
    const uid = await requireUserId();
    const row = {
      email_lower,
      updated_by: uid,
      updated_at: new Date().toISOString(),
      ...patch,
    };
    const { data, error } = await supabase
      .from("person_overrides")
      .upsert(row, { onConflict: "email_lower" })
      .select("email_lower, snoozed_until, marked_cold, last_touch_at")
      .maybeSingle();
    if (error) {
      console.warn("savePersonOverride failed", error);
      return null;
    }
    return data;
  },

  async recordAdminTouch(email, kind = "open", profileId = null) {
    const email_lower = String(email || "").trim().toLowerCase();
    if (!email_lower) return;
    const uid = await requireUserId();
    const { error } = await supabase.from("admin_touches").insert({
      email_lower,
      kind: String(kind || "open").slice(0, 40),
      profile_id: profileId || null,
      created_by: uid,
    });
    if (error) console.warn("recordAdminTouch failed", error);
    await this.savePersonOverride(email_lower, { last_touch_at: new Date().toISOString() });
  },

  async loadLatestEmailEventsByEmails(emails, perEmail = 8) {
    const raw = [...new Set((emails || []).map((e) => String(e || "").trim()).filter(Boolean))];
    const list = [...new Set(raw.flatMap((e) => [e, e.toLowerCase()]))];
    if (!list.length) return {};
    const { data, error } = await supabase
      .from("email_events")
      .select("id, profile_id, email_type, to_email, subject, status, created_at")
      .in("to_email", list)
      .order("created_at", { ascending: false })
      .limit(Math.min(list.length * perEmail, 800));
    if (error) {
      console.warn("loadLatestEmailEventsByEmails failed", error);
      return {};
    }
    const byEmail = {};
    for (const row of data || []) {
      const key = String(row.to_email || "").trim().toLowerCase();
      if (!key) continue;
      if (!byEmail[key]) byEmail[key] = [];
      if (byEmail[key].length < perEmail) byEmail[key].push(row);
    }
    return byEmail;
  },

  async loadUnsubscribedEmailSet(emails) {
    const list = [...new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return new Set();
    const { data, error } = await supabase
      .from("email_unsubscribes")
      .select("email")
      .in("email", list);
    if (error) {
      console.warn("loadUnsubscribedEmailSet failed", error);
      return new Set();
    }
    return new Set((data || []).map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean));
  },

  async loadClientSummary(profileId, forDate) {
    if (!profileId) return null;
    const day = forDate || new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("client_summaries")
      .select("profile_id, for_date, summary, suggested_touch, model, created_at")
      .eq("profile_id", profileId)
      .eq("for_date", day)
      .maybeSingle();
    if (error) {
      console.warn("loadClientSummary failed", error);
      return null;
    }
    return data;
  },

  async saveClientSummary(row) {
    if (!row?.profile_id || !row?.for_date || !row?.summary) return null;
    const { data, error } = await supabase
      .from("client_summaries")
      .upsert({
        profile_id: row.profile_id,
        for_date: row.for_date,
        summary: String(row.summary).slice(0, 2000),
        suggested_touch: row.suggested_touch ? String(row.suggested_touch).slice(0, 500) : null,
        model: row.model ? String(row.model).slice(0, 120) : null,
      }, { onConflict: "profile_id,for_date" })
      .select("profile_id, for_date, summary, suggested_touch, model, created_at")
      .maybeSingle();
    if (error) {
      console.warn("saveClientSummary failed", error);
      return null;
    }
    return data;
  },

  async isEmailUnsubscribed(email) {
    const target = String(email || "").trim().toLowerCase();
    if (!target) return false;
    const { data, error } = await supabase
      .from("email_unsubscribes")
      .select("email")
      .eq("email", target)
      .maybeSingle();
    if (error) {
      console.warn("isEmailUnsubscribed failed", error);
      return false;
    }
    return Boolean(data?.email);
  },

  /** Admin: cohort waitlist rows for the next open blast. */
  async loadCohortWaitlist(cohort = "cohort_2", limit = 200) {
    const { data, error } = await supabase
      .from("cohort_waitlist")
      .select("id, email, first_name, last_name, phone, cohort, converted_at, paid_at, created_at")
      .eq("cohort", cohort)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadCohortWaitlist failed", error);
      return [];
    }
    return data || [];
  },

  async loadRecentEmailEvents(limit = 20) {
    const cols = "id, profile_id, email_type, to_email, subject, status, meta, created_at";
    const withNames = await supabase
      .from("email_events")
      .select(`${cols}, profiles(name, last_name, email)`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!withNames.error) return withNames.data || [];
    const { data, error } = await supabase
      .from("email_events")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadRecentEmailEvents failed", error);
      return [];
    }
    return data || [];
  },

  /** AI failures in the last 24h, newest first. Empty when migration 018 hasn't run. */
  async loadAiFailures(hours = 24, limit = 50) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ai_failures")
      .select("id, profile_id, label, kind, status, model, detail, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadAiFailures failed", error);
      return [];
    }
    return data || [];
  },

  async updateClientMacros(clientId, macros) {
    const { error } = await supabase
      .from("macros")
      .update({
        cal: macros.cal,
        protein: macros.protein,
        fat: macros.fat,
        carbs: macros.carbs,
        notes: macros.notes || [],
      })
      .eq("profile_id", clientId);
    if (error) throw error;
  },

  /**
   * Admin-only: mark / unmark a complimentary seat.
   * Marking sets paid=true so she keeps dashboard access. Never writes Stripe ids.
   * Prefer POST /api/admin-comp so the You're in welcome email can send.
   */
  async setClientComp(clientId, comp) {
    if (!clientId) throw new Error("client required");
    const next = !!comp;
    const patch = next ? { comp: true, paid: true } : { comp: false };
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", clientId)
      .select("comp, paid")
      .single();
    if (error) throw error;
    return { comp: !!data.comp, paid: !!data.paid };
  },

  async approveClient(clientId) {
    const { error: mErr } = await supabase
      .from("macros")
      .update({ approved: true })
      .eq("profile_id", clientId);
    if (mErr) throw mErr;

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ status: "active", week: 1 })
      .eq("id", clientId);
    if (pErr) throw pErr;
  },

  /** Callie → mama note on Today. Empty string clears. (legacy — prefer Messages) */
  async saveCoachNote(clientId, note) {
    if (!clientId) throw new Error("client required");
    const trimmed = String(note || "").trim().slice(0, 1000);
    const row = trimmed
      ? {
        coach_note: trimmed,
        coach_note_at: new Date().toISOString(),
        coach_note_dismissed_at: null,
      }
      : {
        coach_note: null,
        coach_note_at: null,
        coach_note_dismissed_at: null,
      };
    const { data, error } = await supabase
      .from("profiles")
      .update(row)
      .eq("id", clientId)
      .select("coach_note, coach_note_at, coach_note_dismissed_at")
      .single();
    if (error) throw error;
    return {
      coachNote: data.coach_note || "",
      coachNoteAt: data.coach_note_at || null,
      coachNoteDismissedAt: data.coach_note_dismissed_at || null,
    };
  },

  /** Mama dismisses Callie's note on Today. */
  async dismissCoachNote() {
    const uid = await requireUserId();
    const at = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ coach_note_dismissed_at: at })
      .eq("id", uid);
    if (error) throw error;
    return { coachNoteDismissedAt: at };
  },

  /** Mama dismisses the Getting Started home-screen tip (sticky across devices). */
  async dismissHomescreenTip() {
    const uid = await requireUserId();
    const at = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ homescreen_tip_dismissed_at: at })
      .eq("id", uid);
    if (error) throw error;
    return { homescreenTipDismissedAt: at };
  },

  async listMyChannels() {
    const uid = await requireUserId();
    const [{ data: profile, error: profileErr }, { data, error }] = await Promise.all([
      supabase.from("profiles").select("id, tier, role, cohort_label").eq("id", uid).maybeSingle(),
      supabase
        .from("conversation_members")
        .select(`
          conversation_id,
          user_id,
          joined_at,
          removed_at,
          notify_level,
          last_read_at,
          conversations (
            id,
            type,
            cohort_label,
            label,
            read_only,
            guidelines,
            created_at
          )
        `)
        .eq("user_id", uid)
        .is("removed_at", null),
    ]);
    if (profileErr) throw profileErr;
    if (error) throw error;
    const tier = String(profile?.tier || "none");
    const isAdmin = String(profile?.role || "").toLowerCase() === "admin";
    const myCohort = String(profile?.cohort_label || "");
    // Live cohort pills for admins/Callie. Mamas always see only their own cohort.
    const liveAdminCohorts = parseLiveChannelCohorts(
      import.meta.env.VITE_LIVE_CHANNEL_COHORTS,
    );
    return (data || [])
      .map((row) => {
        const { conversations, ...membership } = row;
        return {
          conversation: conversations || null,
          membership,
        };
      })
      .filter(({ conversation }) => {
        if (!conversation) return false;
        // Alumni pill only when the mama is actually alumni (stage 4) — not for admin empty rooms.
        if (conversation.type === "alumni") return tier === "alumni_49";
        if (conversation.type !== "cohort") return false;
        if (!isAdmin) return !!myCohort && conversation.cohort_label === myCohort;
        // Admins: live cohorts + any cohort stamped on this admin profile (test accounts).
        return liveAdminCohorts.has(String(conversation.cohort_label || ""))
          || (!!myCohort && conversation.cohort_label === myCohort);
      })
      .sort((a, b) => String(a.conversation?.label || "").localeCompare(
        String(b.conversation?.label || ""),
        undefined,
        { sensitivity: "base" },
      ));
  },

  async loadChannelMessages(conversationId, { limit = 150 } = {}) {
    if (!conversationId) return [];
    const { data, error } = await supabase
      .from("conversation_messages")
      .select(CHANNEL_MESSAGE_SELECT)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(300, Math.max(1, limit)));
    if (error) throw error;
    const withAttachments = await hydrateChannelAttachments(chronologicalMessages(data));
    const withSenders = await hydrateChannelSenders(withAttachments, conversationId);
    const withReplies = attachChannelReplyPreviews(withSenders);
    return hydrateChannelReactions(withReplies);
  },

  async toggleChannelReaction(messageId, emoji) {
    return toggleMessageReaction("channel", messageId, emoji);
  },

  async sendChannelMessage({
    conversationId,
    body,
    file = null,
    replyToId = null,
    clientMessageId = null,
  }) {
    const uid = await requireUserId();
    if (!conversationId) throw new Error("channel required");
    const idempotencyKey = messageIdempotencyKey(clientMessageId);
    const text = String(body || "").trim().slice(0, 2000);
    const prior = await supabase
      .from("conversation_messages")
      .select(CHANNEL_MESSAGE_SELECT)
      .eq("sender_id", uid)
      .eq("client_message_id", idempotencyKey)
      .maybeSingle();
    if (prior.error) throw prior.error;
    assertIdempotentPayload(prior.data, {
      body: text,
      replyToId,
      file,
      targetField: "conversation_id",
      targetId: conversationId,
    });
    let data = prior.data || null;
    let attachment = null;
    if (!data && file) {
      let allowAudio = false;
      if (isAudioMime(file.type)) {
        const { data: me, error: roleErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        if (roleErr) throw roleErr;
        allowAudio = String(me?.role || "").toLowerCase() === "admin";
        if (!allowAudio) throw new Error("Only Callie can send voice memos.");
      }
      attachment = await uploadChannelAttachment({ conversationId, file, allowAudio });
    }
    if (!data) {
      if (text.length < 1 && !attachment) throw new Error("Message is empty");
      const inserted = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: uid,
          client_message_id: idempotencyKey,
          body: text,
          kind: "chat",
          ...(replyToId ? { reply_to_id: replyToId } : {}),
          ...(attachment
            ? {
              attachment_path: attachment.path,
              attachment_name: attachment.name,
              attachment_mime: attachment.mime,
              attachment_bytes: attachment.bytes,
            }
            : {}),
        })
        .select(CHANNEL_MESSAGE_SELECT)
        .single();
      if (!inserted.error) {
        data = inserted.data;
      } else {
        // An HTTP failure can be ambiguous: the row may have committed. Query
        // before removing anything and only delete an object proven unreferenced.
        const existing = await supabase
          .from("conversation_messages")
          .select(CHANNEL_MESSAGE_SELECT)
          .eq("sender_id", uid)
          .eq("client_message_id", idempotencyKey)
          .maybeSingle();
        if (existing.error) throw existing.error;
        try {
          assertIdempotentPayload(existing.data, {
            body: text,
            replyToId,
            file,
            targetField: "conversation_id",
            targetId: conversationId,
          });
        } catch (conflictError) {
          await removeUploadedAttachment(CHANNEL_ATTACHMENT_BUCKET, attachment?.path);
          throw conflictError;
        }
        if (existing.data) {
          if (attachment?.path && attachment.path !== existing.data.attachment_path) {
            await removeUploadedAttachment(CHANNEL_ATTACHMENT_BUCKET, attachment.path);
          }
          data = existing.data;
        } else {
          if (isDefinitiveInsertRejection(inserted.error)) {
            await removeUploadedAttachment(CHANNEL_ATTACHMENT_BUCKET, attachment?.path);
          }
          throw inserted.error;
        }
      }
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        fetch("/api/channel-notify", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messageId: data.id }),
        }).catch((e) => console.warn("channel-notify failed", e));
      }
    } catch (e) {
      console.warn("channel-notify invoke failed", e);
    }
    const [hydrated] = await hydrateChannelSenders(
      await hydrateChannelAttachments([data]),
      conversationId,
    );
    const withReply = attachChannelReplyPreviews(
      hydrated ? [hydrated] : [data],
      // Parent may already be on-screen; caller merges. Best-effort from row alone.
    )[0];
    return withReply || hydrated || data;
  },

  async editChannelMessage(messageId, body) {
    const uid = await requireUserId();
    if (!messageId) throw new Error("message required");
    const text = String(body || "").trim().slice(0, 2000);
    if (text.length < 1) throw new Error("Message is empty");
    const { data, error } = await supabase
      .from("conversation_messages")
      .update({
        body: text,
        edited_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", uid)
      .is("deleted_at", null)
      .select(CHANNEL_MESSAGE_SELECT)
      .single();
    if (error) throw error;
    const [hydrated] = await hydrateChannelSenders(
      await hydrateChannelAttachments([data]),
      data.conversation_id,
    );
    return hydrated || data;
  },

  async deleteChannelMessage(messageId) {
    const uid = await requireUserId();
    if (!messageId) throw new Error("message required");
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();
    const isAdmin = String(me?.role || "").toLowerCase() === "admin";

    let existingQuery = supabase
      .from("conversation_messages")
      .select("id, attachment_path, sender_id")
      .eq("id", messageId)
      .is("deleted_at", null);
    if (!isAdmin) existingQuery = existingQuery.eq("sender_id", uid);
    const { data: existing } = await existingQuery.maybeSingle();
    if (!existing) throw new Error("Message not found.");
    const attachmentPath = existing.attachment_path || null;

    let delQuery = supabase
      .from("conversation_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .is("deleted_at", null);
    if (!isAdmin) delQuery = delQuery.eq("sender_id", uid);
    const { data, error } = await delQuery.select(CHANNEL_MESSAGE_SELECT).single();
    if (error) throw error;

    // Only remove storage if we own the file folder (or admin).
    if (attachmentPath) {
      const parts = String(attachmentPath).split("/");
      const ownerFolder = parts[1] || "";
      if (isAdmin || ownerFolder === uid) {
        try {
          await supabase.storage.from(CHANNEL_ATTACHMENT_BUCKET).remove([attachmentPath]);
        } catch (e) {
          console.warn("channel attachment cleanup failed", e);
        }
      }
    }
    return data;
  },

  async markChannelRead(conversationId) {
    const uid = await requireUserId();
    if (!conversationId) return null;
    const at = new Date().toISOString();
    const { data, error } = await supabase
      .from("conversation_members")
      .update({ last_read_at: at })
      .eq("conversation_id", conversationId)
      .eq("user_id", uid)
      .is("removed_at", null)
      .select("conversation_id, user_id, joined_at, removed_at, notify_level, last_read_at")
      .maybeSingle();
    if (error) throw error;
    return data || { conversation_id: conversationId, user_id: uid, last_read_at: at };
  },

  async updateChannelNotifyLevel(conversationId, level) {
    const uid = await requireUserId();
    if (!conversationId) throw new Error("channel required");
    const normalized = String(level || "").toLowerCase();
    if (!["all", "highlights", "mute"].includes(normalized)) {
      throw new Error("Invalid notification setting");
    }
    const { data, error } = await supabase
      .from("conversation_members")
      .update({ notify_level: normalized })
      .eq("conversation_id", conversationId)
      .eq("user_id", uid)
      .is("removed_at", null)
      .select("conversation_id, user_id, joined_at, removed_at, notify_level, last_read_at")
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  channelHasUnread,

  /** Load 1:1 thread for a mama (self or admin viewing client). */
  async loadMessages(clientId, { limit = 100 } = {}) {
    if (!clientId) return [];
    const { data, error } = await supabase
      .from("messages")
      .select(DM_MESSAGE_SELECT)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(200, Math.max(1, limit)));
    if (error) throw error;
    const withAttachments = await hydrateMessageAttachments(chronologicalMessages(data));
    const withReplies = attachReplyPreviews(withAttachments);
    return hydrateDmReactions(withReplies);
  },

  async toggleDmReaction(messageId, emoji) {
    return toggleMessageReaction("dm", messageId, emoji);
  },

  async sendMessage({
    clientId,
    body,
    file = null,
    replyToId = null,
    clientMessageId = null,
  }) {
    const uid = await requireUserId();
    if (!clientId) throw new Error("client required");
    const idempotencyKey = messageIdempotencyKey(clientMessageId);
    const text = String(body || "").trim().slice(0, 2000);
    const prior = await supabase
      .from("messages")
      .select(DM_MESSAGE_SELECT)
      .eq("sender_id", uid)
      .eq("client_message_id", idempotencyKey)
      .maybeSingle();
    if (prior.error) throw prior.error;
    assertIdempotentPayload(prior.data, {
      body: text,
      replyToId,
      file,
      targetField: "client_id",
      targetId: clientId,
    });
    let data = prior.data || null;
    let attachment = null;
    if (!data && file) {
      let allowAudio = false;
      if (isAudioMime(file.type)) {
        const { data: me, error: roleErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        if (roleErr) throw roleErr;
        allowAudio = String(me?.role || "").toLowerCase() === "admin";
        if (!allowAudio) throw new Error("Only Callie can send voice memos.");
      }
      attachment = await uploadMessageAttachment({ clientId, file, allowAudio });
    }
    if (!data) {
      if (text.length < 1 && !attachment) throw new Error("Message is empty");
      const inserted = await supabase
        .from("messages")
        .insert({
          client_id: clientId,
          sender_id: uid,
          client_message_id: idempotencyKey,
          body: text,
          kind: "chat",
          ...(replyToId ? { reply_to_id: replyToId } : {}),
          ...(attachment
            ? {
              attachment_path: attachment.path,
              attachment_name: attachment.name,
              attachment_mime: attachment.mime,
              attachment_bytes: attachment.bytes,
            }
            : {}),
        })
        .select(DM_MESSAGE_SELECT)
        .single();
      if (!inserted.error) {
        data = inserted.data;
      } else {
        const existing = await supabase
          .from("messages")
          .select(DM_MESSAGE_SELECT)
          .eq("sender_id", uid)
          .eq("client_message_id", idempotencyKey)
          .maybeSingle();
        if (existing.error) throw existing.error;
        try {
          assertIdempotentPayload(existing.data, {
            body: text,
            replyToId,
            file,
            targetField: "client_id",
            targetId: clientId,
          });
        } catch (conflictError) {
          await removeUploadedAttachment(MESSAGE_ATTACHMENT_BUCKET, attachment?.path);
          throw conflictError;
        }
        if (existing.data) {
          if (attachment?.path && attachment.path !== existing.data.attachment_path) {
            await removeUploadedAttachment(MESSAGE_ATTACHMENT_BUCKET, attachment.path);
          }
          data = existing.data;
        } else {
          if (isDefinitiveInsertRejection(inserted.error)) {
            await removeUploadedAttachment(MESSAGE_ATTACHMENT_BUCKET, attachment?.path);
          }
          throw inserted.error;
        }
      }
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        fetch("/api/message-notify", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messageId: data.id }),
        }).catch((e) => console.warn("message-notify failed", e));
      }
    } catch (e) {
      console.warn("message-notify invoke failed", e);
    }
    const [hydrated] = await hydrateMessageAttachments([data]);
    const withReply = attachReplyPreviews(hydrated ? [hydrated] : [data])[0];
    return withReply || hydrated || data;
  },

  /**
   * Admin broadcast: inserts an announcement into each mama thread + push/email.
   * audience: "active" (default) | "all_mamas"
   */
  async broadcastAnnouncement({ body, audience = "active" } = {}) {
    await requireUserId();
    const text = String(body || "").trim().slice(0, 2000);
    if (text.length < 1) throw new Error("Announcement is empty");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const resp = await fetch("/api/admin-broadcast", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body: text, audience }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = data.detail ? `: ${data.detail}` : "";
      throw new Error(`${data.error || "Broadcast failed"}${detail}`);
    }
    return data;
  },

  /**
   * Upload a single Monday voice-drop audio file (admins only via Storage RLS).
   * Returns { path, mime, bytes }.
   */
  async uploadVoiceDropAudio(file) {
    await requireUserId();
    if (!file) throw new Error("Audio required");
    const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
    if (!mime.startsWith("audio/")) throw new Error("Voice drop must be audio.");
    if (!MESSAGE_AUDIO_MIME.has(mime)) {
      throw new Error("Unsupported audio format — try again from Safari or Chrome.");
    }
    if (file.size > VOICE_DROP_MAX_BYTES) {
      throw new Error("That voice drop is over 50 MB — try a shorter recording.");
    }
    const id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ext = mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")
      ? "m4a"
      : mime.includes("mpeg")
        ? "mp3"
        : mime.includes("ogg")
          ? "ogg"
          : "webm";
    const path = `${id}/monday-voice.${ext}`;
    const { error } = await supabase.storage
      .from("voice-drops")
      .upload(path, file, { contentType: mime, upsert: false });
    if (error) {
      console.error("voice drop upload failed", error);
      throw new Error("Couldn’t upload the voice drop — try again.");
    }
    return { path, mime, bytes: Number(file.size) || null };
  },

  /**
   * Publish Monday voice drop (Today banner only — no Messages copies).
   * audience: "admins" | "active" | "all_mamas"
   * cohortLabel: required when audience is active (one cohort, not all).
   * notify: push/email when true (keep false while testing on preview).
   */
  async publishVoiceDrop({
    file,
    caption = "",
    audience = "active",
    cohortLabel = "",
    notify = false,
    durationMs = null,
  } = {}) {
    await requireUserId();
    const uploaded = await this.uploadVoiceDropAudio(file);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const resp = await fetch("/api/admin-voice-drop", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        caption: String(caption || "").trim().slice(0, 500),
        audience,
        cohortLabel: String(cohortLabel || "").trim(),
        notify: notify === true,
        audioPath: uploaded.path,
        audioMime: uploaded.mime,
        audioBytes: uploaded.bytes,
        durationMs: durationMs != null ? Number(durationMs) : null,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Voice drop failed");
    return data;
  },

  /**
   * Re-send push/email for an already-published voice drop (skips emails already logged).
   * Use after a timed-out notify so the banner stays live and remaining mamas get pinged.
   */
  async resendVoiceDropNotify(dropId) {
    await requireUserId();
    const id = String(dropId || "").trim();
    if (!id) throw new Error("dropId required");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const resp = await fetch("/api/admin-voice-drop", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ resendNotify: true, dropId: id }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Couldn’t resend notifications");
    return data;
  },

  /** Current published, non-expired drop the signed-in user is allowed to see. */
  async loadCurrentVoiceDrop() {
    await requireUserId();
    const { data, error } = await supabase
      .from("voice_drops")
      .select("id, caption, audio_path, audio_mime, audio_bytes, duration_ms, audience, published_at, expires_at, status")
      .eq("status", "published")
      .gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.audio_path) return null;
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from("voice-drops")
        .createSignedUrl(data.audio_path, 60 * 60);
      if (signErr) {
        console.warn("voice drop signed url failed", signErr);
        return { ...data, audioUrl: null };
      }
      return { ...data, audioUrl: signed?.signedUrl || null, durationMs: data.duration_ms };
    } catch (e) {
      console.warn("voice drop signed url failed", e);
      return { ...data, audioUrl: null, durationMs: data.duration_ms };
    }
  },

  /** Admin: live drops (one per group can be up) plus the newest row. */
  async loadVoiceDropAdminStatus() {
    await requireUserId();
    const { data, error } = await supabase
      .from("voice_drops")
      .select("id, caption, audio_path, audio_mime, duration_ms, audience, cohort_label, published_at, expires_at, status")
      .order("published_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    const rows = data || [];
    const now = Date.now();
    const live = rows.filter((r) => (
      r.status === "published"
      && r.expires_at
      && Date.parse(r.expires_at) > now
    ));
    const signTargets = live.length ? live : (rows[0] ? [rows[0]] : []);
    const signed = await Promise.all(signTargets.map(async (row) => {
      let audioUrl = null;
      if (row.audio_path) {
        const { data: signedUrl } = await supabase.storage
          .from("voice-drops")
          .createSignedUrl(row.audio_path, 60 * 60);
        audioUrl = signedUrl?.signedUrl || null;
      }
      return { ...row, audioUrl, durationMs: row.duration_ms };
    }));
    const byId = Object.fromEntries(signed.map((r) => [r.id, r]));
    const hydrate = (row) => byId[row.id] || { ...row, audioUrl: null, durationMs: row.duration_ms };
    return {
      live: live.map(hydrate),
      latest: rows[0] ? hydrate(rows[0]) : null,
    };
  },

  /** Admin: latest drop row (any status) for the Messages card status line. */
  async loadLatestVoiceDropAdmin() {
    const status = await this.loadVoiceDropAdminStatus();
    return status.latest;
  },

  async editMessage(messageId, body) {
    const uid = await requireUserId();
    if (!messageId) throw new Error("message required");
    const text = String(body || "").trim().slice(0, 2000);
    if (text.length < 1) throw new Error("Message is empty");
    const { data, error } = await supabase
      .from("messages")
      .update({
        body: text,
        edited_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", uid)
      .is("deleted_at", null)
      .select(DM_MESSAGE_SELECT)
      .single();
    if (error) throw error;
    const [hydrated] = await hydrateMessageAttachments([data]);
    return hydrated || data;
  },

  async deleteMessage(messageId) {
    const uid = await requireUserId();
    if (!messageId) throw new Error("message required");
    // Load path first so we can remove the storage object after scrub.
    const { data: existing } = await supabase
      .from("messages")
      .select("id, attachment_path")
      .eq("id", messageId)
      .eq("sender_id", uid)
      .is("deleted_at", null)
      .maybeSingle();
    const attachmentPath = existing?.attachment_path || null;

    const { data, error } = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", uid)
      .is("deleted_at", null)
      .select(DM_MESSAGE_SELECT)
      .single();
    if (error) throw error;

    if (attachmentPath) {
      try {
        await supabase.storage.from("message-attachments").remove([attachmentPath]);
      } catch (e) {
        console.warn("message attachment cleanup failed", e);
      }
    }
    return data;
  },

  async markMessagesRead(clientId, readerId) {
    if (!clientId || !readerId) return;
    // Mama threads: admins only clear mama→coach unread. Do not stamp read_at on
    // another admin’s outbound (those stay unread until the mama opens Messages).
    const { data: roles, error: roleErr } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", [clientId, readerId]);
    if (roleErr) {
      console.warn("markMessagesRead role lookup failed", roleErr);
      return;
    }
    const roleOf = (id) => String((roles || []).find((p) => p.id === id)?.role || "").toLowerCase();
    const readerIsAdmin = roleOf(readerId) === "admin";
    const threadIsMama = roleOf(clientId) !== "admin";

    let q = supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .is("read_at", null)
      .is("deleted_at", null)
      .neq("sender_id", readerId);
    if (readerIsAdmin && threadIsMama) {
      q = q.eq("sender_id", clientId);
    }
    const { error } = await q;
    if (error) console.warn("markMessagesRead failed", error);
  },

  async countUnreadMessages(clientId, readerId) {
    if (!clientId || !readerId) return 0;
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("read_at", null)
      .is("deleted_at", null)
      .neq("sender_id", readerId);
    if (error) {
      console.warn("countUnreadMessages failed", error);
      return 0;
    }
    return count || 0;
  },

  async loadMessageInbox(readerId = null) {
    const { data: inboxRows, error: inboxError } = await supabase
      .rpc("load_admin_message_inbox");
    if (!inboxError) {
      return hydrateInboxPeers((inboxRows || []).map((row) => ({
        clientId: row.client_id,
        lastMessage: row.last_message,
        unread: Number(row.unread) || 0,
        participantIds: Array.isArray(row.participant_ids) ? row.participant_ids : [],
      })));
    }
    // Backward-compatible only during migration rollout. Once the RPC is
    // installed, real database errors must surface instead of hiding behind
    // the old globally-truncated inbox query.
    if (!["PGRST202", "42883"].includes(String(inboxError.code || ""))) {
      throw inboxError;
    }
    console.warn("message inbox RPC unavailable; using rollout fallback", inboxError);

    const [{ data: msgs, error }, { data: admins, error: adminErr }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, client_id, sender_id, body, kind, created_at, read_at, edited_at, deleted_at, attachment_path, attachment_name, attachment_mime, attachment_bytes")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("profiles").select("id").eq("role", "admin"),
    ]);
    if (error) throw error;
    if (adminErr) console.warn("loadMessageInbox admin lookup failed", adminErr);
    const adminIds = new Set((admins || []).map((a) => a.id));

    const byClient = new Map();
    for (const m of msgs || []) {
      if (!byClient.has(m.client_id)) {
        byClient.set(m.client_id, {
          clientId: m.client_id,
          lastMessage: m,
          unread: 0,
          participantIds: new Set(),
        });
      }
      const row = byClient.get(m.client_id);
      row.participantIds.add(m.sender_id);
      row.participantIds.add(m.client_id);
      // Prefer a non-deleted last preview when possible
      if (row.lastMessage?.deleted_at && !m.deleted_at) {
        row.lastMessage = m;
      }
      // Admin inbox: only mama→coach (or admin↔admin DM). Never Callie's own
      // outbound sitting unread for the mama — that was lighting false badges.
      if (m.deleted_at || m.read_at) continue;
      if (readerId && m.sender_id === readerId) continue;
      const senderIsAdmin = adminIds.has(m.sender_id);
      const threadIsAdminDm = adminIds.has(m.client_id);
      if (senderIsAdmin && !threadIsAdminDm) continue;
      row.unread += 1;
    }
    return hydrateInboxPeers(
      [...byClient.values()]
        .map((row) => ({
          ...row,
          participantIds: [...row.participantIds],
        }))
        .sort(
          (a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at),
        ),
    );
  },

  async savePushSubscription({ endpoint, p256dh, auth, userAgent }) {
    const uid = await requireUserId();
    if (!endpoint || !p256dh || !auth) throw new Error("invalid subscription");
    const appOrigin = typeof window !== "undefined" ? window.location.origin : null;
    const { error } = await supabase.from("push_subscriptions").upsert({
      profile_id: uid,
      endpoint: String(endpoint).slice(0, 2000),
      p256dh: String(p256dh).slice(0, 200),
      auth: String(auth).slice(0, 200),
      user_agent: String(userAgent || "").slice(0, 300) || null,
      app_origin: appOrigin,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    const adminOrigin = (() => {
      try {
        return new URL(
          import.meta.env.VITE_ADMIN_APP_URL || "https://admin.macrosandmamas.com",
        ).origin;
      } catch {
        return "";
      }
    })();
    if (appOrigin && appOrigin === adminOrigin) {
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      if (String(me?.role || "").toLowerCase() === "admin") {
        const currentEndpoint = String(endpoint).slice(0, 2000);
        const [legacy, otherOrigins] = await Promise.all([
          supabase
            .from("push_subscriptions")
            .delete()
            .eq("profile_id", uid)
            .is("app_origin", null)
            .neq("endpoint", currentEndpoint),
          supabase
            .from("push_subscriptions")
            .delete()
            .eq("profile_id", uid)
            .neq("app_origin", appOrigin)
            .neq("endpoint", currentEndpoint),
        ]);
        if (legacy.error || otherOrigins.error) {
          console.warn(
            "old admin push subscription cleanup failed",
            legacy.error || otherOrigins.error,
          );
        }
      }
    }
    return { ok: true };
  },

  /** Load meal-plan row for a client (or self). Missing row = default mode.
   *  Mamas never receive draft/draft_meta over the wire (coach unpublished work). */
  async loadClientMealPlan(profileId) {
    if (!profileId) return { mode: "default", draft: null, published: null };
    const uid = await requireUserId();
    let isAdmin = false;
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      isAdmin = String(me?.role || "").toLowerCase() === "admin";
    } catch {
      isAdmin = false;
    }
    const select = isAdmin
      ? "profile_id, mode, draft, draft_meta, published, published_at, published_by, updated_at"
      : "profile_id, mode, published, published_at, published_by, updated_at";
    const { data, error } = await supabase
      .from("client_meal_plans")
      .select(select)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) {
      // Table may not exist until migration 011
      console.warn("loadClientMealPlan failed", error);
      return { mode: "default", draft: null, published: null };
    }
    if (!data) return { mode: "default", draft: null, published: null, published_at: null };
    const published = data.published || null;
    const hasWeek = Array.isArray(published?.days) && published.days.length > 0;
    return {
      mode: data.mode === "personalized" && hasWeek ? "personalized" : "default",
      draft: data.draft || null,
      draft_meta: data.draft_meta || null,
      published: hasWeek ? published : null,
      published_at: data.published_at || null,
      published_by: data.published_by || null,
      updated_at: data.updated_at || null,
      rawMode: data.mode,
    };
  },

  /** Admin: save AI draft (does not change what the client sees). */
  async saveMealPlanDraft(clientId, plan) {
    if (!clientId || !plan) throw new Error("missing plan");
    const existing = await this.loadClientMealPlan(clientId);
    const draft_meta = {
      ...(plan.meta || {}),
      savedAt: new Date().toISOString(),
    };
    const { error } = await supabase.from("client_meal_plans").upsert(
      {
        profile_id: clientId,
        mode: existing.rawMode || "default",
        draft: plan,
        draft_meta,
        published: existing.published,
        published_at: existing.published_at,
        published_by: existing.published_by,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
    if (error) throw error;
  },

  /**
   * Admin: publish a plan to the client (usually the current draft).
   * Copies plan → published and sets mode=personalized.
   */
  async publishMealPlan(clientId, adminId, planOverride = null) {
    if (!clientId) throw new Error("missing client");
    const existing = await this.loadClientMealPlan(clientId);
    const plan = planOverride || existing.draft;
    if (!plan?.days?.length) throw new Error("Generate a draft before publishing");
    const payload = {
      profile_id: clientId,
      mode: "personalized",
      draft: plan,
      draft_meta: existing.draft_meta || plan.meta || null,
      published: plan,
      published_at: new Date().toISOString(),
      published_by: adminId || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("client_meal_plans").upsert(payload, { onConflict: "profile_id" });
    if (error) throw error;

    // Confirm the write — surfaces RLS / schema issues instead of a silent miss
    const verify = await this.loadClientMealPlan(clientId);
    if (verify.mode !== "personalized" || !verify.published?.days?.length) {
      throw new Error("Publish didn’t stick — check client_meal_plans table / RLS (migration 011)");
    }
  },

  /**
   * Admin: switch client back to the shared default recipe bank.
   * Keeps draft + last published for easy re-publish later.
   */
  async revertMealPlanToDefault(clientId) {
    if (!clientId) throw new Error("missing client");
    const { error } = await supabase
      .from("client_meal_plans")
      .update({
        mode: "default",
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", clientId);
    if (error) throw error;
  },

  /**
   * Saved My meals for one-tap re-logging. cal/p/c/f are always ONE
   * SERVING; `serves` only records how big the batch was.
   */
  async loadCustomMeals() {
    const uid = await requireUserId();
    // Prefer the recipe columns; degrade if migration 019 hasn't run yet.
    let { data, error } = await supabase
      .from("custom_meals")
      .select("id, name, cal, p, c, f, serves, ingredients, steps, slot, updated_at")
      .eq("profile_id", uid)
      .order("updated_at", { ascending: false });
    if (error && /steps/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("custom_meals")
        .select("id, name, cal, p, c, f, serves, ingredients, slot, updated_at")
        .eq("profile_id", uid)
        .order("updated_at", { ascending: false }));
    }
    if (error && /slot/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("custom_meals")
        .select("id, name, cal, p, c, f, serves, ingredients, updated_at")
        .eq("profile_id", uid)
        .order("updated_at", { ascending: false }));
    }
    if (error && /serves|ingredients/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("custom_meals")
        .select("id, name, cal, p, c, f, updated_at")
        .eq("profile_id", uid)
        .order("updated_at", { ascending: false }));
    }
    if (error) {
      console.warn("loadCustomMeals failed", error);
      return [];
    }
    return (data || []).map(mapCustomMeal);
  },

  /** Upsert by name for this user (re-saving the same lunch updates macros). */
  async saveCustomMeal({ name, cal, p, c, f, serves, ingredients, slot, steps }) {
    const uid = await requireUserId();
    const trimmed = String(name || "").trim().slice(0, 80);
    if (!trimmed) throw new Error("Meal needs a name");
    const base = {
      profile_id: uid,
      name: trimmed,
      cal: Number(cal) || 0,
      p: Number(p) || 0,
      c: Number(c) || 0,
      f: Number(f) || 0,
      updated_at: new Date().toISOString(),
    };
    const recipeFields = {};
    if (serves != null) recipeFields.serves = normalizeServes(serves);
    if (ingredients != null) recipeFields.ingredients = String(ingredients).slice(0, 4000) || null;
    if (steps != null) recipeFields.steps = String(steps).slice(0, 4000) || null;
    const savedSlot = normalizeMealSlot(slot);
    if (savedSlot) recipeFields.slot = savedSlot;

    const extraCols = [
      recipeFields.serves != null ? "serves" : "",
      recipeFields.ingredients !== undefined ? "ingredients" : "",
      recipeFields.steps !== undefined ? "steps" : "",
      recipeFields.slot ? "slot" : "",
    ].filter(Boolean).join(", ");
    let { data, error } = await supabase
      .from("custom_meals")
      .upsert({ ...base, ...recipeFields }, { onConflict: "profile_id,name" })
      .select(`id, name, cal, p, c, f, updated_at${extraCols ? `, ${extraCols}` : ""}`)
      .single();
    if (error && /steps/i.test(error.message || "")) {
      const { steps: _st, ...noSteps } = recipeFields;
      ({ data, error } = await supabase
        .from("custom_meals")
        .upsert({ ...base, ...noSteps }, { onConflict: "profile_id,name" })
        .select("id, name, cal, p, c, f, updated_at, serves, ingredients, slot")
        .single());
    }
    if (error && /slot/i.test(error.message || "")) {
      const { slot: _s, steps: _st2, ...noSlot } = recipeFields;
      ({ data, error } = await supabase
        .from("custom_meals")
        .upsert({ ...base, ...noSlot }, { onConflict: "profile_id,name" })
        .select("id, name, cal, p, c, f, updated_at, serves, ingredients")
        .single());
    }
    if (error && /serves|ingredients/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("custom_meals")
        .upsert(base, { onConflict: "profile_id,name" })
        .select("id, name, cal, p, c, f, updated_at")
        .single());
    }
    if (error) throw error;
    return mapCustomMeal(data);
  },

  async deleteCustomMeal(id) {
    const uid = await requireUserId();
    if (!id) return;
    const { error } = await supabase
      .from("custom_meals")
      .delete()
      .eq("profile_id", uid)
      .eq("id", id);
    if (error) throw error;
  },

  /**
   * Meal coach thread. Append-only; `payload` is rendered display state, never
   * a source of macros. A missing table (migration not run) is not an error —
   * the coach still works, it just forgets between visits.
   */
  /**
   * Today's thread only.
   *
   * The coach is a decision tool, not a correspondence. Yesterday's "what
   * should I eat" is noise this morning, and the meal cards inside it were
   * sized against yesterday's budget — showing them again would offer her a
   * portion that no longer fits.
   */
  async loadCoachThread({ limit = 60, localDate = null } = {}) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("coach_messages")
      .select("id, role, body, kind, payload, local_date, created_at")
      .eq("profile_id", uid)
      .eq("local_date", localDate || localDateIso())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadCoachThread failed", error);
      return [];
    }
    return (data || [])
      .map((r) => ({
        id: r.id,
        role: r.role,
        body: r.body || "",
        kind: r.kind || "text",
        payload: r.payload || null,
        localDate: r.local_date || null,
        createdAt: r.created_at,
      }))
      .reverse();
  },

  async appendCoachMessage({ role, body = "", kind = "text", payload = null, localDate = null }) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("coach_messages")
      .insert({
        profile_id: uid,
        role: role === "coach" ? "coach" : "mama",
        body: String(body || "").slice(0, 4000),
        kind,
        payload,
        local_date: localDate || localDateIso(),
      })
      .select("id, role, body, kind, payload, local_date, created_at")
      .single();
    if (error) {
      console.warn("appendCoachMessage failed", error);
      return null;
    }
    return {
      id: data.id,
      role: data.role,
      body: data.body || "",
      kind: data.kind || "text",
      payload: data.payload || null,
      localDate: data.local_date || null,
      createdAt: data.created_at,
    };
  },

  async clearCoachThread() {
    const uid = await requireUserId();
    const { error } = await supabase.from("coach_messages").delete().eq("profile_id", uid);
    if (error) {
      console.warn("clearCoachThread failed", error);
      return false;
    }
    return true;
  },

  /**
   * Client week planner — one plan per Mon–Sun (week_start).
   * localStorage fallback until migrations 014 + 016 land.
   */
  async loadWeekPlan(weekStart = null) {
    const uid = await requireUserId();
    const ws = weekStart || wkStartOf();
    const lsKey = weekPlanLocalKey(uid, ws);
    try {
      const { data, error } = await supabase
        .from("client_week_plans")
        .select("days, source, updated_at, week_start")
        .eq("profile_id", uid)
        .eq("week_start", ws)
        .maybeSingle();
      if (error) {
        console.warn("loadWeekPlan failed (migration 014/016?)", error);
        return migrateLegacyWeekPlanLocal(uid, ws) || readWeekPlanLocal(lsKey, ws);
      }
      if (!data) {
        // First load after 016: try legacy unscoped local key once for current week
        const legacy = ws === wkStartOf() ? migrateLegacyWeekPlanLocal(uid, ws) : null;
        return legacy || { days: [], source: "manual", week_start: ws, updated_at: null };
      }
      const days = sanitizeWeekMeals(Array.isArray(data.days) ? data.days : []);
      return {
        days,
        source: data.source || "manual",
        week_start: data.week_start || ws,
        updated_at: data.updated_at || null,
      };
    } catch (e) {
      console.warn("loadWeekPlan exception", e);
      return migrateLegacyWeekPlanLocal(uid, ws) || readWeekPlanLocal(lsKey, ws);
    }
  },

  async saveWeekPlan(days, source = "manual", weekStart = null) {
    const uid = await requireUserId();
    const ws = weekStart || wkStartOf();
    const lsKey = weekPlanLocalKey(uid, ws);
    const payload = {
      // Heal poisoned AI shapes on every write so Supabase/local stay safe.
      days: sanitizeWeekMeals(Array.isArray(days) ? days : []),
      source: ["manual", "ai", "coach_seed"].includes(source) ? source : "manual",
      week_start: ws,
      updated_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(lsKey, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
    const { error } = await supabase.from("client_week_plans").upsert(
      {
        profile_id: uid,
        week_start: ws,
        days: payload.days,
        source: payload.source,
        updated_at: payload.updated_at,
      },
      { onConflict: "profile_id,week_start" },
    );
    if (error) {
      console.warn("saveWeekPlan supabase failed — kept local copy", error);
      return payload;
    }
    return payload;
  },
};

function weekPlanLocalKey(uid, weekStart) {
  return `mm_week_plan_${uid}_${weekStart}`;
}

/** Move pre-016 single local plan onto the current week once. */
function migrateLegacyWeekPlanLocal(uid, weekStart) {
  if (weekStart !== wkStartOf()) return null;
  const legacyKey = `mm_week_plan_${uid}`;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    if (!days.length) {
      localStorage.removeItem(legacyKey);
      return null;
    }
    const payload = {
      days: sanitizeWeekMeals(days),
      source: parsed?.source || "manual",
      week_start: weekStart,
      updated_at: parsed?.updated_at || null,
    };
    localStorage.setItem(weekPlanLocalKey(uid, weekStart), JSON.stringify(payload));
    localStorage.removeItem(legacyKey);
    return payload;
  } catch {
    return null;
  }
}

function readWeekPlanLocal(lsKey, weekStart) {
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return { days: [], source: "manual", week_start: weekStart, updated_at: null };
    const parsed = JSON.parse(raw);
    return {
      days: sanitizeWeekMeals(Array.isArray(parsed?.days) ? parsed.days : []),
      source: parsed?.source || "manual",
      week_start: parsed?.week_start || weekStart,
      updated_at: parsed?.updated_at || null,
    };
  } catch {
    return { days: [], source: "manual", week_start: weekStart, updated_at: null };
  }
}
