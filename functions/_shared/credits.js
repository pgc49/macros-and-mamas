/* ==================================================================
   Credit ledger helpers (stage 1)
   ==================================================================
   Available balance = SUM(amount_cents) WHERE status = 'available'.
   Stripe Customer Balance: negative amount = credit to customer.
   Never mirror pending rows. Do not hand-edit balances in Dashboard.
   ================================================================== */

export function vestingDays(env) {
  const n = Number(env.VESTING_DAYS);
  // Default 3 days — enough for Callie to catch a bad enrollment without
  // waiting on macros-approval as a hard trigger.
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

/** Hard cap for admin/manual grants (cents). Referrals are $25; keep headroom. */
export const MAX_MANUAL_GRANT_CENTS = 50_000; // $500
export const MAX_NOTE_CHARS = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

/** Manual grants always need a human note. Referral / milestone grants may omit one. */
export function requireManualGrantNote(note, reason = "manual") {
  const noteText = String(note || "").trim().slice(0, MAX_NOTE_CHARS);
  if (reason === "manual" && !noteText) {
    throw new Error("note required");
  }
  return noteText;
}

export function supabaseConfig(env) {
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

export async function listLedgerForUser(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/credit_ledger?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&select=*`,
    { method: "GET", prefer: "return=representation" },
  );
  return Array.isArray(rows) ? rows : [];
}

export function summarizeLedger(rows) {
  let availableCents = 0;
  let pendingCents = 0;
  for (const r of rows || []) {
    if (r.status === "available") availableCents += Number(r.amount_cents) || 0;
    if (r.status === "pending") pendingCents += Number(r.amount_cents) || 0;
  }
  return { availableCents, pendingCents, rows: rows || [] };
}

/** Build Payments UI payload; null when user has zero ledger rows (hide card). */
export function creditsPayloadForUi(rows) {
  if (!rows?.length) return null;
  const { availableCents, pendingCents } = summarizeLedger(rows);
  return {
    availableCents,
    pendingCents,
    availableDollars: availableCents / 100,
    pendingDollars: pendingCents / 100,
    lineItems: rows.map(formatLineItem),
    copy: "Credits apply automatically to your membership or a Lab Review.",
  };
}

function formatLineItem(row) {
  const dollars = Math.abs(Number(row.amount_cents) || 0) / 100;
  const amountLabel = `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
  let statusLabel = row.status;
  if (row.status === "pending" && row.vests_at) {
    statusLabel = `pending until ${formatShortDate(row.vests_at)}`;
  } else if (row.status === "available") {
    statusLabel = "available";
  } else if (row.status === "redeemed") {
    statusLabel = "applied to invoice";
  } else if (row.status === "reversed") {
    statusLabel = "reversed";
  }
  const note = String(row.note || "").trim();
  const reason = row.reason === "manual"
    ? (note || "Manual credit")
    : row.reason === "redemption"
      ? (note || "Applied to invoice")
      : row.reason === "reversal"
        ? (note || "Reversed")
        : row.reason === "referral"
          ? (note || "Referral")
          : (note || String(row.reason || "Credit"));
  return {
    id: row.id,
    amountCents: row.amount_cents,
    amountLabel,
    status: row.status,
    statusLabel,
    reason: row.reason,
    note,
    vestsAt: row.vests_at,
    createdAt: row.created_at,
    label: `${amountLabel} · ${reason} · ${statusLabel}`,
  };
}

function formatShortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export async function grantCredit(env, {
  userId,
  amountCents,
  reason = "manual",
  note,
  vestsAt,
  relatedReferralId = null,
}) {
  if (!isUuid(userId)) throw new Error("invalid grant");
  const cents = Math.round(Number(amountCents));
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("invalid grant");
  }
  if (reason === "manual" && cents > MAX_MANUAL_GRANT_CENTS) {
    throw new Error(`grant exceeds max $${MAX_MANUAL_GRANT_CENTS / 100}`);
  }
  const noteText = requireManualGrantNote(note, reason);
  if (relatedReferralId != null && relatedReferralId !== "" && !isUuid(relatedReferralId)) {
    throw new Error("invalid grant");
  }
  let vestIso;
  if (vestsAt) {
    const parsed = new Date(vestsAt);
    if (Number.isNaN(parsed.getTime())) throw new Error("invalid grant");
    vestIso = parsed.toISOString();
  } else {
    vestIso = new Date(Date.now() + vestingDays(env) * 86400000).toISOString();
  }

  const rows = await sbFetch(env, "/rest/v1/credit_ledger", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      amount_cents: cents,
      status: "pending",
      reason,
      related_referral_id: relatedReferralId || null,
      vests_at: vestIso,
      note: noteText || null,
    }),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function reverseCredit(env, { ledgerId, note }) {
  if (!isUuid(ledgerId)) throw new Error("ledger row not found");
  const noteText = String(note || "").trim().slice(0, MAX_NOTE_CHARS);
  if (!noteText) throw new Error("note required");

  const rows = await sbFetch(
    env,
    `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(ledgerId)}&select=*`,
    { method: "GET" },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("ledger row not found");
  if (row.status === "reversed" || row.status === "redeemed") {
    throw new Error(`cannot reverse ${row.status} credit`);
  }

  // Pending: never touched Stripe — status only.
  if (row.status === "pending") {
    const updated = await sbFetch(
      env,
      `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(ledgerId)}&status=eq.pending`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "reversed",
          note: appendNote(row.note, `Reversed: ${noteText}`),
        }),
      },
    );
    if (!Array.isArray(updated) || !updated[0]) {
      throw new Error("cannot reverse — row changed status (retry)");
    }
    return updated[0];
  }

  // Available: offset Stripe if mirrored, then mark reversed.
  if (row.status === "available") {
    if (row.mirrored_at && row.amount_cents > 0) {
      const customerId = await stripeCustomerIdForUser(env, row.user_id);
      if (!customerId) {
        // Refuse ledger-only reverse — would leave credit sitting on Stripe.
        throw new Error("cannot reverse mirrored credit without stripe_customer_id");
      }
      // Debit = positive amount on customer balance transaction.
      await postCustomerBalanceTransaction(env, customerId, {
        amount: Math.abs(Number(row.amount_cents)),
        description: `Credit reversal ${row.id}`,
        metadata: { ledger_id: row.id, kind: "reversal" },
        idempotencyKey: `credit_rev_${row.id}`,
      });
    }
    const updated = await sbFetch(
      env,
      `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(ledgerId)}&status=eq.available`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "reversed",
          note: appendNote(row.note, `Reversed: ${noteText}`),
        }),
      },
    );
    if (!Array.isArray(updated) || !updated[0]) {
      throw new Error("cannot reverse — row changed status (retry)");
    }
    // Audit row
    await sbFetch(env, "/rest/v1/credit_ledger", {
      method: "POST",
      body: JSON.stringify({
        user_id: row.user_id,
        amount_cents: -Math.abs(Number(row.amount_cents)),
        status: "reversed",
        reason: "reversal",
        note: noteText,
        related_referral_id: row.related_referral_id,
        mirrored_at: row.mirrored_at ? new Date().toISOString() : null,
      }),
    });
    return updated[0];
  }

  throw new Error(`cannot reverse ${row.status}`);
}

