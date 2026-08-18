/**
 * Admin Credits tab — board of pending / ready credits + referrals.
 * Search is a fallback; opening a mama still uses the per-user card.
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { supabase } from "../lib/supabase";
import {
  formatLedgerStatus,
  formatMoneyCents,
  grantSuccessCopy,
} from "../../functions/_shared/creditsBoard.js";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function creditLine(row) {
  const amount = formatMoneyCents(row.amount_cents);
  const why = row.reason === "referral"
    ? "Referral"
    : row.reason === "manual"
      ? "Manual"
      : row.reason === "milestone"
        ? "Milestone"
        : row.reason === "redemption"
          ? "Used"
          : row.reason === "reversal"
            ? "Taken back"
            : "Credit";
  return `${amount} · ${why} · ${formatLedgerStatus(row)}`;
}

const rowBtn = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "14px 0",
  border: "none",
  borderTop: `1px solid ${T.border}`,
  background: "transparent",
  cursor: "pointer",
  fontFamily: F,
  color: T.ink,
};

function EmptyLine({ children }) {
  return <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.45 }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>{children}</div>;
}

export function AdminCredits({ roster = [] }) {
  const [board, setBoard] = useState(null);
  const [boardBusy, setBoardBusy] = useState(true);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [grantDollars, setGrantDollars] = useState("25");
  const [grantNote, setGrantNote] = useState("");
  const [vestNow, setVestNow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");

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

  const loadBoard = async () => {
    setBoardBusy(true);
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/admin-credits?view=board", { headers });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Couldn't load credits.");
      setBoard(data);
    } catch (e) {
      setErr(e?.message || "Couldn't load credits.");
    } finally {
      setBoardBusy(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

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
      if (!resp.ok) throw new Error(data.error || "Couldn't load her credits.");
      setPayload(data);
      setSelectedId(data.profile?.id || userId || "");
    } catch (e) {
      setPayload(null);
      setErr(e?.message || "Load failed.");
    } finally {
      setBusy(false);
    }
  };

  const closeCard = () => {
    setPayload(null);
    setSelectedId("");
    setGrantNote("");
    setShowAdvanced(false);
    setVestNow(false);
    setOkMsg("");
  };

  const backfillCodes = async () => {
    setBackfillBusy(true);
    setBackfillMsg("");
    setErr("");
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/admin-referrals", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "backfill" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Couldn't give out share codes.");
      const created = data.created || 0;
      const existed = data.existed || 0;
      setBackfillMsg(
        created
          ? `Gave ${created} mama${created === 1 ? "" : "s"} a share code.`
          : existed
            ? "Everyone already has a share code."
            : "No paid mamas needed a share code.",
      );
      await loadBoard();
    } catch (e) {
      setErr(e?.message || "Couldn't give out share codes.");
    } finally {
      setBackfillBusy(false);
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
      setOkMsg(grantSuccessCopy(data.row));
      setGrantNote("");
      await Promise.all([loadUser(payload.profile.id), loadBoard()]);
    } catch (e) {
      setErr(e?.message || "Grant failed.");
      setBusy(false);
    }
  };

  const reverseRow = async (ledgerId) => {
    const reason = window.prompt("Why are you taking this back?", "");
    if (reason == null) return;
    if (!String(reason).trim()) {
      setErr("A reason is required to take a credit back.");
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
      if (!resp.ok) throw new Error(data.error || "Couldn't take that back.");
      setOkMsg("Credit taken back.");
      await Promise.all([loadUser(payload.profile.id), loadBoard()]);
    } catch (e) {
      setErr(e?.message || "Couldn't take that back.");
      setBusy(false);
    }
  };

  const pending = board?.pending || [];
  const available = board?.available || [];
  const referrals = board?.referrals || [];
  const share = board?.shareCodes || { paidWithCode: 0, paidWithoutCode: 0 };
  const paidTotal = share.paidWithCode + share.paidWithoutCode;

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
        Credits apply to membership or Lab Review. Referral $25 lands after 3 days.
      </p>

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

      {payload?.profile ? (
        <MamaCreditCard
          payload={payload}
          busy={busy}
          grantDollars={grantDollars}
          setGrantDollars={setGrantDollars}
          grantNote={grantNote}
          setGrantNote={setGrantNote}
          vestNow={vestNow}
          setVestNow={setVestNow}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          onBack={closeCard}
          onGrant={grant}
          onTakeBack={reverseRow}
        />
      ) : (
        <>
          <Card style={{ marginBottom: 14, background: T.amberSoft, border: "none" }}>
            <SectionTitle>Needs attention</SectionTitle>
            {boardBusy && !board ? (
              <EmptyLine>Loading…</EmptyLine>
            ) : pending.length === 0 ? (
              <EmptyLine>No credits waiting.</EmptyLine>
            ) : (
              pending.map((row, i) => (
                <button
                  key={row.ledgerId}
                  type="button"
                  onClick={() => loadUser(row.userId)}
                  style={{ ...rowBtn, borderTop: i === 0 ? "none" : rowBtn.borderTop }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {row.firstName} · {row.amountLabel}
                  </div>
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                    {row.why}
                    {row.landsOn ? ` · lands ${row.landsOn}` : ""}
                    {row.fromName ? ` · from ${row.fromName}` : ""}
                  </div>
                </button>
              ))
            )}
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <SectionTitle>Ready to use</SectionTitle>
            {boardBusy && !board ? (
              <EmptyLine>Loading…</EmptyLine>
            ) : available.length === 0 ? (
              <EmptyLine>No credits ready to use.</EmptyLine>
            ) : (
              available.map((row, i) => (
                <button
                  key={row.ledgerId}
                  type="button"
                  onClick={() => loadUser(row.userId)}
                  style={{ ...rowBtn, borderTop: i === 0 ? "none" : rowBtn.borderTop }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {row.firstName} · {row.amountLabel} available
                  </div>
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                    {row.why}
                    {row.fromName ? ` · from ${row.fromName}` : ""}
                  </div>
                </button>
              ))
            )}
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <SectionTitle>Recent referrals</SectionTitle>
            {boardBusy && !board ? (
              <EmptyLine>Loading…</EmptyLine>
            ) : referrals.length === 0 ? (
              <EmptyLine>No referrals yet.</EmptyLine>
            ) : (
              referrals.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    padding: "14px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {row.refereeUserId ? (
                      <button
                        type="button"
                        onClick={() => loadUser(row.refereeUserId)}
                        style={nameLink}
                      >
                        {row.refereeName}
                      </button>
                    ) : row.refereeName}
                    {" used "}
                    {row.code || "a code"}
                    {" · "}
                    {row.advocateUserId ? (
                      <button
                        type="button"
                        onClick={() => loadUser(row.advocateUserId)}
                        style={nameLink}
                      >
                        {row.advocateName}
                      </button>
                    ) : row.advocateName}
                  </div>
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                    {row.status === "paid"
                      ? (row.amountPaidLabel ? `${row.amountPaidLabel} credit` : "Paid")
                      : "Waiting on payment"}
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
              {paidTotal === 0
                ? "Share codes show up once paid mamas are in the roster."
                : share.paidWithoutCode === 0
                  ? `All ${share.paidWithCode} paid mamas have a share code.`
                  : `${share.paidWithCode} of ${paidTotal} paid mamas have a share code.`}
            </div>
            <button
              type="button"
              disabled={backfillBusy || busy}
              onClick={backfillCodes}
              style={{
                marginTop: 10,
                fontFamily: F,
                fontSize: 13,
                fontWeight: 700,
                color: T.inkSoft,
                background: "transparent",
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                padding: "8px 14px",
                cursor: backfillBusy ? "default" : "pointer",
              }}
            >
              {backfillBusy ? "Giving out codes…" : "Give everyone a share code"}
            </button>
            {backfillMsg && (
              <div style={{ marginTop: 10, fontSize: 13.5, color: T.sage, lineHeight: 1.45 }}>{backfillMsg}</div>
            )}
          </Card>

          <Card style={{ marginBottom: 28 }}>
            <SectionTitle>Find a mama</SectionTitle>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 10px" }}>
              Search if she isn’t on the lists above.
            </p>
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
                      padding: "12px",
                      border: "none",
                      borderBottom: `1px solid ${T.border}`,
                      background: selectedId === c.id ? T.accentSoft : "#fff",
                      cursor: "pointer",
                      fontFamily: F,
                      fontSize: 13.5,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{c.name || "Mama"}</div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <Btn
                type="button"
                small
                ghost
                disabled={busy || !query.trim()}
                onClick={() => loadUser("", query.trim())}
              >
                {busy ? "Loading…" : "Find by email"}
              </Btn>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const nameLink = {
  fontFamily: F,
  fontWeight: 700,
  fontSize: 15,
  color: T.accentDeep,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

function MamaCreditCard({
  payload,
  busy,
  grantDollars,
  setGrantDollars,
  grantNote,
  setGrantNote,
  vestNow,
  setVestNow,
  showAdvanced,
  setShowAdvanced,
  onBack,
  onGrant,
  onTakeBack,
}) {
  const name = payload.profile.name || "Mama";
  const first = String(name).trim().split(/\s+/)[0] || "Mama";

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontFamily: F,
          fontSize: 13.5,
          fontWeight: 700,
          color: T.accentDeep,
          background: "none",
          border: "none",
          padding: "0 0 12px",
          cursor: "pointer",
        }}
      >
        ← Credits board
      </button>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: FD, fontSize: 20 }}>{name}</div>
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 24 }}>{formatMoneyCents(payload.availableCents)}</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>available</div>
          </div>
          <div>
            <div style={{ fontFamily: FD, fontSize: 24 }}>{formatMoneyCents(payload.pendingCents)}</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>waiting</div>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionTitle>Give {first} a credit</SectionTitle>
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
          placeholder="Makeup credit, Callie said yes"
          style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
        />
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            fontFamily: F,
            fontSize: 12,
            fontWeight: 700,
            color: T.inkSoft,
            background: "none",
            border: "none",
            padding: "0 0 10px",
            cursor: "pointer",
          }}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {showAdvanced && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 12 }}>
            <input type="checkbox" checked={vestNow} onChange={(e) => setVestNow(e.target.checked)} />
            Add it now instead of waiting 3 days
          </label>
        )}
        <Btn type="button" disabled={busy || !grantNote.trim()} onClick={onGrant}>
          Grant credit
        </Btn>
      </Card>

      <Card style={{ marginBottom: 28 }}>
        <SectionTitle>Her credits</SectionTitle>
        {(payload.rows || []).length === 0 ? (
          <EmptyLine>No credits yet.</EmptyLine>
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
                <div style={{ fontWeight: 700, fontSize: 14 }}>{creditLine(row)}</div>
                {row.note && (
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{row.note}</div>
                )}
              </div>
              {(row.status === "pending" || row.status === "available") && row.amount_cents > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTakeBack(row.id)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: T.accentDeep,
                    background: "transparent",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontFamily: F,
                    flexShrink: 0,
                  }}
                >
                  Take back
                </button>
              )}
            </div>
          ))
        )}
      </Card>
    </>
  );
}
