/* ==================================================================
   Admin Credits board — pending / available / referrals (human labels)
   ================================================================== */

const REFERRAL_CREDIT_CENTS = 2500;
const PLACEHOLDER_NAMES = new Set(["new signup", "mama", "unnamed"]);
const PT = "America/Los_Angeles";

export function firstNameFromProfile(profile) {
  const named = String(profile?.name || "").trim();
  if (named && !PLACEHOLDER_NAMES.has(named.toLowerCase())) {
    return named.split(/\s+/)[0];
  }
  return "";
}

export function displayFirstName(profile, fallback = "Mama") {
  return firstNameFromProfile(profile) || fallback;
}

export function formatMoneyCents(cents) {
  const n = Number(cents) || 0;
  const abs = Math.abs(n);
  const dollars = abs / 100;
  const label = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return n < 0 ? `−${label}` : label;
}

/** Plain calendar date in Pacific Time — "Aug 21". */
export function formatLandsDate(iso, timeZone = PT) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function creditWhy(reason) {
  if (reason === "referral") return "Referral";
  if (reason === "manual") return "Manual";
  if (reason === "milestone") return "Milestone";
  if (reason === "redemption") return "Used";
  if (reason === "reversal") return "Taken back";
  return "Credit";
}

export function formatLedgerStatus(row) {
  if (row?.status === "pending") {
    const d = formatLandsDate(row.vests_at);
    return d ? `lands ${d}` : "waiting";
  }
  if (row?.status === "available") return "available";
  if (row?.status === "redeemed") return "used";
  if (row?.status === "reversed") return "taken back";
  return String(row?.status || "");
}

export function grantSuccessCopy(row) {
  const amount = formatMoneyCents(row?.amount_cents);
  const lands = formatLandsDate(row?.vests_at);
  if (lands) return `Granted ${amount}. It lands ${lands}.`;
  return `Granted ${amount}.`;
}

function referralFromName(row, profilesById, referralsById) {
  if (row.reason !== "referral" || !row.related_referral_id) return "";
  const referral = referralsById[row.related_referral_id];
  if (!referral) return "";
  const from = profilesById[referral.referred_user_id];
  return displayFirstName(from, "");
}

function boardCreditItem(row, profilesById, referralsById) {
  const amount = Number(row.amount_cents) || 0;
  return {
    ledgerId: row.id,
    userId: row.user_id,
    firstName: displayFirstName(profilesById[row.user_id]),
    amountCents: amount,
    amountLabel: formatMoneyCents(amount),
    why: creditWhy(row.reason),
    landsOn: formatLandsDate(row.vests_at),
    fromName: referralFromName(row, profilesById, referralsById),
    sortAt: row.status === "pending" ? row.vests_at || row.created_at || "" : row.created_at || "",
  };
}

function publicCreditItem(item) {
  return {
    ledgerId: item.ledgerId,
    userId: item.userId,
    firstName: item.firstName,
    amountCents: item.amountCents,
    amountLabel: item.amountLabel,
    why: item.why,
    landsOn: item.landsOn,
    fromName: item.fromName,
  };
}

/**
 * Pure board payload. Never includes emails — names only.
 * pending = waiting to land; available = vested and unused.
 */
export function buildCreditsBoard({
  ledgerRows = [],
  profilesById = {},
  referralsById = {},
  recentReferrals = [],
  shareCodes = { paidWithCode: 0, paidWithoutCode: 0 },
} = {}) {
  const pending = [];
  const available = [];

  for (const row of ledgerRows || []) {
    const amount = Number(row.amount_cents) || 0;
    if (amount <= 0) continue;
    if (row.status === "pending") {
      pending.push(boardCreditItem(row, profilesById, referralsById));
    } else if (row.status === "available") {
      available.push(boardCreditItem(row, profilesById, referralsById));
    }
  }

  pending.sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)));
  available.sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)));

  const referrals = (recentReferrals || [])
    .filter((r) => r.status === "paid" || r.status === "pending_payment")
    .map((r) => {
      const credit = r.credit_ledger_id
        ? (ledgerRows || []).find((row) => row.id === r.credit_ledger_id)
        : null;
      const paidCents = credit && Number(credit.amount_cents) > 0
        ? Number(credit.amount_cents)
        : (r.status === "paid" ? REFERRAL_CREDIT_CENTS : 0);
      return {
        id: r.id,
        refereeUserId: r.referred_user_id || null,
        advocateUserId: r.advocate_user_id || null,
        refereeName: displayFirstName(profilesById[r.referred_user_id]),
        advocateName: displayFirstName(profilesById[r.advocate_user_id]),
        code: String(r.code || "").trim(),
        status: r.status,
        amountPaidLabel: paidCents ? formatMoneyCents(paidCents) : "",
      };
    });

  return {
    pending: pending.map(publicCreditItem),
    available: available.map(publicCreditItem),
    referrals,
    shareCodes: {
      paidWithCode: Math.max(0, Number(shareCodes.paidWithCode) || 0),
      paidWithoutCode: Math.max(0, Number(shareCodes.paidWithoutCode) || 0),
    },
  };
}
