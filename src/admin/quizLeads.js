/**
 * Admin Quiz leads list: marketing_leads + profile funnel status.
 * Join is in JS on lower(email). Meta click lives in fbc / fbp / utm — not fbclid.
 */
import { supabase } from "../lib/supabase";
import { PACIFIC_TZ } from "./quizFunnel";

export const QUIZ_LEAD_FILTERS = [
  ["all", "All"],
  ["meta", "Meta"],
  ["no_account", "No account"],
  ["signed_up_unpaid", "Signed up unpaid"],
  ["paid", "Paid"],
];

const META_UTM = new Set(["facebook", "ig", "instagram", "fb", "meta"]);

const LEAD_COLS = [
  "id",
  "created_at",
  "email",
  "first_name",
  "last_name",
  "source",
  "months_postpartum",
  "feeding_status",
  "flags",
  "segment",
  "needs_review",
  "protein_low_g",
  "protein_high_g",
  "carbs_low_g",
  "carbs_high_g",
  "fat_low_g",
  "fat_high_g",
  "calories_low",
  "calories_high",
  "fbp",
  "fbc",
  "event_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "landing_path",
  "referred_by",
].join(",");

const PROFILE_COLS = "id, email, paid, paid_at, role, refunded";

const SEGMENT_LABEL = {
  early_pp_nurture: "Early PP",
  pregnancy_nurture: "Pregnant",
  waitlist_plantbased: "Plant-based",
};

const FLAG_LABEL = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  blood_sugar: "Blood sugar",
  thyroid: "Thyroid",
  c_section: "C-section",
};

function nonempty(value) {
  return Boolean(String(value || "").trim());
}

export function normalizeLeadEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Meta Lead match signals stored on marketing_leads. Does not invent fbclid. */
export function isMetaLead(lead) {
  if (nonempty(lead?.fbc) || nonempty(lead?.fbp)) return true;
  const utm = String(lead?.utm_source || "").trim().toLowerCase();
  return META_UTM.has(utm);
}

/** Traffic source for Callie: Meta ads vs referral vs organic. Meta wins. */
export function quizLeadSourceKind(lead) {
  if (isMetaLead(lead)) return "meta";
  if (nonempty(lead?.referred_by)) return "referral";
  return "organic";
}

export function quizLeadSourceLabel(lead) {
  const kind = quizLeadSourceKind(lead);
  if (kind === "meta") return "Meta";
  if (kind === "referral") {
    const who = String(lead?.referred_by || "").trim();
    return who ? `Referral · ${who}` : "Referral";
  }
  return "Organic";
}

export function quizLeadFunnelStatus(profile) {
  if (!profile) return "quiz_only";
  if (profile.paid || profile.paidAt || profile.paid_at) return "paid";
  return "signed_up_unpaid";
}

export function quizLeadFunnelLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "signed_up_unpaid") return "Signed up unpaid";
  return "Quiz only";
}

export function indexProfilesByEmail(profiles) {
  const map = new Map();
  for (const row of profiles || []) {
    const key = normalizeLeadEmail(row?.email);
    if (!key) continue;
    if (String(row?.role || "").toLowerCase() === "admin") continue;
    map.set(key, row);
  }
  return map;
}

export function enrichQuizLeads(leads, profiles) {
  const byEmail = indexProfilesByEmail(profiles);
  return (leads || []).map((lead) => {
    const profile = byEmail.get(normalizeLeadEmail(lead?.email)) || null;
    const funnelStatus = quizLeadFunnelStatus(profile);
    return {
      ...lead,
      profileId: profile?.id || null,
      funnelStatus,
      sourceKind: quizLeadSourceKind(lead),
      isMeta: isMetaLead(lead),
    };
  });
}

export function filterQuizLeads(rows, filter = "all") {
  const list = Array.isArray(rows) ? rows : [];
  if (!filter || filter === "all") return list;
  if (filter === "meta") return list.filter((row) => row.isMeta);
  if (filter === "no_account") return list.filter((row) => row.funnelStatus === "quiz_only");
  if (filter === "signed_up_unpaid") return list.filter((row) => row.funnelStatus === "signed_up_unpaid");
  if (filter === "paid") return list.filter((row) => row.funnelStatus === "paid");
  return list;
}

export function leadDisplayName(lead) {
  const named = [lead?.first_name, lead?.last_name].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
  if (named) return named;
  const email = String(lead?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email || "Quiz lead";
}

export function formatLeadWhen(iso, timeZone = PACIFIC_TZ) {
  if (!iso) return "";
  try {
    return `${new Date(iso).toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })} PT`;
  } catch {
    return iso;
  }
}

export function formatMacroRanges(lead) {
  const bits = [];
  const band = (low, high, suffix) => {
    if (low == null && high == null) return;
    if (low != null && high != null && low !== high) bits.push(`${low}–${high}${suffix}`);
    else bits.push(`${low ?? high}${suffix}`);
  };
  band(lead?.protein_low_g, lead?.protein_high_g, "P");
  band(lead?.carbs_low_g, lead?.carbs_high_g, "C");
  band(lead?.fat_low_g, lead?.fat_high_g, "F");
  band(lead?.calories_low, lead?.calories_high, " cal");
  return bits.join(" · ");
}

export function formatLeadTags(lead) {
  const tags = [];
  const segment = SEGMENT_LABEL[lead?.segment];
  if (segment) tags.push(segment);
  if (String(lead?.months_postpartum || "") === "still_pregnant" && !tags.includes("Pregnant")) {
    tags.push("Pregnant");
  }
  for (const flag of Array.isArray(lead?.flags) ? lead.flags : []) {
    const label = FLAG_LABEL[flag];
    if (label && !tags.includes(label)) tags.push(label);
  }
  if (lead?.needs_review) tags.push("Needs review");
  return tags.join(" · ");
}

async function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadQuizLeads({ client = supabase } = {}) {
  const [leads, profiles] = await Promise.all([
    throwIfError(
      await client
        .from("marketing_leads")
        .select(LEAD_COLS)
        .order("created_at", { ascending: false }),
    ),
    throwIfError(
      await client
        .from("profiles")
        .select(PROFILE_COLS),
    ),
  ]);
  return enrichQuizLeads(leads, profiles);
}
