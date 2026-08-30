/**
 * Admin Quiz leads list: marketing_leads + profile funnel status + referrals.
 * Join is in JS on lower(email).
 * Meta ad = campaign UTMs. Meta link = fbc without those UTMs. Never fbp alone.
 */
import { supabase } from "../lib/supabase";
import { joinPersonName } from "../lib/personName";
import { PACIFIC_TZ } from "./quizFunnel";

/** Leftover = quiz complete, no payment. Default Leads list. */
export const DEFAULT_QUIZ_LEAD_FILTER = "unpaid";

export const QUIZ_LEAD_FILTERS = [
  ["unpaid", "Unpaid"],
  ["no_account", "No account"],
  ["signed_up_unpaid", "Signed up unpaid"],
  ["paid", "Paid"],
  ["meta", "Ad"],
  ["referral", "Referral"],
  ["all", "All"],
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
  "goal",
  "activity_level",
  "height_in",
  "current_weight_lbs",
  "goal_weight_lbs",
  "baby_birthday",
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

const PROFILE_COLS = [
  "id",
  "email",
  "name",
  "paid",
  "paid_at",
  "role",
  "refunded",
  "created_at",
  "phone",
  "status",
  "cohort_label",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "landing_path",
].join(",");

const REFERRAL_COLS = "id, code, referred_email, referred_user_id, advocate_user_id, status, created_at";

const COHORT_WAITLIST_COLS = "id, email, phone, cohort, converted_at, paid_at, created_at, profile_id";

const ELIGIBILITY_WAITLIST_COLS = "id, email, reason, created_at, eligible_on, profile_id";

const MACROS_COLS = "profile_id, approved";

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

/** Live quiz Q7 option copy — Answers block, not the short admin tag. */
const QUIZ_FLAG_LABEL = {
  vegetarian: "Vegetarian / pescatarian",
  vegan: "Fully vegan",
  blood_sugar: "Blood sugar concerns",
  thyroid: "Thyroid",
  c_section: "Recent C-section",
  none: "None of these",
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

const GOAL_LABEL = {
  lose_sustainable: "Lose fat — keep muscle and milk",
  lose_efficient: "Lose fat — keep muscle and milk",
  maintain: "Maintain where I am",
  gain: "Gain / rebuild",
};

const ACTIVITY_LABEL = {
  minimal: "Minimal / survival",
  light: "Light walks",
  moderate: "Moderate movement",
  high: "Training consistently",
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

function indexNewestByEmail(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = normalizeLeadEmail(row?.email);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const out = new Map();
  for (const [key, list] of grouped) {
    out.set(key, pickNewest(list));
  }
  return out;
}

function indexNewestByProfileId(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const id = row?.profile_id;
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  const out = new Map();
  for (const [key, list] of grouped) {
    out.set(key, pickNewest(list));
  }
  return out;
}

function pickNewest(list) {
  return [...(list || [])].sort((a, b) => (
    String(b?.created_at || "").localeCompare(String(a?.created_at || ""))
  ))[0] || null;
}

function pickRelatedRow(byEmail, byProfileId, email, profileId) {
  const fromEmail = byEmail.get(normalizeLeadEmail(email)) || null;
  const fromId = profileId ? byProfileId.get(profileId) || null : null;
  if (fromEmail && fromId && fromEmail !== fromId) {
    return pickNewest([fromEmail, fromId]);
  }
  return fromEmail || fromId;
}

function indexMacrosByProfileId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.profile_id) map.set(row.profile_id, row);
  }
  return map;
}

