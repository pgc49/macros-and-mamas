import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { rateOf } from "../utils/dates";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { Shell, Card, Btn, inputStyle } from "../components/ui";
import { supabase } from "../lib/supabase";
import { EMAIL_CATALOG, EMAIL_TYPE_LABELS } from "../content/emailCatalog";

const STAGE_LABEL = {
  signed_up: "Signed up — unpaid",
  paid_awaiting_intake: "Paid — needs intake",
  awaiting_approval: "Waiting on your approval",
  active: "Active",
  refunded: "Refunded",
};

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatPill({ label, value, bg, color }) {
  return (
    <div style={{ flex: "1 1 30%", minWidth: 100, background: bg, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontFamily: FD, fontSize: 24, color }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    ["overview", "Overview"],
    ["clients", "Clients"],
    ["emails", "Email templates"],
  ];
  return (
    <div style={{ display: "flex", gap: 6, margin: "10px 0 18px", flexWrap: "wrap" }}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1.5px solid ${tab === id ? T.accent : T.border}`,
            background: tab === id ? T.accentSoft : "#fff",
            color: tab === id ? T.accentDeep : T.inkSoft,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmailTimeline({ profileId }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError("");
    (async () => {
      try {
        const rows = await db.loadEmailEvents(profileId);
        if (!cancelled) setEvents(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setEvents([]);
          setError("Couldn't load email history. If this is new, run migration 006 in Supabase.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  if (events === null) {
    return <div style={{ fontSize: 13.5, color: T.inkSoft }}>Loading emails…</div>;
  }
  if (error) {
    return <div style={{ fontSize: 13.5, color: T.amber }}>{error}</div>;
  }
  if (!events.length) {
    return (
      <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
        No emails logged for this mama yet. New sends (welcome, intake, approve, refund) appear here after migration 006 is applied.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((e) => (
        <div
          key={e.id}
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "10px 12px",
            background: e.status === "failed" ? T.amberSoft : "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
              {EMAIL_TYPE_LABELS[e.email_type] || e.email_type}
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, whiteSpace: "nowrap" }}>{formatWhen(e.created_at)}</div>
          </div>
          {e.subject && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{e.subject}</div>
          )}
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4 }}>
            {e.to_email && e.to_email !== "callie" ? `To ${e.to_email} · ` : e.to_email === "callie" ? "To Callie · " : ""}
            {e.status === "failed" ? "Failed" : "Sent"}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminPortal({ roster, setRoster, stats, adminSel, setAdminSel }) {
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("needs_you");
  const [recentEmails, setRecentEmails] = useState([]);
  const debounceRef = useRef({});

  const all = roster || [];
  const nonAdmin = useMemo(() => all.filter((c) => c.role !== "admin"), [all]);

  const computedStats = useMemo(() => {
    if (stats) return stats;
    return {
      signups: nonAdmin.length,
      paid: nonAdmin.filter((c) => c.paid && !c.refunded).length,
      unpaid: nonAdmin.filter((c) => !c.paid && !c.refunded).length,
      awaitingIntake: nonAdmin.filter((c) => c.stage === "paid_awaiting_intake").length,
      awaitingApproval: nonAdmin.filter((c) => c.stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid)).length,
      active: nonAdmin.filter((c) => c.stage === "active" || c.status === "active").length,
      refunded: nonAdmin.filter((c) => c.stage === "refunded" || c.refunded).length,
    };
  }, [stats, nonAdmin]);

  useEffect(() => {
    if (tab !== "overview") return;
    let cancelled = false;
    db.loadRecentEmailEvents(12).then((rows) => {
      if (!cancelled) setRecentEmails(rows);
    });
    return () => { cancelled = true; };
  }, [tab]);

  const needsAttention = (c) => {
    const r = rateOf(c.weighins);
    const flags = [];
    if (r !== null && r > 1.5) flags.push("losing too fast");
    if (c.status === "active" && c.adherence < 60) flags.push("low adherence");
    return flags;
  };

  const filtered = useMemo(() => {
    const list = nonAdmin;
    if (filter === "all") return list;
    if (filter === "needs_you") {
      return list.filter((c) =>
        c.stage === "awaiting_approval"
        || (c.status === "pending" && c.hasIntake && c.paid && !c.refunded)
        || needsAttention(c).length > 0
      );
    }
    if (filter === "unpaid") return list.filter((c) => c.stage === "signed_up");
    if (filter === "awaiting_intake") return list.filter((c) => c.stage === "paid_awaiting_intake");
    if (filter === "awaiting_approval") {
      return list.filter((c) => c.stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid));
    }
    if (filter === "active") return list.filter((c) => c.stage === "active" || c.status === "active");
    if (filter === "refunded") return list.filter((c) => c.refunded || c.stage === "refunded");
    return list;
  }, [nonAdmin, filter]);

  const patchMacros = (c, k, v) => {
    if (!c.macros) return;
    const next = { ...c.macros, [k]: Number(v) || 0 };
    setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, macros: next } : x)));
    clearTimeout(debounceRef.current[c.id]);
    debounceRef.current[c.id] = setTimeout(() => {
      db.updateClientMacros(c.id, next).catch((e) => console.error("updateClientMacros failed", e));
    }, 400);
  };

  const approveClient = async (c) => {
    setRoster((rs) => rs.map((x) => (x.id === c.id ? {
      ...x, status: "active", week: 1, stage: "active",
      macros: x.macros ? { ...x.macros, approved: true } : x.macros,
    } : x)));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const resp = await fetch("/api/macros-approved", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ clientId: c.id }),
        });
        if (!resp.ok) throw new Error(`macros-approved ${resp.status}`);
      } else {
        await db.approveClient(c.id);
      }
    } catch (e) {
      console.error("approveClient failed", e);
      try {
        await db.approveClient(c.id);
      } catch (e2) {
        console.error("approveClient fallback failed", e2);
      }
    }
  };

  const sel = all.find((c) => c.id === adminSel);

  /* ---- client detail ---- */
  if (sel) {
    const r = rateOf(sel.weighins || []);
    const flags = needsAttention(sel);
    const stage = sel.stage || (sel.status === "active" ? "active" : "awaiting_approval");
    return (
      <Shell>
        <button
          type="button"
          onClick={() => setAdminSel(null)}
          style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "4px 0 10px" }}
        >
          ← All clients
        </button>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: FD, fontSize: 22 }}>{sel.name}</div>
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
                {STAGE_LABEL[stage] || stage}
                {sel.paid ? " · Paid" : " · Unpaid"}
                {sel.refunded ? " · Refunded" : ""}
                {sel.email ? <><br />✉️ {sel.email}</> : null}
                {sel.age ? <><br />{sel.age} yrs</> : null}
                {sel.currentWeight != null && sel.goalWeight != null ? <> · {sel.currentWeight} → {sel.goalWeight} lbs</> : null}
                {sel.breastfeeding ? ` · breastfeeding${sel.monthsPP != null && sel.monthsPP !== "" ? ` · ${sel.monthsPP} mo pp` : ""}` : ""}
                {sel.phone ? <><br />📱 {sel.phone}{stage === "awaiting_approval" ? " — send WhatsApp invite on approval" : ""}</> : null}
                {(sel.prefB || sel.prefL || sel.prefD) ? <><br />🍽 Loves: {[sel.prefB, sel.prefL, sel.prefD].filter(Boolean).join(" · ")}</> : null}
                {sel.seasonNote ? <><br />💬 {sel.seasonNote}</> : null}
              </div>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap",
              background: stage === "active" ? T.sageSoft : T.amberSoft,
              color: stage === "active" ? T.sage : T.amber,
            }}>
              {stage === "active" ? `Week ${sel.week}` : "Pending"}
            </span>
          </div>

          {!sel.macros && (
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
              {sel.paid
                ? "Paid — waiting on her to finish intake. No macros to review yet."
                : "Signed up but hasn't paid yet."}
            </div>
          )}

          {sel.macros && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "6px 0 8px" }}>Ranges — edit any number</div>
              {["cal", "protein", "fat", "carbs"].map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 74, fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "capitalize" }}>{k === "cal" ? "Calories" : k}</div>
                  <input
                    style={{ ...inputStyle, width: 110, padding: "8px 10px" }}
                    inputMode="numeric"
                    value={sel.macros[k]}
                    onChange={(e) => patchMacros(sel, k, e.target.value)}
                  />
                  <span style={{ fontSize: 13, color: T.inkSoft }}>→ {sel.macros[k]}–{sel.macros[k] + (k === "cal" ? 150 : 10)}{k === "cal" ? "" : "g"}</span>
                </div>
              ))}
              {sel.macros.notes?.length > 0 && (
                <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", margin: "10px 0" }}>
                  {sel.macros.notes.map((n, i) => <div key={i} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>• {n}</div>)}
                </div>
              )}
              {sel.status === "pending" || stage === "awaiting_approval"
                ? <Btn style={{ width: "100%", marginTop: 6 }} onClick={() => approveClient(sel)}>Approve + release to {(sel.name || "her").split(" ")[0]}</Btn>
                : <div style={{ fontSize: 13, color: T.sage, fontWeight: 700, marginTop: 4 }}>✓ Live. Edits reach her dashboard instantly.</div>}
            </>
          )}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Emails sent</div>
          <EmailTimeline profileId={sel.id} />
        </Card>

        {sel.status === "active" && sel.macros && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Progress</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 8 }}>
              Checklist this week: <b style={{ color: sel.adherence < 60 ? T.amber : T.ink }}>{sel.adherence}%</b>
              {r !== null && <> · trending <b style={{ color: r > 1.5 ? T.amber : T.sage }}>{Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</b></>}
            </div>
            {flags.length > 0 && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
                {flags.map((f) => (
                  <div key={f} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>
                    ⚠ {f === "losing too fast" ? "Losing faster than 1.5 lb/wk — voice-note her to eat the top of her ranges." : "Adherence under 60% — a personal check-in usually turns this around."}
                  </div>
                ))}
              </div>
            )}
            {(sel.weighins || []).length > 1 && (
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sel.weighins.map((x) => ({ ...x, label: x.date.slice(5) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={T.track} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontFamily: F, fontSize: 13, borderRadius: 10, border: `1px solid ${T.border}` }} />
                    {sel.goalWeight && <ReferenceLine y={Number(sel.goalWeight)} stroke={T.sage} strokeDasharray="5 4" label={{ value: "goal", fontSize: 11, fill: T.sage, position: "right" }} />}
                    <Line type="monotone" dataKey="w" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        )}
      </Shell>
    );
  }

  const Row = ({ c }) => {
    const flags = needsAttention(c);
    const stage = c.stage || "signed_up";
    return (
      <button
        type="button"
        onClick={() => setAdminSel(c.id)}
        style={{
          display: "block", width: "100%", textAlign: "left", background: T.card,
          border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 16px", marginBottom: 8, cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontFamily: FD, fontSize: 16, color: T.ink }}>{c.name}</span>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
              {STAGE_LABEL[stage] || stage}
              {c.email ? ` · ${c.email}` : ""}
              {c.hasIntake && c.currentWeight != null ? ` · ${c.currentWeight} → ${c.goalWeight} lbs` : ""}
              {stage === "active" ? ` · Week ${c.week} · ${c.adherence}%` : ""}
            </div>
            {flags.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginTop: 3 }}>⚠ {flags.join(" · ")}</div>
            )}
          </div>
          <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
        </div>
      </button>
    );
  };

  return (
    <Shell>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 4px" }}>Callie admin</h2>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 4px", lineHeight: 1.45 }}>
        Bird&apos;s-eye view for the founding group.{" "}
        <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700 }}>Your dashboard</Link>
        {" · "}
        Admin only.
      </p>

      <TabBar tab={tab} setTab={setTab} />

      {tab === "overview" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <StatPill label="Signups" value={computedStats.signups} bg={T.accentSoft} color={T.accentDeep} />
            <StatPill label="Paid" value={computedStats.paid} bg={T.sageSoft} color={T.sage} />
            <StatPill label="Unpaid" value={computedStats.unpaid} bg={T.track} color={T.inkSoft} />
            <StatPill label="Need intake" value={computedStats.awaitingIntake} bg={T.amberSoft} color={T.amber} />
            <StatPill label="Need approval" value={computedStats.awaitingApproval} bg={T.amberSoft} color={T.amber} />
            <StatPill label="Active" value={computedStats.active} bg={T.sageSoft} color={T.sage} />
            <StatPill label="Refunded" value={computedStats.refunded} bg={T.track} color={T.inkSoft} />
          </div>

          <Card>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>What needs you</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: T.inkSoft }}>
              {computedStats.awaitingApproval > 0
                ? <p style={{ margin: "0 0 8px" }}><b style={{ color: T.ink }}>{computedStats.awaitingApproval}</b> mama{computedStats.awaitingApproval === 1 ? "" : "s"} waiting on macro approval.</p>
                : <p style={{ margin: "0 0 8px" }}>No intakes waiting on approval.</p>}
              {computedStats.awaitingIntake > 0 && (
                <p style={{ margin: "0 0 8px" }}><b style={{ color: T.ink }}>{computedStats.awaitingIntake}</b> paid but haven&apos;t finished intake yet.</p>
              )}
              {computedStats.unpaid > 0 && (
                <p style={{ margin: 0 }}><b style={{ color: T.ink }}>{computedStats.unpaid}</b> signed up and haven&apos;t paid.</p>
              )}
            </div>
            <Btn
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => { setFilter("needs_you"); setTab("clients"); }}
            >
              Open clients
            </Btn>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Recent emails</div>
            {!recentEmails.length ? (
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
                No sends logged yet. After you run migration <code>006_email_events.sql</code>, new welcomes / intake / approve / refund emails show up here.
              </div>
            ) : (
              recentEmails.map((e) => (
                <div key={e.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{EMAIL_TYPE_LABELS[e.email_type] || e.email_type}</div>
                  <div style={{ fontSize: 12, color: T.inkSoft }}>{e.subject || "—"} · {formatWhen(e.created_at)}</div>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      {tab === "clients" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ["needs_you", "Needs you"],
              ["awaiting_approval", "Approve"],
              ["awaiting_intake", "Need intake"],
              ["unpaid", "Unpaid"],
              ["active", "Active"],
              ["refunded", "Refunded"],
              ["all", "All"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: `1.5px solid ${filter === id ? T.accent : T.border}`,
                  background: filter === id ? T.accentSoft : "#fff",
                  color: filter === id ? T.accentDeep : T.inkSoft,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: "pointer",
                  fontFamily: F,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {filtered.length
            ? filtered.map((c) => <Row key={c.id} c={c} />)
            : <div style={{ fontSize: 13.5, color: T.inkSoft }}>Nobody in this filter right now.</div>}
        </>
      )}

      {tab === "emails" && (
        <>
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
            Read-only view of Callie&apos;s lifecycle emails (first person, from her). #1 and #3 run on an hourly cron once CRON_SECRET is set. For early cohort, send copy feedback to Patrick.
          </p>
          {EMAIL_CATALOG.map((em) => (
            <Card key={em.id} style={{ marginBottom: 12, opacity: em.status === "scheduled" ? 0.85 : 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
                {typeof em.number === "number" ? `Email #${em.number}` : `Notify ${em.number}`} · {em.audience}
                {em.status === "scheduled" ? " · Not live yet" : " · Live"}
              </div>
              <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>{em.name}</div>
              <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 8 }}>
                <b>When:</b> {em.trigger}
              </div>
              <div style={{ fontSize: 13.5, marginBottom: 8 }}>
                <b>Subject:</b> {em.subject}
              </div>
              {em.cta && (
                <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 8 }}>
                  <b>Button:</b> {em.cta}
                </div>
              )}
              <pre style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: F,
                fontSize: 13,
                lineHeight: 1.55,
                color: T.ink,
                background: T.bg,
                borderRadius: 12,
                padding: "12px 14px",
              }}
              >
                {em.bodyPreview}
              </pre>
            </Card>
          ))}
        </>
      )}
    </Shell>
  );
}
