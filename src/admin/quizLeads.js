/**
 * Admin Quiz leads list: marketing_leads + profile funnel status + referrals.
 * Join is in JS on lower(email).
 * Meta ad = campaign UTMs. Meta link = fbc without those UTMs. Never fbp alone.
 */
import { supabase } from "../lib/supabase";
import { PACIFIC_TZ } from "./quizFunnel";

export const QUIZ_LEAD_FILTERS = [
  ["all", "All"],
  ["meta", "Ad"],
  ["referral", "Referral"],
  ["no_account", "No account"],
  ["signed_up_unpaid", "Signed up unpaid"],
  ["paid", "Paid"],
];

const META_UTM = new Set(["facebook", "ig", "instagram", "fb", "meta"]);
const PAID_MEDIUM = new Set(["cpc", "paid", "paidsocial"]);

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
  "review_reason",
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

const PROFILE_COLS = "id, email, name, paid, paid_at, role, refunded, created_at";

const REFERRAL_COLS = "id, code, referred_email, referred_user_id, advocate_user_id, status, created_at";

const REFERRAL_STATUS_RANK = { paid: 0, pending_payment: 1, refunded: 2 };

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

const MONTHS_PP_LABEL = {
  still_pregnant: "Still pregnant",
  "0_3_months": "0–3 months",
  "3_12_months": "3–12 months",
  "1_2_years": "1–2 years",
  "2_plus_years": "2+ years",
  not_postpartum: "Not postpartum",
};

const FEEDING_LABEL = {
  exclusive: "Exclusive breast milk",
  combination: "Combination feeding",
  weaning: "Weaning",
  not_feeding: "Not feeding breast milk",
};

const REVIEW_REASON_LABEL = {
  incomplete_inputs: "Incomplete inputs",
  goal_maintain: "Goal: maintain",
  goal_gain: "Goal: gain",
  thyroid: "Thyroid",
  goal_bmi_under_19: "Goal BMI under 19",
  goal_over_25pct_below_current: "Goal over 25% below current",
  carbs_under_100: "Carbs under 100",
};

function nonempty(value) {
  return Boolean(String(value || "").trim());
}

export function normalizeLeadEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function metaUtmSource(lead) {
  return String(lead?.utm_source || "").trim().toLowerCase();
}

function metaUtmMedium(lead) {
  return String(lead?.utm_medium || "").trim().toLowerCase();
}

/** Ads Manager campaign: Meta utm_source + paid medium. Pixel id (fbp) is not an ad. */
export function isMetaAdLead(lead) {
  return META_UTM.has(metaUtmSource(lead)) && PAID_MEDIUM.has(metaUtmMedium(lead));
}

/** Clicked a Facebook/Instagram link (fbc) but UTMs do not say this ad campaign. */
export function isMetaClickLead(lead) {
  return nonempty(lead?.fbc) && !isMetaAdLead(lead);
}

/** Meta tab filter = Ads Manager campaign, not every fbc click. */
export function isMetaLead(lead) {
  return isMetaAdLead(lead);
}

function advocateFirstName(profile) {
  const raw = String(profile?.name || profile?.first_name || "").trim();
  if (!raw) return "";
  return raw.split(/\s+/)[0];
}

/** Advocate first name, else promo code, else quiz free-text referred_by. */
export function quizReferralWho(lead) {
  const first = String(lead?.referralAdvocateFirstName || "").trim();
  if (first) return first;
  const code = String(lead?.referralCode || "").trim();
  if (code) return code;
  return String(lead?.referred_by || "").trim();
}

export function isReferralLead(lead) {
  return nonempty(quizReferralWho(lead));
}

/** Traffic source: Meta ad / Meta link / referral can stack. Organic only if none. */
export function quizLeadSourceKind(lead) {
  const ad = isMetaAdLead(lead);
  const click = isMetaClickLead(lead);
  const referral = isReferralLead(lead);
  if (ad && referral) return "meta_ad_referral";
  if (click && referral) return "meta_click_referral";
  if (ad) return "meta_ad";
  if (click) return "meta_click";
  if (referral) return "referral";
  return "organic";
}