export function enrichQuizLeads(leads, profiles, referrals = [], extras = {}) {
  const byEmail = indexProfilesByEmail(profiles);
  const referralByEmail = indexReferralsByEmail(referrals, profiles);
  const cohortByEmail = indexNewestByEmail(extras.cohortWaitlist);
  const cohortByProfileId = indexNewestByProfileId(extras.cohortWaitlist);
  const eligibilityByEmail = indexNewestByEmail(extras.eligibilityWaitlist);
  const eligibilityByProfileId = indexNewestByProfileId(extras.eligibilityWaitlist);
  const macrosByProfileId = indexMacrosByProfileId(extras.macros);
  return (leads || []).map((lead) => {
    const profile = byEmail.get(normalizeLeadEmail(lead?.email)) || null;
    const referral = referralByEmail.get(normalizeLeadEmail(lead?.email)) || null;
    const profileId = profile?.id || null;
    const cohort = pickRelatedRow(cohortByEmail, cohortByProfileId, lead?.email, profileId);
    const eligibility = pickRelatedRow(eligibilityByEmail, eligibilityByProfileId, lead?.email, profileId);
    const macros = profileId ? macrosByProfileId.get(profileId) || null : null;
    const profileCohort = String(profile?.cohort_label || "").trim();
    const waitlistCohort = String(cohort?.cohort || "").trim();
    const row = {
      ...lead,
      referralCode: referral?.code || null,
      referralAdvocateFirstName: referral?.advocateFirstName || null,
      cohort_label: profileCohort || waitlistCohort || "",
      profileId,
      profileCreatedAt: profile?.created_at || null,
      profilePaidAt: profile?.paid_at || null,
      profileRefunded: Boolean(profile?.refunded),
      profileRole: profile?.role || null,
      profilePhone: String(profile?.phone || "").trim() || null,
      profileStatus: profile?.status || null,
      profileAttribution: profile
        ? {
          utm_source: profile.utm_source || null,
          utm_medium: profile.utm_medium || null,
          utm_campaign: profile.utm_campaign || null,
          utm_content: profile.utm_content || null,
          landing_path: profile.landing_path || null,
        }
        : null,
      phone: String(profile?.phone || "").trim() || String(cohort?.phone || "").trim() || null,
      cohortWaitlist: cohort,
      eligibilityWaitlist: eligibility,
      macrosExists: Boolean(macros),
      macrosApproved: Boolean(macros?.approved),
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

export function isLeftoverLead(row) {
  return row?.funnelStatus === "quiz_only" || row?.funnelStatus === "signed_up_unpaid";
}

export function leftoverLeadCount(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isLeftoverLead).length;
}

export function filterQuizLeads(rows, filter = DEFAULT_QUIZ_LEAD_FILTER) {
  const list = Array.isArray(rows) ? rows : [];
  if (!filter || filter === "all") return list;
  if (filter === "meta") return list.filter((row) => row.isMeta);
  if (filter === "referral") return list.filter((row) => row.isReferral);
  if (filter === "unpaid" || filter === "leftover") {
    return list.filter(isLeftoverLead);
  }
  if (filter === "no_account") return list.filter((row) => row.funnelStatus === "quiz_only");
  if (filter === "signed_up_unpaid") return list.filter((row) => row.funnelStatus === "signed_up_unpaid");
  if (filter === "paid") return list.filter((row) => row.funnelStatus === "paid");
  return list;
}

export function leadDisplayName(lead) {
  const named = joinPersonName(lead?.first_name, lead?.last_name);
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
  const months = String(lead?.months_postpartum || "").trim();
  if (months === "still_pregnant" && !tags.includes("Pregnant")) {
    tags.push("Pregnant");
  }
  if (months === "not_postpartum") {
    const label = MONTHS_PP_LABEL.not_postpartum;
    if (label && !tags.includes(label)) tags.push(label);
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

/** Quiz UTMs are last overwrite on the lead. Profile UTMs are first-touch. */
export function formatCampaignCompare(lead) {
  const quiz = formatLeadCampaign(lead);
  const signup = formatLeadCampaign(lead?.profileAttribution);
  if (quiz && signup && quiz !== signup) return `quiz ${quiz} · signup ${signup}`;
  return quiz || signup;
}

export function formatLeadPhone(lead) {
  return String(lead?.phone || lead?.profilePhone || lead?.cohortWaitlist?.phone || "").trim();
}

export function formatCohortWaitlistLine(row) {
  if (!row) return "";
  const bits = [formatLeadWhen(row.created_at) || "Joined"];
  if (row.converted_at) bits.push("converted");
  if (row.paid_at) bits.push("paid");
  return bits.join(" · ");
}

export function formatEligibilityWaitlistLine(row) {
  if (!row) return "";
  const reason = row.reason === "early_nursing"
    ? "Early nursing"
    : row.reason === "pregnant"
      ? "Pregnant"
      : humanizeCode(row.reason);
  return [reason, formatLeadWhen(row.created_at)].filter(Boolean).join(" · ");
}

export function formatIntakeLine(lead) {
  if (lead?.macrosApproved || String(lead?.profileStatus || "").toLowerCase() === "active") {
    return "Approved";
  }
  if (lead?.macrosExists) return "Submitted";
  return "";
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

export function formatQuizGoal(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return GOAL_LABEL[raw] || humanizeCode(raw);
}

export function formatQuizActivity(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return ACTIVITY_LABEL[raw] || humanizeCode(raw);
}

export function formatQuizHeight(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "";
  const ft = Math.floor(inches / 12);
  const rem = Math.round(inches % 12);
  if (ft > 0) return `${ft} ft ${rem} in`;
  return `${rem} in`;
}

export function formatQuizFlags(lead) {
  const flags = Array.isArray(lead?.flags) ? lead.flags : [];
  const labels = [];
  for (const flag of flags) {
    const raw = String(flag || "").trim();
    if (!raw) continue;
    const label = QUIZ_FLAG_LABEL[raw] || FLAG_LABEL[raw] || humanizeCode(raw);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.join(" · ");
}

export function formatBabyBirthday(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoDay = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const at = Date.parse(isoDay ? `${isoDay[1]}T12:00:00` : raw);
  if (!Number.isFinite(at)) return raw;
  try {
    return new Date(at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

export function formatQuizWeight(value) {
  const lbs = Number(value);
  if (!Number.isFinite(lbs) || lbs <= 0) return "";
  return `${Math.round(lbs)} lb`;
}

export function formatQuizReviewLine(lead) {
  if (!lead?.needs_review) return "";
  return formatReviewReason(lead) || "Needs review";
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
 * created_at is first quiz insert — never "last quiz" or a visit count.
 */
export function leadInsightRows(lead) {
  const rows = [];
  const push = (label, value) => {
    const text = String(value || "").trim();
    if (!text) return;
    rows.push({ label, value: text });
  };

  push("First quiz", formatLeadWhen(lead?.created_at));
  push("Phone", formatLeadPhone(lead));
  push("Landing", String(lead?.landing_path || "").trim());
  push("Campaign", formatCampaignCompare(lead));
  push("Source", quizLeadSourceLabel(lead));

  const who = quizReferralWho(lead);
  const source = quizLeadSourceLabel(lead);
  if (who && !source.includes(who)) push("Referred by", who);

  if (hasAccount(lead)) {
    push("Account created", formatLeadWhen(lead?.profileCreatedAt));
    if (lead?.funnelStatus === "paid") {
      push("Paid", formatLeadWhen(lead?.profilePaidAt) || "Paid");
    } else if (lead?.funnelStatus === "signed_up_unpaid") {
      push("Paid", "Signed up, unpaid");
    }
  }

  push("Intake", formatIntakeLine(lead));
  push("Waitlist", formatCohortWaitlistLine(lead?.cohortWaitlist));
  push("Eligibility", formatEligibilityWaitlistLine(lead?.eligibilityWaitlist));

  return rows;
}

function pushInsightRow(rows, label, value) {
  const text = String(value || "").trim();
  if (!text) return;
  rows.push({ label, value: text });
}

/**
 * Quiz inputs Callie can scan — live quiz question + option wording.
 * Hide unanswered. Do not invent numbers.
 */
export function leadQuizAnswerRows(lead) {
  const rows = [];
  pushInsightRow(rows, "Where are you right now?", formatMonthsPostpartum(lead?.months_postpartum));
  pushInsightRow(rows, "Are you feeding your baby breast milk right now?", formatFeedingStatus(lead?.feeding_status));
  pushInsightRow(rows, "Height", formatQuizHeight(lead?.height_in));
  pushInsightRow(rows, "Current weight (lb)", formatQuizWeight(lead?.current_weight_lbs));
  pushInsightRow(rows, "What weight do you feel like yourself at?", formatQuizWeight(lead?.goal_weight_lbs));
  pushInsightRow(rows, "What are you actually after?", formatQuizGoal(lead?.goal));
  pushInsightRow(rows, "How much are you moving right now?", formatQuizActivity(lead?.activity_level));
  pushInsightRow(rows, "Anything we should know?", formatQuizFlags(lead));
  pushInsightRow(rows, "Baby's birthday", formatBabyBirthday(lead?.baby_birthday));
  return rows;
}

/**
 * Computed ranges (what we told her). Segment/tags if useful.
 * Answers live in leadQuizAnswerRows — do not bury inputs here.
 */
export function leadQuizResultRows(lead) {
  const rows = [];
  pushInsightRow(rows, "Ranges", formatMacroRanges(lead));
  pushInsightRow(rows, "Tags", formatLeadTags(lead));
  pushInsightRow(rows, "Review", formatQuizReviewLine(lead));
  return rows;
}

async function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadQuizLeads({ client = supabase } = {}) {
  const [leads, profiles, referrals, cohortWaitlist, eligibilityWaitlist, macros] = await Promise.all([
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
    throwIfError(
      await client
        .from("cohort_waitlist")
        .select(COHORT_WAITLIST_COLS),
    ),
    throwIfError(
      await client
        .from("waitlist")
        .select(ELIGIBILITY_WAITLIST_COLS),
    ),
    throwIfError(
      await client
        .from("macros")
        .select(MACROS_COLS),
    ),
  ]);
  return enrichQuizLeads(leads, profiles, referrals, {
    cohortWaitlist,
    eligibilityWaitlist,
    macros,
  });
}
