/**
 * Admin Credits tab — outstanding balances, live referrals, share codes.
 * Grant/reverse stays as a lookup; codes assign themselves for active mamas.
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { supabase } from "../lib/supabase";
import {
  buildCreditsOverview,
  moneyCents,
} from "./creditsOverview";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function when(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Snap({ label, value }) {
  return (
    <div style={{
      flex: "1 1 30%",
      minWidth: 100,
      background: T.track,
      borderRadius: 12,
      padding: "12px 8px",
      textAlign: "center",
    }}
    >
      <div style={{ fontFamily: FD, fontSize: 22, color: T.ink }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.3, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export function OutstandingCreditsList({ rows = [], onSelect }) {
  if (!rows.length) {
    return (
      <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
        Nobody has a credit waiting right now.
      </div>
    );
  }
  return (
    <div>
      {rows.map((row) => (
        <button
          key={row.userId}
          type="button"
          onClick={() => onSelect?.(row.userId, row.email)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "12px 0",
            border: "none",
            borderTop: `1px solid ${T.border}`,
            background: "transparent",
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{row.name}</div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
            {row.availableCents > 0 ? `${moneyCents(row.availableCents)} ready` : ""}
            {row.availableCents > 0 && row.pendingCents > 0 ? " · " : ""}
            {row.pendingCents > 0 ? `${moneyCents(row.pendingCents)} waiting` : ""}
            {row.code ? ` · ${row.code}` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}

export function ActiveReferralsList({
  rows = [],
  onOpenReferred,
  onMessageAdvocate,
}) {
  if (!rows.length) {
    return (
      <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
        No friend has used a share code yet.
      </div>
    );
  }
  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            padding: "12px 0",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <button
            type="button"
            onClick={() => row.referredUserId && onOpenReferred?.(row.referredUserId)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: row.referredUserId ? "pointer" : "default",
              fontFamily: F,
              padding: 0,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>
              {row.advocateName}
              <span style={{ fontWeight: 600, color: T.inkSoft }}> → {row.referredName}</span>
            </div>
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
              {row.code || "—"}
              {" · "}
              {row.status === "paid" ? "Paid" : "Waiting on payment"}
            </div>
          </button>
          {row.advocateUserId && onMessageAdvocate ? (
            <button
              type="button"
              onClick={() => onMessageAdvocate(row.advocateUserId)}
              aria-label={`Message ${row.advocateName}`}
              style={{
                flexShrink: 0,
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 12,
                border: `1.5px solid ${T.accent}`,
                background: "#fff",
                color: T.accentDeep,
                fontFamily: F,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Msg
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AdminCredits({
  roster = [],
  onOpenClient,
  onMessageClient,
}) {
  const [ledgerRows, setLedgerRows] = useState([]);
  const [referralRows, setReferralRows] = useState([]);
  const [codeRows, setCodeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overviewErr, setOverviewErr] = useState("");
  const [ensuring, setEnsuring] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [grantDollars, setGrantDollars] = useState("25");
  const [grantNote, setGrantNote] = useState("");
  const [vestNow, setVestNow] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);

  const overview = useMemo(
    () => buildCreditsOverview({ roster, ledgerRows, referralRows, codeRows }),
    [roster, ledgerRows, referralRows, codeRows],
  );

  const loadOverview = async () => {
    setOverviewErr("");
    const [ledger, referrals, codes] = await Promise.all([
      supabase
        .from("credit_ledger")
        .select("id, user_id, amount_cents, status, reason, note, vests_at, created_at")
        .in("status", ["pending", "available"])
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("referrals")
        .select("id, advocate_user_id, referred_user_id, referred_email, code, status, created_at")
        .in("status", ["paid", "pending_payment"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("referral_codes")
        .select("user_id, code, active")
        .eq("active", true)
        .limit(500),
    ]);
    if (ledger.error) throw ledger.error;
    if (referrals.error) throw referrals.error;
    if (codes.error) throw codes.error;
    setLedgerRows(ledger.data || []);
    setReferralRows(referrals.data || []);
    setCodeRows(codes.data || []);
    return {
      ledgerRows: ledger.data || [],
      referralRows: referrals.data || [],
      codeRows: codes.data || [],
    };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const loaded = await loadOverview();
        if (cancelled) return;
        const missing = buildCreditsOverview({
          roster,
          ledgerRows: loaded.ledgerRows,
          referralRows: loaded.referralRows,
          codeRows: loaded.codeRows,
        }).missingCodes;
        if (missing.length) {
          setEnsuring(true);
          try {
            const headers = await authHeaders();
            await fetch("/api/admin-referrals", {
              method: "POST",
              headers,
              body: JSON.stringify({ action: "ensure-active" }),
            });
            if (!cancelled) await loadOverview();
          } catch (ensureErr) {
            console.warn("auto-assign share codes failed", ensureErr);
          } finally {
            if (!cancelled) setEnsuring(false);
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setOverviewErr("Couldn't load credits. Try refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Roster identity is enough — avoid re-running on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.length]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (roster || [])
      .filter((c) => c.role !== "admin")
      .filter((c) => {
        const hay = `${c.name || ""} ${c.email || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [roster, query]);

  const loadUser = async (userId, email) => {
    setBusy(true);
    setErr("");
    setOkMsg("");
    setLookupOpen(true);
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      else if (email) params.set("email", email);
      const resp = await fetch(`/api/admin-credits?${params}`, { headers });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Couldn't load ledger.");
      setPayload(data);
      setSelectedId(data.profile?.id || userId || "");
      setQuery(data.profile?.email || email || query);
    } catch (e) {
      setPayload(null);
      setErr(e?.message || "Load failed.");
    } finally {
      setBusy(false);
    }
  };

  const grant = async () => {
    if (!payload?.profile?.id) return;
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const headers = await authHeaders();
      const body = {
        action: "grant",
        userId: payload.profile.id,
        amountDollars: Number(grantDollars),
        note: grantNote,
        reason: "manual",
      };
      if (vestNow) body.vestsAt = new Date().toISOString();
      const resp = await fetch("/api/admin-credits", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Grant failed.");
      setOkMsg(`Added ${moneyCents(data.row?.amount_cents)}. It shows as ready ${vestNow ? "now" : "after a few days"}.`);
      setGrantNote("");
      await loadUser(payload.profile.id);
      await loadOverview();
    } catch (e) {
      setErr(e?.message || "Grant failed.");
      setBusy(false);
    }
  };

  const reverseRow = async (ledgerId) => {
    const reason = window.prompt("Why are you reversing this credit?", "");
    if (reason == null) return;
    if (!String(reason).trim()) {
      setErr("A reverse note is required.");
      return;
    }
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/admin-credits", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reverse", ledgerId, note: reason }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Reverse failed.");
      setOkMsg("Credit reversed.");
      await loadUser(payload.profile.id);
      await loadOverview();
    } catch (e) {
      setErr(e?.message || "Reverse failed.");
      setBusy(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
        When a mama’s friend joins with her share code, she earns $25. It waits a few days,
        then applies to membership. Every active mama gets a code automatically — they copy it
        from Account → Share.
      </p>

      {loading ? (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, color: T.inkSoft }}>Loading credits…</div>
        </Card>
      ) : overviewErr ? (
        <Card style={{ marginBottom: 14, background: T.accentSoft, border: "none" }}>
          <div style={{ fontSize: 14, color: T.accentDeep }}>{overviewErr}</div>
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <Snap label="Ready to use" value={moneyCents(overview.totals.availableCents)} />
            <Snap label="Waiting to vest" value={moneyCents(overview.totals.pendingCents)} />
            <Snap label="Live referrals" value={overview.totals.referralCount} />
            <Snap label="Share codes" value={overview.totals.codeCount} />
          </div>

          {ensuring ? (
            <Card style={{ marginBottom: 14, background: T.sageSoft, border: "none" }}>
              <div style={{ fontSize: 13.5, color: T.sage, lineHeight: 1.45 }}>
                Assigning share codes to active mamas who don’t have one yet…
              </div>
            </Card>
          ) : null}

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Outstanding credits</div>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
              Tap a mama to see her ledger or add a one-off credit.
            </p>
            <OutstandingCreditsList rows={overview.outstanding} onSelect={loadUser} />
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Share codes in use</div>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
              Friend used a code. Msg thanks the mama who shared it.
            </p>
            <ActiveReferralsList
              rows={overview.referrals}
              onOpenReferred={onOpenClient}
              onMessageAdvocate={onMessageClient}
            />
          </Card>
        </>
      )}

      <button
        type="button"
        onClick={() => setLookupOpen((open) => !open)}
        style={{
          background: "none",
          border: "none",
          color: T.accent,
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          padding: "8px 0 12px",
          fontFamily: F,
        }}
      >
        {lookupOpen ? "Hide look up / add credit" : "Look up a mama or add a credit"}
      </button>

      {lookupOpen && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Find mama</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              style={{ ...inputStyle, width: "100%" }}
            />
            {matches.length > 0 && (
              <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => loadUser(c.id, c.email)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: `1px solid ${T.border}`,
                      background: selectedId === c.id ? T.accentSoft : "#fff",
                      cursor: "pointer",
                      fontFamily: F,
                      fontSize: 13.5,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{c.name || "—"}</div>
                    <div style={{ color: T.inkSoft }}>{c.email}</div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                type="button"
                disabled={busy || !query.trim()}
                onClick={() => loadUser("", query.trim())}
              >
                {busy ? "Loading…" : "Load by email"}
              </Btn>
            </div>
          </Card>

          {err && (
            <Card style={{ marginBottom: 14, background: T.accentSoft, border: "none" }}>
              <div style={{ fontSize: 14, color: T.accentDeep }}>{err}</div>
            </Card>
          )}
          {okMsg && (
            <Card style={{ marginBottom: 14, background: T.sageSoft, border: "none" }}>
              <div style={{ fontSize: 14, color: T.sage }}>{okMsg}</div>
            </Card>
          )}

          {payload?.profile && (
            <>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: FD, fontSize: 20 }}>{payload.profile.name || "Mama"}</div>
                <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 2 }}>{payload.profile.email}</div>
                <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Ready</div>
                    <div style={{ fontFamily: FD, fontSize: 24 }}>{moneyCents(payload.availableCents)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Waiting</div>
                    <div style={{ fontFamily: FD, fontSize: 24 }}>{moneyCents(payload.pendingCents)}</div>
                  </div>
                </div>
              </Card>

              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Add a credit</div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Amount (USD)</label>
                <input
                  value={grantDollars}
                  onChange={(e) => setGrantDollars(e.target.value)}
                  style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
                />
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Note (required)</label>
                <input
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  placeholder="Why you're adding this"
                  style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 12 }}>
                  <input type="checkbox" checked={vestNow} onChange={(e) => setVestNow(e.target.checked)} />
                  Available immediately (skip the wait)
                </label>
                <Btn type="button" disabled={busy || !grantNote.trim()} onClick={grant}>
                  Add credit
                </Btn>
              </Card>

              <Card style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Ledger</div>
                {(payload.rows || []).length === 0 ? (
                  <div style={{ fontSize: 14, color: T.inkSoft }}>No rows yet.</div>
                ) : (
                  payload.rows.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        padding: "12px 0",
                        borderTop: `1px solid ${T.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {moneyCents(row.amount_cents)} · {row.reason} · {row.status}
                        </div>
                        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                          {when(row.created_at)}
                          {row.vests_at ? ` · ready ${when(row.vests_at)}` : ""}
                        </div>
                        {row.note && (
                          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{row.note}</div>
                        )}
                      </div>
                      {(row.status === "pending" || row.status === "available") && row.amount_cents > 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reverseRow(row.id)}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: T.accentDeep,
                            background: "transparent",
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            padding: "6px 10px",
                            cursor: "pointer",
                            fontFamily: F,
                            flexShrink: 0,
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  ))
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