export function quizLeadSourceLabel(lead) {
  const ad = isMetaAdLead(lead);
  const click = isMetaClickLead(lead);
  const who = quizReferralWho(lead);
  if (ad && who) return `Meta ad · ${who}`;
  if (click && who) return `Meta link · ${who}`;
  if (ad) return "Meta ad";
  if (click) return "Meta link";
  if (who) return `Referral · ${who}`;
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

export function indexReferralsByEmail(referrals, profiles) {
  const profilesById = new Map();
  for (const row of profiles || []) {
    if (row?.id) profilesById.set(row.id, row);
  }

  const grouped = new Map();
  for (const row of referrals || []) {
    const key = normalizeLeadEmail(row?.referred_email)
      || normalizeLeadEmail(profilesById.get(row?.referred_user_id)?.email);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const out = new Map();
  for (const [key, list] of grouped) {
    const picked = [...list].sort((a, b) => {
      const ra = REFERRAL_STATUS_RANK[a.status] ?? 9;
      const rb = REFERRAL_STATUS_RANK[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })[0];
    const code = String(picked?.code || "").trim().toUpperCase();
    const advocate = picked?.advocate_user_id ? profilesById.get(picked.advocate_user_id) : null;
    out.set(key, {
      code: code || "",
      advocateFirstName: advocateFirstName(advocate),
    });
  }
  return out;
}

export function enrichQuizLeads(leads, profiles, referrals = []) {
  const byEmail = indexProfilesByEmail(profiles);
  const referralByEmail = indexReferralsByEmail(referrals, profiles);
  return (leads || []).map((lead) => {
    const profile = byEmail.get(normalizeLeadEmail(lead?.email)) || null;
    const referral = referralByEmail.get(normalizeLeadEmail(lead?.email)) || null;
    const row = {
      ...lead,
      referralCode: referral?.code || null,
      referralAdvocateFirstName: referral?.advocateFirstName || null,
      profileId: profile?.id || null,
      profileCreatedAt: profile?.created_at || null,
      profilePaidAt: profile?.paid_at || null,
      profileRefunded: Boolean(profile?.refunded),
      profileRole: profile?.role || null,
      funnelStatus: quizLeadFunnelStatus(profile),
    };
    return {
      ...row,
      sourceKind: quizLeadSourceKind(row),
      isMeta: isMetaAdLead(row),
      isMetaAd: isMetaAdLead(row),
      isMetaClick: isMetaClickLead(row),
      isReferral: isReferralLead(row),
    };
  });
}

export function filterQuizLeads(rows, filter = "all") {
  const list = Array.isArray(rows) ? rows : [];
  if (!filter || filter === "all") return list;
  if (filter === "meta") return list.filter((row) => row.isMeta);
  if (filter === "referral") return list.filter((row) => row.isReferral);
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

function humanizeCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/_/g, " ");
}

export function formatLeadCampaign(lead) {
  return [lead?.utm_source, lead?.utm_medium, lead?.utm_campaign, lead?.utm_content]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" / ");
}

export function formatMonthsPostpartum(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return MONTHS_PP_LABEL[raw] || humanizeCode(raw);
}

export function formatFeedingStatus(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return FEEDING_LABEL[raw] || humanizeCode(raw);
}

export function formatReviewReason(lead) {
  if (!lead?.needs_review) return "";
  const raw = String(lead?.review_reason || "").trim();
  if (!raw) return "";
  return REVIEW_REASON_LABEL[raw] || humanizeCode(raw);
}

function hasAccount(lead) {
  return Boolean(
    lead?.profileId
    || lead?.profileCreatedAt
    || lead?.funnelStatus === "signed_up_unpaid"
    || lead?.funnelStatus === "paid",
  );
}

/**
 * Read-only rows for lead detail. Only persisted fields; empty bits omitted.
 * No visit counts — we do not store per-person pageviews.
 */
export function leadInsightRows(lead) {
  const rows = [];
  const push = (label, value) => {
    const text = String(value || "").trim();
    if (!text) return;
    rows.push({ label, value: text });
  };

  push("Quiz completed", formatLeadWhen(lead?.created_at));
  push("Landing", String(lead?.landing_path || "").trim());
  push("Campaign", formatLeadCampaign(lead));
  push("Source", quizLeadSourceLabel(lead));

  const who = quizReferralWho(lead);
  const source = quizLeadSourceLabel(lead);
  if (who && !source.includes(who)) push("Referred by", who);

  push("Tags", formatLeadTags(lead));
  push("Ranges", formatMacroRanges(lead));
  push("Postpartum", formatMonthsPostpartum(lead?.months_postpartum));
  push("Feeding", formatFeedingStatus(lead?.feeding_status));
  push("Review", formatReviewReason(lead));

  if (hasAccount(lead)) {
    push("Account created", formatLeadWhen(lead?.profileCreatedAt));
    if (lead?.funnelStatus === "paid") {
      push("Paid", formatLeadWhen(lead?.profilePaidAt) || "Paid");
    } else if (lead?.funnelStatus === "signed_up_unpaid") {
      push("Paid", "Signed up, unpaid");
    }
  }

  return rows;
}

async function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadQuizLeads({ client = supabase } = {}) {
  const [leads, profiles, referrals] = await Promise.all([
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
    throwIfError(
      await client
        .from("referrals")
        .select(REFERRAL_COLS),
    ),
  ]);
  return enrichQuizLeads(leads, profiles, referrals);
}
