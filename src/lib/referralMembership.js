/**
 * Referral credit toward the $49 membership.
 * Each paid friend on the 8-week program is $25 (functions/_shared/referrals.js).
 * Two of those ($50) cover one $49 month, and the extra dollar stays stacked.
 * Credits apply to the membership invoice. They do not open the app by themselves.
 */

import { ALUMNI_MONTHLY_AMOUNT } from "./membershipAccess";

export const REFERRAL_CREDIT_CENTS = 2500;
export const REFERRALS_PER_FREE_MONTH = 2;
export const MEMBERSHIP_MONTH_CENTS = ALUMNI_MONTHLY_AMOUNT * 100;

export const REFERRAL_CREDITS_LINE =
  "Two referrals are $50, which covers one month of the $49 membership. Credits stack and apply automatically to your membership or a Lab Review.";

export function referralNudgeCopy() {
  return {
    eyebrow: "Refer a friend",
    title: "Two friends cover a month",
    lead: "Send women to the 8-week program. Each friend who enrolls is $25 in credit for you.",
    stack: "Two referrals are $50 — one free month of the $49 membership. Credits stack, so keep referring and it pays for itself.",
    action: "Share my code",
    fine: "She saves $25 on the 8 weeks. Membership still needs a card on file. The credit covers the charge after it vests, and anything left stacks toward the next month.",
  };
}

function dollars(cents) {
  const n = Math.max(0, Math.round(Number(cents) || 0)) / 100;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function monthLabel(count) {
  return count === 1 ? "1 free month" : `${count} free months`;
}

/**
 * How stacked credit (available + pending) maps onto membership months.
 * A month is the $49 invoice. Progress toward the next one counts in $25 referral steps.
 */
export function referralStackSummary({
  availableCents = 0,
  pendingCents = 0,
  vestingDays = 3,
} = {}) {
  const available = Math.max(0, Math.round(Number(availableCents) || 0));
  const pending = Math.max(0, Math.round(Number(pendingCents) || 0));
  const stacked = available + pending;
  const monthsCovered = Math.floor(stacked / MEMBERSHIP_MONTH_CENTS);
  const towardNext = stacked - monthsCovered * MEMBERSHIP_MONTH_CENTS;
  const stillNeeded = towardNext === 0 ? MEMBERSHIP_MONTH_CENTS : MEMBERSHIP_MONTH_CENTS - towardNext;
  const referralsToGo = Math.ceil(stillNeeded / REFERRAL_CREDIT_CENTS);

  let headline;
  if (stacked === 0) {
    headline = "Nothing stacked yet. Two friends cover your first free month.";
  } else if (monthsCovered === 0 && referralsToGo === 1) {
    headline = `${dollars(stacked)} stacked. One more friend covers a free month.`;
  } else if (monthsCovered === 0) {
    headline = `${dollars(stacked)} stacked. Two friends cover a free month — keep going.`;
  } else if (referralsToGo === 1) {
    headline = `${dollars(stacked)} stacked — ${monthLabel(monthsCovered)} of membership, and you're one friend from the next.`;
  } else if (referralsToGo === 2) {
    headline = `${dollars(stacked)} stacked — ${monthLabel(monthsCovered)} of membership. Two more friends cover the next one.`;
  } else {
    headline = `${dollars(stacked)} stacked — ${monthLabel(monthsCovered)} of membership. ${referralsToGo} more friends cover the next one.`;
  }

  const days = Math.max(0, Math.round(Number(vestingDays) || 0));
  const pendingNote = pending > 0
    ? `${dollars(pending)} is pending and vests in ${days} ${days === 1 ? "day" : "days"}, then it joins this stack on your membership invoice.`
    : "";

  return {
    stackedCents: stacked,
    monthsCovered,
    referralsToGo,
    headline,
    pendingNote,
  };
}
