/**
 * Admin Credits tab — search a mama, view ledger, grant/reverse (stage 1 harness).
 */
import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { supabase } from "../lib/supabase";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function moneyCents(cents) {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n / 100);
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

export function AdminCredits({ roster = [] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [grantDollars, setGrantDollars] = useState("25");
  const [grantNote, setGrantNote] = useState("");
  const [vestNow, setVestNow] = useState(true);

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
      setOkMsg(`Granted ${moneyCents(data.row?.amount_cents)}. Run credits-cron (or wait for the hour) to vest/mirror.`);
      setGrantNote("");
      await loadUser(payload.profile.id);
    } catch (e) {
      setErr(e?.message || "Grant failed.");
      setBusy(false);
    }
  };

  const reverseRow = async (ledgerId) => {
    const reason = window.prompt("Reverse reason (required note):", "");
    if (reason == null) return;
    if (!String(reason).trim()) {
      setErr("Reverse note is required.");
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
    } catch (e) {
      setErr(e?.message || "Reverse failed.");
      setBusy(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
        Stage 1 harness: grant/reverse credits. Vesting + Stripe Customer Balance mirror run on the hourly{" "}
        <code style={{ fontSize: 12 }}>credits-cron</code>. Never hand-edit customer balances in the Stripe Dashboard.
      </p>

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
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Available</div>
                <div style={{ fontFamily: FD, fontSize: 24 }}>{moneyCents(payload.availableCents)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Pending</div>
                <div style={{ fontFamily: FD, fontSize: 24 }}>{moneyCents(payload.pendingCents)}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
              Stripe customer: {payload.profile.stripeCustomerId || "none (mirror will wait)"}
              {" · "}
              Vesting days default: {payload.vestingDays}
            </div>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Grant manual credit</div>
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
              placeholder="e.g. Stage 1 test grant"
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 12 }}>
              <input type="checkbox" checked={vestNow} onChange={(e) => setVestNow(e.target.checked)} />
              Vest immediately (vests_at = now) — for acceptance tests
            </label>
            <Btn type="button" disabled={busy || !grantNote.trim()} onClick={grant}>
              Grant credit
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
                      {row.vests_at ? ` · vests ${when(row.vests_at)}` : ""}
                      {row.mirrored_at ? " · mirrored" : row.status === "available" ? " · not mirrored" : ""}
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
    </div>
  );
}
