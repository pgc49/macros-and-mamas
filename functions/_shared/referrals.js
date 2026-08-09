/* ==================================================================
   Referral codes + attribution (stage 2)
   ================================================================== */

import {
  grantCredit,
  listLedgerForUser,
  reverseCredit,
  summarizeLedger,
  vestingDays,
} from "./credits.js";
import { referralCouponId } from "./pricing.js";

export const REFERRAL_CREDIT_CENTS = 2500;
export const AMBASSADOR_PAID_THRESHOLD = 3;

export function referralCohortLabel(env) {
  return String(env.REFERRAL_COHORT_LABEL || "2026-08").slice(0, 40);
}

function supabaseConfig(env) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { base, key };
}

async function sbFetch(env, path, init = {}) {
  const { base, key } = supabaseConfig(env);
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    const err = new Error(`supabase ${resp.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

function cleanNameToken(raw, maxLen = 12) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, maxLen);
}

/** FIRSTNAME25 → SARAH25 (first token of name / email local-part). */
export function baseCodeFromName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "MAMA";
  const cleaned = cleanNameToken(first) || "MAMA";
  return `${cleaned}25`;
}

/**
 * Ordered code candidates for an advocate.
 * 1) SARAH25
 * 2) SARAHJ25 (first letter of last name) when available
 * 3) SARAH252, SARAH253… numeric fallback
 */
export function referralCodeCandidates({ name, lastName } = {}) {
  const firstRaw = String(name || "").trim().split(/\s+/)[0] || "MAMA";
  const first = cleanNameToken(firstRaw) || "MAMA";
  const lastInitial = cleanNameToken(lastName, 1);
  const primary = `${first}25`;
  const withLast = lastInitial ? `${first}${lastInitial}25` : "";
  const out = [];
  const seen = new Set();
  const push = (code) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  push(primary);
  push(withLast);
  for (let n = 2; n <= 25; n += 1) {
    push(`${primary}${n}`);
  }
  return out;
}

export function normalizeReferralCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function shareBlurb(code) {
  const c = normalizeReferralCode(code);
  return (
    `I did the 8-week Macros and Mamas program and it actually fit around my kids. `
    + `Full disclosure — I get a credit if you enroll with my code, and you save $25 on top of the quiz rate. `
    + `When you sign up, use my code ${c} for $25 off → macrosandmamas.com/quiz`
  );
}

export async function getReferralCodeForUser(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/referral_codes?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function findReferralCodeByCode(env, code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const rows = await sbFetch(
    env,
    `/rest/v1/referral_codes?code=eq.${encodeURIComponent(normalized)}&active=eq.true&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function findReferralCodeByPromoId(env, promoId) {
  if (!promoId) return null;
  const rows = await sbFetch(
    env,
    `/rest/v1/referral_codes?stripe_promotion_code_id=eq.${encodeURIComponent(promoId)}&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createStripePromotionCode(env, code, advocateUserId) {
  const secret = env.STRIPE_SECRET_KEY;
  const coupon = referralCouponId(env);
  if (!secret) throw new Error("missing STRIPE_SECRET_KEY");
  if (!coupon) throw new Error("missing COUPON_REFERRAL_25");

  const params = new URLSearchParams();
  params.set("code", code);
  params.set("promotion[type]", "coupon");
  params.set("promotion[coupon]", coupon);
  params.set("metadata[advocate_user_id]", advocateUserId);
  params.set("metadata[program]", "macros_and_mamas");

  const resp = await fetch("https://api.stripe.com/v1/promotion_codes", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || "stripe promotion code failed");
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function findStripePromoByCode(env, code) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !code) return null;
  const url =
    `https://api.stripe.com/v1/promotion_codes`
    + `?code=${encodeURIComponent(code)}&limit=1`;
  const resp = await fetch(url, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => ({}));
  return Array.isArray(data?.data) ? data.data[0] || null : null;
}

async function findReferralCodeByCodeAny(env, code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const rows = await sbFetch(
    env,
    `/rest/v1/referral_codes?code=eq.${encodeURIComponent(normalized)}&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function ensureReferralCode(env, { userId, name, lastName }) {
  const existing = await getReferralCodeForUser(env, userId);
  if (existing) return existing;

  // Prefer SARAH25 → SARAHJ25 (last initial) → SARAH252… numeric fallback.
  const candidates = referralCodeCandidates({ name, lastName });
  let lastErr = null;
  for (const codeToUse of candidates) {
    const taken = await findReferralCodeByCodeAny(env, codeToUse);
    if (taken) {
      if (taken.user_id === userId) return taken;
      continue;
    }
    try {
      let promo;
      try {
        promo = await createStripePromotionCode(env, codeToUse, userId);
      } catch (stripeErr) {
        const msg = String(stripeErr?.message || stripeErr?.data?.error?.message || "");
        const recovered = await findStripePromoByCode(env, codeToUse);
        if (
          recovered
          && String(recovered.metadata?.advocate_user_id || "") === String(userId)
        ) {
          promo = recovered;
        } else if (/already|exists|duplicate/i.test(msg) || stripeErr?.status === 400) {
          lastErr = stripeErr;
          continue;
        } else {
          throw stripeErr;
        }
      }
      const rows = await sbFetch(env, "/rest/v1/referral_codes", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          code: codeToUse,
          stripe_promotion_code_id: promo.id,
          active: true,
        }),
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e?.data?.error?.message || "");
      if (/duplicate|unique|already|23505/i.test(msg) || e?.status === 409) {
        // Concurrent insert for this user — re-read.
        const raced = await getReferralCodeForUser(env, userId);
        if (raced) return raced;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("could not allocate referral code");
}

export async function buildSharePayload(env, userId) {
  const profileRows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,name,last_name,email,paid,ambassador&limit=1`,
    { method: "GET" },
  );
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  if (!profile) throw new Error("profile not found");

  const codeRow = await ensureReferralCode(env, {
    userId,
    name: profile.name || profile.email,
    lastName: profile.last_name,
  });

  const referrals = await sbFetch(
    env,
    `/rest/v1/referrals?advocate_user_id=eq.${encodeURIComponent(userId)}&select=id,status,referred_email,created_at,code&order=created_at.desc`,
    { method: "GET" },
  );
  const list = Array.isArray(referrals) ? referrals : [];
  const friendsEnrolled = list.filter((r) => r.status === "paid").length;

  const ledger = await listLedgerForUser(env, userId);
  const referralLedger = (ledger || []).filter((r) => r.reason === "referral");
  const { availableCents, pendingCents } = summarizeLedger(referralLedger);

  return {
    code: codeRow.code,
    blurb: shareBlurb(codeRow.code),
    quizUrl: "https://www.macrosandmamas.com/quiz",
    friendsEnrolled,
    availableCents,
    pendingCents,
    availableDollars: availableCents / 100,
    pendingDollars: pendingCents / 100,
    ambassador: !!profile.ambassador,
    vestingDays: vestingDays(env),
    referrals: list,
  };
}

/** Resolve a typed code for checkout; throws on self-referral / unknown. */
export async function resolvePromotionForCheckout(env, {
  code,
  checkoutUserId,
  checkoutEmail,
}) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const row = await findReferralCodeByCode(env, normalized);
  if (!row) {
    const err = new Error("That referral code isn’t valid.");
    err.status = 400;
    throw err;
  }
  if (row.user_id === checkoutUserId) {
    const err = new Error("You can’t use your own referral code.");
    err.status = 400;
    throw err;
  }
  // Also block if advocate email matches checkout email.
  const adv = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(row.user_id)}&select=email&limit=1`,
    { method: "GET" },
  );
  const advEmail = String(Array.isArray(adv) ? adv[0]?.email || "" : "").toLowerCase();
  if (advEmail && checkoutEmail && advEmail === String(checkoutEmail).toLowerCase()) {
    const err = new Error("You can’t use your own referral code.");
    err.status = 400;
    throw err;
  }
  return row;
}

async function countPaidReferrals(env, advocateUserId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/referrals?advocate_user_id=eq.${encodeURIComponent(advocateUserId)}&status=eq.paid&select=id`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows.length : 0;
}

async function maybeMarkAmbassador(env, advocateUserId) {
  const paidCount = await countPaidReferrals(env, advocateUserId);
  if (paidCount < AMBASSADOR_PAID_THRESHOLD) return { paidCount, promoted: false };

  const profiles = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(advocateUserId)}&select=id,name,email,ambassador&limit=1`,
    { method: "GET" },
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return { paidCount, promoted: false };
  if (profile.ambassador) return { paidCount, promoted: false };

  await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(advocateUserId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ambassador: true }),
    },
  );
  await notifyAmbassador(env, {
    name: profile.name,
    email: profile.email,
    paidCount,
  });
  return { paidCount, promoted: true };
}

async function notifyAmbassador(env, { name, email, paidCount }) {
  const key = env.RESEND_API_KEY;
  const to = String(env.CALLIE_NOTIFY_EMAIL || "").trim();
  if (!key || !to) {
    console.warn("ambassador notify skipped — missing RESEND_API_KEY or CALLIE_NOTIFY_EMAIL");
    return;
  }
  const display = name || email || "Mama";
  const subject = `🏆 Ambassador: ${display} hit ${paidCount} paid referrals`;
  const text = [
    `${display} just hit ${paidCount} paid referrals.`,
    email ? `Email: ${email}` : "",
    "Manual $100 ambassador payout — no automated cash-out.",
    "https://www.macrosandmamas.com/admin",
  ].filter(Boolean).join("\n");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "Callie at Macros and Mamas <calista@nourishwithcalista.com>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!resp.ok) {
      console.error("ambassador notify failed", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("ambassador notify error", e);
  }
}

/**
 * Attribute a checkout session to an advocate + grant pending credit when paid.
 */
export async function handleCheckoutReferral(env, session, { forcePaid = false } = {}) {
  const sessionId = String(session.id || "");
  if (!sessionId) return { skipped: "no_session" };

  const existing = await sbFetch(
    env,
    `/rest/v1/referrals?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
    { method: "GET" },
  );
  let referral = Array.isArray(existing) ? existing[0] : null;

  const payStatus = String(session.payment_status || "");
  const isPaid = forcePaid
    || payStatus === "paid"
    || payStatus === "no_payment_required";

  if (!referral) {
    const promoId = await extractPromotionCodeId(env, session);
    const codeMeta = normalizeReferralCode(session.metadata?.referral_code || "");
    let codeRow = promoId ? await findReferralCodeByPromoId(env, promoId) : null;
    if (!codeRow && codeMeta) codeRow = await findReferralCodeByCode(env, codeMeta);
    if (!codeRow) return { skipped: "no_referral_promo" };

    // Only credit for our REFERRAL_25 coupon family (code row implies that).
    const referredUserId =
      session.metadata?.supabase_user_id || session.client_reference_id || null;
    if (referredUserId && referredUserId === codeRow.user_id) {
      return { skipped: "self_referral" };
    }

    const referredEmail =
      session.customer_email
      || session.customer_details?.email
      || null;

    try {
      const inserted = await sbFetch(env, "/rest/v1/referrals", {
        method: "POST",
        body: JSON.stringify({
          advocate_user_id: codeRow.user_id,
          code: codeRow.code,
          referred_user_id: referredUserId,
          referred_email: referredEmail,
          stripe_checkout_session_id: sessionId,
          cohort_label: referralCohortLabel(env),
          status: isPaid ? "paid" : "pending_payment",
        }),
      });
      referral = Array.isArray(inserted) ? inserted[0] : inserted;
    } catch (insertErr) {
      const msg = String(insertErr?.message || "");
      if (!/duplicate|unique|23505/i.test(msg) && insertErr?.status !== 409) {
        throw insertErr;
      }
      const again = await sbFetch(
        env,
        `/rest/v1/referrals?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
        { method: "GET" },
      );
      referral = Array.isArray(again) ? again[0] : null;
    }
  }

  if (!referral) return { skipped: "insert_failed" };

  if (isPaid && referral.status !== "paid") {
    await sbFetch(
      env,
      `/rest/v1/referrals?id=eq.${encodeURIComponent(referral.id)}`,
      { method: "PATCH", body: JSON.stringify({ status: "paid" }) },
    );
    referral.status = "paid";
  }

  if (referral.status === "paid" && !referral.credit_ledger_id) {
    // Idempotent: reuse an existing ledger row for this referral if present.
    const prior = await sbFetch(
      env,
      `/rest/v1/credit_ledger?related_referral_id=eq.${encodeURIComponent(referral.id)}&reason=eq.referral&select=*&order=created_at.asc&limit=1`,
      { method: "GET" },
    );
    let credit = Array.isArray(prior) ? prior[0] : null;
    if (!credit) {
      const note = `Referral ${referral.code} · ${referral.referred_email || "friend"} enrolled`;
      try {
        credit = await grantCredit(env, {
          userId: referral.advocate_user_id,
          amountCents: REFERRAL_CREDIT_CENTS,
          reason: "referral",
          note,
          relatedReferralId: referral.id,
        });
      } catch (grantErr) {
        const msg = String(grantErr?.message || "");
        if (!/duplicate|unique|23505/i.test(msg) && grantErr?.status !== 409) {
          throw grantErr;
        }
        const again = await sbFetch(
          env,
          `/rest/v1/credit_ledger?related_referral_id=eq.${encodeURIComponent(referral.id)}&reason=eq.referral&select=*&order=created_at.asc&limit=1`,
          { method: "GET" },
        );
        credit = Array.isArray(again) ? again[0] : null;
        if (!credit) throw grantErr;
      }
    }
    await sbFetch(
      env,
      `/rest/v1/referrals?id=eq.${encodeURIComponent(referral.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ credit_ledger_id: credit.id }),
      },
    );
    referral.credit_ledger_id = credit.id;
    const amb = await maybeMarkAmbassador(env, referral.advocate_user_id);
    return { ok: true, referral, credit, ambassador: amb };
  }

  return { ok: true, referral, credit: null };
}

