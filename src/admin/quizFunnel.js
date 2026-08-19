/**
 * Today's quiz → unpaid signup → paid pulse (Pacific calendar day).
 * Counts come from Supabase (admin RLS). Bounce volume lives in Sentry.
 */
import { supabase } from "../lib/supabase";

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
  };
}

async function countExact(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function loadQuizFunnelPulse({ now = new Date(), client = supabase } = {}) {
  const startIso = pacificTodayStartIso(now);
  const [quizLeads, unpaidSignups, paid] = await Promise.all([
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
  ]);
  return { startIso, quizLeads, unpaidSignups, paid };
}
