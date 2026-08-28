/**
 * Today's quiz → unpaid signup → paid pulse (Pacific calendar day)
 * plus the all-time unpaid-ranges funnel (true leads).
 * Counts come from Supabase (admin RLS). Bounce volume lives in Sentry.
 */
import { supabase } from "../lib/supabase";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isPaidClient(profile) {
  if (!profile || profile.role === "admin") return false;
  return Boolean(profile.paid || profile.comp);
}

export const PACIFIC_TZ = "America/Los_Angeles";

export function pacificTodayStartIso(now = new Date(), timeZone = PACIFIC_TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asIfUtc - now.getTime();
  const startAsIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    0, 0, 0, 0,
  );
  return new Date(startAsIfUtc - offsetMs).toISOString();
}

function isOnOrAfter(iso, startIso) {
  return Boolean(iso && startIso && String(iso) >= startIso);
}

export function countQuizLeads(leads, startIso) {
  return (leads || []).filter((row) => isOnOrAfter(row?.created_at, startIso)).length;
}

/** Accounts created today, still unpaid, not admin. */
export function countUnpaidSignups(profiles, startIso) {
  return (profiles || []).filter((row) => {
    if (!row || row.role === "admin") return false;
    if (row.paid !== false && row.paid !== 0) return false;
    return isOnOrAfter(row.created_at, startIso);
  }).length;
}

/** Paid today (paid_at), not admin. */
export function countPaidToday(profiles, startIso) {
  return (profiles || []).filter((row) => {
    if (!row || row.role === "admin") return false;
    if (!row.paid) return false;
    return isOnOrAfter(row.paid_at, startIso);
  }).length;
}

export function summarizeQuizFunnel({ leads = [], profiles = [], startIso } = {}) {
  return {
    startIso,
    quizLeads: countQuizLeads(leads, startIso),
    unpaidSignups: countUnpaidSignups(profiles, startIso),
    paid: countPaidToday(profiles, startIso),
    ...summarizeOpenFunnel({ leads, profiles }),
  };
}

/**
 * Unique quiz emails that got ranges. Unpaid = submitted ranges, never paid
 * (or complimentary). That is the true lead list for a last-nudge email.
 */
export function summarizeOpenFunnel({ leads = [], profiles = [] } = {}) {
  const paidEmails = new Set(
    (profiles || [])
      .filter(isPaidClient)
      .map((row) => normalizeEmail(row.email))
      .filter(Boolean),
  );
  const seen = new Set();
  let rangesSubmitted = 0;
  let unpaidLeads = 0;
  let paidFromQuiz = 0;
  for (const lead of leads || []) {
    const email = normalizeEmail(lead?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    rangesSubmitted += 1;
    if (paidEmails.has(email)) paidFromQuiz += 1;
    else unpaidLeads += 1;
  }
  return { rangesSubmitted, unpaidLeads, paidFromQuiz };
}

async function countExact(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function fetchRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadQuizFunnelPulse({ now = new Date(), client = supabase } = {}) {
  const startIso = pacificTodayStartIso(now);
  const [quizLeads, unpaidSignups, paid, leadRows, profileRows] = await Promise.all([
    countExact(
      client
        .from("marketing_leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startIso),
    ),
    countExact(
      client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("paid", false)
        .neq("role", "admin")
        .gte("created_at", startIso),
    ),
    countExact(
      client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("paid", true)
        .neq("role", "admin")
        .gte("paid_at", startIso),
    ),
    fetchRows(client.from("marketing_leads").select("email")),
    fetchRows(client.from("profiles").select("email,paid,comp,role").neq("role", "admin")),
  ]);
  return {
    startIso,
    quizLeads,
    unpaidSignups,
    paid,
    ...summarizeOpenFunnel({ leads: leadRows, profiles: profileRows }),
  };
}