async function extractPromotionCodeId(env, session) {
  const fromMeta = String(session.metadata?.referral_promo_id || "").trim();
  if (fromMeta) return fromMeta;

  // Hosted Checkout with allow_promotion_codes — retrieve with expand.
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !session.id) return "";
  try {
    const url =
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}`
      + `?expand[]=total_details.breakdown.discounts.discount.promotion_code`
      + `&expand[]=discounts.promotion_code`;
    const resp = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!resp.ok) return "";
    const full = await resp.json().catch(() => ({}));
    const discounts = full.discounts || [];
    for (const d of discounts) {
      const pc = d.promotion_code;
      if (typeof pc === "string" && pc.startsWith("promo_")) return pc;
      if (pc && typeof pc === "object" && pc.id) return pc.id;
    }
  } catch (e) {
    console.error("extractPromotionCodeId failed", e);
  }
  return "";
}

export async function handleChargeRefundedReferral(env, charge) {
  const pi = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!pi) return { skipped: "no_pi" };

  const profiles = await sbFetch(
    env,
    `/rest/v1/profiles?stripe_payment_intent=eq.${encodeURIComponent(pi)}&select=id&limit=1`,
    { method: "GET" },
  );
  const referredUserId = Array.isArray(profiles) ? profiles[0]?.id : null;
  if (!referredUserId) return { skipped: "no_profile" };

  const refs = await sbFetch(
    env,
    `/rest/v1/referrals?referred_user_id=eq.${encodeURIComponent(referredUserId)}&status=eq.paid&order=created_at.desc&limit=1`,
    { method: "GET" },
  );
  const referral = Array.isArray(refs) ? refs[0] : null;
  if (!referral) return { skipped: "no_referral" };

  await sbFetch(
    env,
    `/rest/v1/referrals?id=eq.${encodeURIComponent(referral.id)}`,
    { method: "PATCH", body: JSON.stringify({ status: "refunded" }) },
  );

  if (referral.credit_ledger_id) {
    try {
      await reverseCredit(env, {
        ledgerId: referral.credit_ledger_id,
        note: `Referral refund · session ${referral.stripe_checkout_session_id}`,
      });
    } catch (e) {
      // Already reversed / redeemed — log and continue.
      console.error("referral credit reverse failed", referral.id, e);
      return { ok: true, referralId: referral.id, reverseError: String(e.message || e) };
    }
  }
  return { ok: true, referralId: referral.id, reversed: !!referral.credit_ledger_id };
}

/** Backfill codes for active paid clients (Cohort 1 style). */
export async function backfillReferralCodes(env) {
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?role=eq.client&paid=eq.true&refunded=eq.false&status=eq.active&select=id,name,last_name,email&order=created_at.asc&limit=500`,
    { method: "GET" },
  );
  const list = Array.isArray(rows) ? rows : [];
  const stats = { created: 0, existed: 0, errors: 0, total: list.length };
  for (const p of list) {
    try {
      const before = await getReferralCodeForUser(env, p.id);
      const row = await ensureReferralCode(env, {
        userId: p.id,
        name: p.name || p.email,
        lastName: p.last_name,
      });
      if (before) stats.existed += 1;
      else if (row) stats.created += 1;
    } catch (e) {
      console.error("backfill code failed", p.id, e);
      stats.errors += 1;
    }
  }
  return stats;
}
