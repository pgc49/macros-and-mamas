/**
 * One email to Callie when a crisis line is appended.
 * Same recipient as the other admin/ops alerts. At most one per mama per hour.
 */

import { adminPortalUrl } from "./adminOrigin.js";
import { FROM_CALLIE } from "./emailLayout.mjs";
import { logAiFailure } from "./openrouter.js";
import { resendIdempotencyKey, sendResendEmail } from "./resendSend.mjs";
import { coachSummaryDateIso } from "./coachRefusalSummary.js";
import { wallClockParts, COACH_CLOCK_TZ } from "../../src/utils/mealSlots.js";

export const COACH_CRISIS_EMAIL = false;
export const DEFAULT_CALLIE_NOTIFY_EMAIL = "calista@nourishwithcalista.com";

export function callieOpsEmail(env) {
  return String(env?.CALLIE_NOTIFY_EMAIL || DEFAULT_CALLIE_NOTIFY_EMAIL).trim();
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "a mama";
}

export function crisisEmailHourKey(profileId, now = new Date()) {
  const parts = wallClockParts(now, COACH_CLOCK_TZ);
  const hour = String(parts.hour).padStart(2, "0");
  return `crisis-email/${profileId}/${coachSummaryDateIso(now)}T${hour}`;
}

export function formatCrisisPacificTime(now = new Date()) {
  const parts = wallClockParts(now, COACH_CLOCK_TZ);
  const hour12 = ((parts.hour + 11) % 12) + 1;
  const ampm = parts.hour >= 12 ? "pm" : "am";
  const minute = String(parts.minute).padStart(2, "0");
  return `${coachSummaryDateIso(now)} ${hour12}:${minute} ${ampm} PT`;
}

export function buildCrisisAlert({ first, asked, now = new Date(), adminUrl }) {
  const name = firstName(first);
  return {
    subject: `Coach: urgent message from ${name}`,
    text: [
      `Mama: ${name}`,
      `Pacific time: ${formatCrisisPacificTime(now)}`,
      `Message: ${String(asked || "").replace(/\s+/g, " ").trim()}`,
      `Admin: ${adminUrl}`,
    ].join("\n"),
  };
}

export async function captureCoachWorkerFailure(env, { userId, kind, status, detail } = {}) {
  await logAiFailure(env, {
    userId,
    label: "coach",
    kind: kind || "crisis-email",
    status,
    detail: detail || "coach crisis email failed",
  });
}

async function alreadyEmailedThisHour(env, userId, ticket) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const inserted = await fetch(`${base}/rest/v1/estimate_calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      profile_id: userId,
      type: "coach_crisis_email",
      request_id: ticket,
    }),
  }).catch(() => null);
  if (!inserted || (inserted.status !== 409 && !inserted.ok)) return "failed";
  if (inserted.status === 409) return true;
  return false;
}

async function loadMamaFirstName(env, userId) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId) return "";
  const read = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=name,first_name`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  ).catch(() => null);
  if (!read?.ok) return "";
  const rows = await read.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return firstName(row?.name || row?.first_name);
}

export async function notifyCrisisEmail(env, {
  userId,
  asked,
  first = "",
  now = new Date(),
  send = sendResendEmail,
  enabled = COACH_CRISIS_EMAIL,
} = {}) {
  if (!enabled) return { ok: false, skipped: true };
  const to = callieOpsEmail(env);
  if (!to || !userId) return { ok: false, skipped: true };
  const ticket = crisisEmailHourKey(userId, now);
  const hourly = await alreadyEmailedThisHour(env, userId, ticket);
  if (hourly === true) return { ok: true, skipped: "hourly" };
  if (hourly === "failed") {
    await captureCoachWorkerFailure(env, {
      userId,
      kind: "crisis-email",
      detail: "crisis email dedupe insert failed",
    });
    return { ok: false, error: "dedupe" };
  }
  const name = first || await loadMamaFirstName(env, userId);
  const adminUrl = `${adminPortalUrl(env)}?client=${encodeURIComponent(userId)}`;
  const mail = buildCrisisAlert({ first: name, asked, now, adminUrl });
  const result = await send(env, {
    from: env.LEAD_FROM_EMAIL || FROM_CALLIE,
    to: [to],
    subject: mail.subject,
    text: mail.text,
  }, { idempotencyKey: resendIdempotencyKey("coach-crisis", ticket) });
  if (result?.error) {
    await captureCoachWorkerFailure(env, {
      userId,
      kind: "crisis-email",
      detail: result.error.message,
    });
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
