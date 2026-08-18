import { rosterTitle } from "./clientRoster.js";

const OPEN_LEDGER = new Set(["pending", "available"]);
const OPEN_REFERRAL = new Set(["paid", "pending_payment"]);

export function moneyCents(cents) {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n / 100);
}

function isActivePaidMama(client) {
  if (!client || String(client.role || "").toLowerCase() === "admin") return false;
  if (!client.paid || client.refunded) return false;
  return client.status === "active" || client.stage === "active";
}

export function codeByUserId(codeRows = []) {
  const out = {};
  for (const row of codeRows || []) {
    if (!row?.user_id || row.active === false) continue;
    out[row.user_id] = String(row.code || "").trim().toUpperCase();
  }
  return out;
}

/** Active paid mamas who should have a share code but do not. */
export function missingShareCodes(roster = [], codeRows = []) {
  const have = codeByUserId(codeRows);
  return (roster || [])
    .filter(isActivePaidMama)
    .filter((c) => !have[c.id])
    .map((c) => ({
      userId: c.id,
      name: rosterTitle(c),
      email: c.email || "",
    }));
}

/**
 * Coach-facing snapshot: outstanding balances, live referrals, missing codes.
 */
export function buildCreditsOverview({
  roster = [],
  ledgerRows = [],
  referralRows = [],
  codeRows = [],
} = {}) {
  const byId = Object.fromEntries((roster || []).map((c) => [c.id, c]));
  const codes = codeByUserId(codeRows);

  const balances = {};
  for (const row of ledgerRows || []) {
    if (!row?.user_id || !OPEN_LEDGER.has(row.status)) continue;
    if (!balances[row.user_id]) {
      balances[row.user_id] = { availableCents: 0, pendingCents: 0 };
    }
    const cents = Number(row.amount_cents) || 0;
    if (row.status === "available") balances[row.user_id].availableCents += cents;
    if (row.status === "pending") balances[row.user_id].pendingCents += cents;
  }

  const outstanding = Object.entries(balances)
    .filter(([, b]) => b.availableCents > 0 || b.pendingCents > 0)
    .map(([userId, b]) => {
      const client = byId[userId] || {};
      return {
        userId,
        name: rosterTitle(client) || client.email || "Mama",
        email: client.email || "",
        availableCents: b.availableCents,
        pendingCents: b.pendingCents,
        code: codes[userId] || "",
      };
    })
    .sort((a, b) => (b.availableCents + b.pendingCents) - (a.availableCents + a.pendingCents));

  const referrals = (referralRows || [])
    .filter((row) => OPEN_REFERRAL.has(row.status))
    .map((row) => {
      const advocate = byId[row.advocate_user_id] || {};
      const referred = byId[row.referred_user_id] || {};
      return {
        id: row.id,
        code: String(row.code || "").trim().toUpperCase(),
        status: row.status,
        createdAt: row.created_at || "",
        advocateUserId: row.advocate_user_id || "",
        advocateName: rosterTitle(advocate) || advocate.email || String(row.code || "Advocate"),
        referredUserId: row.referred_user_id || "",
        referredName:
          rosterTitle(referred)
          || referred.email
          || row.referred_email
          || "Friend",
      };
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const missingCodes = missingShareCodes(roster, codeRows);

  return {
    totals: {
      availableCents: outstanding.reduce((sum, row) => sum + row.availableCents, 0),
      pendingCents: outstanding.reduce((sum, row) => sum + row.pendingCents, 0),
      mamaCount: outstanding.length,
      referralCount: referrals.length,
      paidReferralCount: referrals.filter((row) => row.status === "paid").length,
      codeCount: Object.keys(codes).length,
      missingCodeCount: missingCodes.length,
    },
    outstanding,
    referrals,
    missingCodes,
  };
}