function appendNote(existing, extra) {
  const a = String(existing || "").trim();
  const b = String(extra || "").trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} · ${b}`;
}

export async function stripeCustomerIdForUser(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id`,
    { method: "GET" },
  );
  const id = Array.isArray(rows) ? rows[0]?.stripe_customer_id : null;
  return id ? String(id) : "";
}

export async function postCustomerBalanceTransaction(env, customerId, {
  amount,
  description,
  metadata,
  idempotencyKey,
}) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("missing STRIPE_SECRET_KEY");
  const params = new URLSearchParams();
  params.set("amount", String(Math.round(amount)));
  params.set("currency", "usd");
  if (description) params.set("description", String(description).slice(0, 350));
  if (metadata && typeof metadata === "object") {
    for (const [k, v] of Object.entries(metadata)) {
      if (v != null && v !== "") params.set(`metadata[${k}]`, String(v).slice(0, 500));
    }
  }
  const headers = {
    authorization: `Bearer ${secret}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  // Prevent double-credit / double-debit if cron or reverse retries after a partial failure.
  if (idempotencyKey) {
    headers["Idempotency-Key"] = String(idempotencyKey).slice(0, 255);
  }
  const resp = await fetch(
    `https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}/balance_transactions`,
    {
      method: "POST",
      headers,
      body: params,
    },
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || "stripe balance transaction failed");
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Vest due pending rows → available, then mirror unmirrored available credits to Stripe.
 */
export async function runCreditsCron(env) {
  const nowIso = new Date().toISOString();
  const stats = {
    vested: 0,
    mirrored: 0,
    mirrorSkippedNoCustomer: 0,
    errors: 0,
  };

  const due = await sbFetch(
    env,
    `/rest/v1/credit_ledger?status=eq.pending&vests_at=lte.${encodeURIComponent(nowIso)}&select=*&order=vests_at.asc&limit=200`,
    { method: "GET" },
  );
  for (const row of Array.isArray(due) ? due : []) {
    try {
      const updated = await sbFetch(
        env,
        `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(row.id)}&status=eq.pending`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "available" }),
        },
      );
      if (Array.isArray(updated) && updated[0]) stats.vested += 1;
    } catch (e) {
      console.error("vest failed", row.id, e);
      stats.errors += 1;
    }
  }

  const unmirrored = await sbFetch(
    env,
    `/rest/v1/credit_ledger?status=eq.available&mirrored_at=is.null&amount_cents=gt.0&select=*&order=created_at.asc&limit=200`,
    { method: "GET" },
  );
  for (const row of Array.isArray(unmirrored) ? unmirrored : []) {
    try {
      const customerId = await stripeCustomerIdForUser(env, row.user_id);
      if (!customerId) {
        stats.mirrorSkippedNoCustomer += 1;
        continue;
      }
      // Negative amount = credit on Stripe Customer Balance.
      const tx = await postCustomerBalanceTransaction(env, customerId, {
        amount: -Math.abs(Number(row.amount_cents)),
        description: `Mama credit ${row.id}`,
        metadata: { ledger_id: row.id, reason: row.reason || "" },
        idempotencyKey: `credit_mirror_${row.id}`,
      });
      const patched = await sbFetch(
        env,
        `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(row.id)}&status=eq.available&mirrored_at=is.null`,
        {
          method: "PATCH",
          body: JSON.stringify({
            mirrored_at: new Date().toISOString(),
            stripe_balance_transaction_id: tx.id || null,
          }),
        },
      );
      if (Array.isArray(patched) && patched[0]) stats.mirrored += 1;
    } catch (e) {
      console.error("mirror failed", row.id, e);
      stats.errors += 1;
    }
  }

  return stats;
}

/**
 * Cents of customer credit applied to an invoice.
 * Stripe: negative customer balance = credit. Example: starting=-2500, ending=0 → 2500.
 */
export function creditConsumedFromInvoice(invoice) {
  const starting = Number(invoice?.starting_balance);
  const ending = Number(invoice?.ending_balance);
  if (!Number.isFinite(starting) || !Number.isFinite(ending)) return 0;
  return ending - starting;
}

/**
 * invoice.paid: if customer balance was consumed, FIFO-mark available credits redeemed
 * and insert an audit redemption row.
 */
export async function handleInvoicePaidCredits(env, invoice) {
  const consumed = creditConsumedFromInvoice(invoice);
  if (consumed <= 0) {
    const starting = Number(invoice?.starting_balance);
    const ending = Number(invoice?.ending_balance);
    if (!Number.isFinite(starting) || !Number.isFinite(ending)) {
      return { skipped: "no_balances" };
    }
    return { skipped: "no_credit_applied" };
  }

  const customerId = String(invoice.customer || "");
  if (!customerId) return { skipped: "no_customer" };

  const invoiceId = String(invoice.id || "").trim();
  if (invoiceId) {
    // Idempotent within a released/retried webhook: one redemption audit per invoice.
    const existing = await sbFetch(
      env,
      `/rest/v1/credit_ledger?reason=eq.redemption&note=eq.${encodeURIComponent(`Applied to invoice ${invoiceId}`)}&select=id&limit=1`,
      { method: "GET" },
    );
    if (Array.isArray(existing) && existing[0]) {
      return { skipped: "already_recorded", invoiceId, redemptionId: existing[0].id };
    }
  }

  const profiles = await sbFetch(
    env,
    `/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    { method: "GET" },
  );
  const userId = Array.isArray(profiles) ? profiles[0]?.id : null;
  if (!userId) {
    console.warn("invoice.paid credit: no profile for customer", customerId);
    return { skipped: "no_profile" };
  }

  const available = await sbFetch(
    env,
    `/rest/v1/credit_ledger?user_id=eq.${encodeURIComponent(userId)}&status=eq.available&amount_cents=gt.0&order=created_at.asc&select=*`,
    { method: "GET" },
  );
  let need = consumed;
  const redeemedIds = [];
  for (const row of Array.isArray(available) ? available : []) {
    if (need <= 0) break;
    const amt = Number(row.amount_cents) || 0;
    if (amt <= 0) continue;

    if (amt <= need) {
      const patched = await sbFetch(
        env,
        `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(row.id)}&status=eq.available`,
        { method: "PATCH", body: JSON.stringify({ status: "redeemed" }) },
      );
      if (Array.isArray(patched) && patched[0]) {
        redeemedIds.push(row.id);
        need -= amt;
      }
    } else {
      // Partial: redeem `need` from this row; leave remainder available.
      // Stripe already took only `consumed` from the customer balance.
      const remainder = amt - need;
      const patched = await sbFetch(
        env,
        `/rest/v1/credit_ledger?id=eq.${encodeURIComponent(row.id)}&status=eq.available`,
        {
          method: "PATCH",
          body: JSON.stringify({
            amount_cents: need,
            status: "redeemed",
            note: appendNote(row.note, `Partial redeem on ${invoiceId || "invoice"}`),
          }),
        },
      );
      if (!Array.isArray(patched) || !patched[0]) continue;
      await sbFetch(env, "/rest/v1/credit_ledger", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          amount_cents: remainder,
          status: "available",
          reason: row.reason,
          related_referral_id: row.related_referral_id,
          vests_at: row.vests_at,
          // Remainder is still sitting in Stripe Customer Balance from the original mirror.
          mirrored_at: row.mirrored_at || new Date().toISOString(),
          stripe_balance_transaction_id: row.stripe_balance_transaction_id,
          note: appendNote(row.note, "Remainder after partial redemption"),
        }),
      });
      redeemedIds.push(row.id);
      need = 0;
    }
  }

  if (need > 0) {
    // Stripe consumed more credit than our available ledger (manual Dashboard edit, etc.).
    console.warn("invoice.paid credit: ledger shortfall", {
      invoiceId,
      userId,
      consumed,
      shortfall: need,
      redeemedIds,
    });
  }

  const applied = consumed - need;
  // Always write the audit row once we know Stripe consumed credit (even if the
  // ledger had no matching available rows — e.g. retry after grants already marked).
  await sbFetch(env, "/rest/v1/credit_ledger", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      amount_cents: -consumed,
      status: "redeemed",
      reason: "redemption",
      note: `Applied to invoice ${invoiceId || "unknown"}`.trim(),
    }),
  });

  return { consumed, applied, shortfall: need, redeemedIds, userId };
}

export async function findProfileByEmail(env, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?email=eq.${encodeURIComponent(normalized)}&select=id,email,name,stripe_customer_id,paid,role&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}
