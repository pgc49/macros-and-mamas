/**
 * Referred-by display for admin + Callie/Patrick payment notify.
 * Never use the advocate email as the name.
 */

const ACTIVE_STATUSES = new Set(["paid", "pending_payment"]);

function advocateProfileName(profile) {
  if (!profile) return "";
  const first = String(profile.name || profile.first_name || "").trim();
  const last = String(profile.last_name || profile.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ");
}

function normalizedCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

/**
 * Pick the paid (else pending_payment) referral for a mama.
 * Returns { advocateName, code } or null. Name is from the advocate profile only.
 */
export function pickReferredBy({
  rows = [],
  profilesById = {},
  referredUserId = "",
} = {}) {
  const candidates = (rows || []).filter((row) => {
    if (!row || !ACTIVE_STATUSES.has(row.status)) return false;
    if (referredUserId && row.referred_user_id && row.referred_user_id !== referredUserId) {
      return false;
    }
    return true;
  });
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.status === "paid" && b.status !== "paid") return -1;
    if (b.status === "paid" && a.status !== "paid") return 1;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  const row = candidates[0];
  const advocate = row.advocate_user_id ? profilesById[row.advocate_user_id] : null;
  const advocateName = advocateProfileName(advocate);
  const code = normalizedCode(row.code);
  if (!advocateName && !code) return null;
  return {
    advocateName,
    code,
    advocateUserId: row.advocate_user_id || "",
  };
}

/** Map referred_user_id → { advocateName, code } for roster attach. */
export function referredByByUserId(rows = [], profilesById = {}) {
  const grouped = {};
  for (const row of rows || []) {
    const id = row?.referred_user_id;
    if (!id) continue;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(row);
  }
  const out = {};
  for (const [id, list] of Object.entries(grouped)) {
    const picked = pickReferredBy({ rows: list, profilesById, referredUserId: id });
    if (picked) out[id] = picked;
  }
  return out;
}

/** "Referred by Ava · AVA25" — or the code alone when the advocate has no profile name. */
export function formatReferredBy(referral) {
  if (!referral) return "";
  const name = String(referral.advocateName || "").trim();
  const code = normalizedCode(referral.code);
  if (!name && !code) return "";
  if (!name) return code;
  if (!code) return `Referred by ${name}`;
  return `Referred by ${name} · ${code}`;
}

/** Quiet roster hint: "via Ava Stone" (full name) or "via AVA25". */
export function formatReferredByHint(referral) {
  const line = formatReferredBy(referral);
  if (!line) return "";
  const name = String(referral?.advocateName || "").trim();
  const who = name || normalizedCode(referral?.code);
  return who ? `via ${who}` : "";
}

/** Button label to open the advocate's in-app thread. */
export function thankReferrerLabel(referral) {
  const name = String(referral?.advocateName || "").trim();
  return name ? `Message ${name}` : "Message her";
}
