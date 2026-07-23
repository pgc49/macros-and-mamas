/**
 * Coach / admin portal (Callie).
 *
 * SEGREGATION RULES — do not break these:
 * 1. Lazy-loaded from App.jsx — never eagerly imported into the customer bundle.
 * 2. Do not edit client Today cards (MealLogCard, WaterLogCard, WeighInCard) for
 *    admin needs. Build admin-only UI under src/admin/ instead.
 * 3. Wrap new admin surfaces in ErrorBoundary so a coach-UI bug cannot blank
 *    the customer SPA.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { addDaysIso, localDateIso, rateOf } from "../utils/dates";
import { buildHabitHistory, buildMacroHistory, buildTrends, buildWaterHistory } from "../utils/progressSeries";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { Shell, Card, Btn, inputStyle } from "../components/ui";
import { ProgressCharts } from "../components/ProgressCharts";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { MealPlanDraft } from "./MealPlanDraft";
import { AdminClientTracking } from "./AdminClientTracking";
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

function byName(a, b) {
  return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), undefined, {
    sensitivity: "base",
  });
}

/** One-tap copy for WhatsApp invites — stops row navigation when used in the roster. */
function CopyPhoneButton({ phone, compact = false }) {
  const [copied, setCopied] = useState(false);
  if (!phone) {
    return <span style={{ fontSize: 12.5, color: T.inkSoft }}>—</span>;
  }
  const onCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(String(phone).trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy phone for WhatsApp"
      aria-label={copied ? "Phone copied" : `Copy phone ${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 4 : 6,
        maxWidth: "100%",
        padding: compact ? "4px 8px" : "6px 10px",
        borderRadius: 8,
        border: `1px solid ${copied ? T.sage : T.border}`,
        background: copied ? T.sageSoft : "#fff",
        color: copied ? T.sage : T.ink,
        fontFamily: F,
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1.2,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {copied ? "Copied" : phone}
      </span>
      {!copied && (
        <span style={{ flexShrink: 0, fontSize: compact ? 11 : 12, color: T.inkSoft, fontWeight: 600 }}>
          copy
        </span>
      )}
    </button>
  );
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
  const [filter, setFilter] = useState("active");
  const [recentEmails, setRecentEmails] = useState([]);
  const [clientProgress, setClientProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState(null);
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

  useEffect(() => {
    if (!adminSel) {
      setClientProgress(null);
      setProgressError(null);
      setProgressLoading(false);
      return;
    }
    let cancelled = false;
    setProgressLoading(true);
    setProgressError(null);
    setClientProgress(null);
    db.loadClientProgress(adminSel)
      .then((payload) => {
        if (cancelled) return;
        const client = (roster || []).find((c) => c.id === adminSel);
        const waterGoal = client?.goalWeight != null ? Math.round(Number(client.goalWeight) / 2) : 0;
        setClientProgress({
          macroHistory: buildMacroHistory(payload.mealHistoryByDate),
          habitHistory: buildHabitHistory(payload.checksByWeek),
          waterHistory: buildWaterHistory(payload.waterLogsByDate || {}, waterGoal),
          waterGoalOz: waterGoal,
          trends: buildTrends(payload.checksByWeek),
        });
      })
      .catch((e) => {
        console.error("loadClientProgress failed", e);
        if (!cancelled) setProgressError("Couldn’t load progress charts.");
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });
    return () => { cancelled = true; };
  }, [adminSel, roster]);

  const needsAttention = (c) => {
    const r = rateOf(c.weighins);
    const flags = [];
    if (c.pregnant) flags.push("pregnant — review 1:1 before approving");
    if (c.breastfeeding) {
      const mo = c.monthsPP != null && c.monthsPP !== "" ? Number(c.monthsPP) : null;
      if (mo != null && !Number.isNaN(mo) && mo < 3) {
        flags.push("early postpartum / nursing (<3 mo) — review 1:1");
      } else if (mo != null && !Number.isNaN(mo)) {
        flags.push(`postpartum / nursing (${mo} mo) — review 1:1`);
      } else {
        flags.push("postpartum / nursing — review 1:1");
      }
    }
    if (c.diet && c.diet !== "none") flags.push(`diet: ${c.diet} — connect before approving`);
    if (r !== null && r > 1.5) flags.push("losing too fast");
    // Quiet week-1 noise: don't flag checklist %. Flag silence — no meal in ~48h.
    const active = c.status === "active" || c.stage === "active";
    if (active) {
      const today = localDateIso();
      const okIfOnOrAfter = addDaysIso(today, -1); // yesterday or today = fine
      if (!c.lastMealDate || c.lastMealDate < okIfOnOrAfter) {
        flags.push("no meal log in 48h — check in");
      }
    }
    return flags;
  };

  /** Roster table: action flags only. Postpartum/nursing lives on client detail. */
  const rosterFlags = (c) => needsAttention(c).filter((f) => !/postpartum|nursing/i.test(f));

  const filtered = useMemo(() => {
    // Funnel filters for real clients. Admins pin to the top of All / Active
    // so Patrick & Callie can test meal plans on themselves.
    const admins = all.filter((c) => c.role === "admin").slice().sort(byName);
    const clientsOnly = all.filter((c) => c.role !== "admin");
    let list = clientsOnly;
    if (filter === "unpaid") {
      list = clientsOnly.filter((c) => c.stage === "signed_up");
    } else if (filter === "awaiting_intake") {
      list = clientsOnly.filter((c) => c.stage === "paid_awaiting_intake");
    } else if (filter === "awaiting_approval") {
      list = clientsOnly.filter((c) => c.stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid));
    } else if (filter === "active") {
      list = clientsOnly.filter((c) => c.stage === "active" || c.status === "active");
    } else if (filter === "refunded") {
      list = clientsOnly.filter((c) => c.refunded || c.stage === "refunded");
    } else {
      list = clientsOnly; // all
    }
    list = list.slice().sort(byName);
    if (filter === "all" || filter === "active") {
      return [...admins, ...list];
    }
    return list;
  }, [all, filter]);

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
              <div style={{ fontFamily: FD, fontSize: 22 }}>
                {sel.name}
                {sel.role === "admin" && (
                  <span style={{
                    marginLeft: 10, fontSize: 12, fontWeight: 700, fontFamily: F,
                    padding: "3px 10px", borderRadius: 99, background: T.accentSoft, color: T.accentDeep,
                    verticalAlign: "middle",
                  }}>
                    Admin · test
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
                {STAGE_LABEL[stage] || stage}
                {sel.paid ? " · Paid" : " · Unpaid"}
                {sel.refunded ? " · Refunded" : ""}
                {sel.email ? <><br />✉️ {sel.email}</> : null}
                {sel.age ? <><br />{sel.age} yrs</> : null}
                {sel.currentWeight != null && sel.goalWeight != null ? <> · {sel.currentWeight} → {sel.goalWeight} lbs</> : null}
                {sel.pregnant ? <><br />⚠️ Pregnant — review 1:1 before approving or refunding</> : null}
                {sel.breastfeeding ? (
                  <>
                    <br />
                    ⚠️ Postpartum / nursing
                    {sel.monthsPP != null && sel.monthsPP !== "" ? ` · ${sel.monthsPP} mo pp` : ""}
                    {" — review 1:1"}
                  </>
                ) : null}
                {sel.diet && sel.diet !== "none" ? <><br />⚠️ Diet: {sel.diet} — connect before approving</> : null}
                {sel.phone ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 13, color: T.inkSoft }}>📱 Phone</span>
                    <CopyPhoneButton phone={sel.phone} />
                    {stage === "awaiting_approval" && (
                      <span style={{ fontSize: 12, color: T.inkSoft }}>WhatsApp invite is also in her approve email</span>
                    )}
                  </div>
                ) : null}
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

        {sel.macros && (
          <MealPlanDraft client={sel} />
        )}

        {sel.macros && (sel.status === "active" || sel.stage === "active" || sel.role === "admin") && (
          <ErrorBoundary
            name="AdminClientTracking"
            title="Her day couldn’t load"
            message="Meal / water / weigh-in mirror failed. Ranges and progress above still work — refresh to try again."
          >
            <AdminClientTracking client={sel} />
          </ErrorBoundary>
        )}

        {sel.status === "active" && sel.macros && (
          <>
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Progress</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 8 }}>
              Last meal log:{" "}
              <b style={{ color: T.ink }}>
                {sel.lastMealDate || "none yet"}
              </b>
              {" · "}checklist this week: {sel.adherence ?? 0}%
              {r !== null && <> · trending <b style={{ color: r > 1.5 ? T.amber : T.sage }}>{Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</b></>}
            </div>
            {flags.length > 0 && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
                {flags.map((f) => (
                  <div key={f} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>
                    ⚠ {f === "losing too fast"
                      ? "Losing faster than 1.5 lb/wk — voice-note her to eat the top of her ranges."
                      : f === "no meal log in 48h — check in"
                        ? "No meal logged yesterday or today — a quick WhatsApp check-in usually helps."
                        : f}
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
            {(sel.weighins || []).length <= 1 && (
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
                Weight trend needs two weigh-ins. Charts below still show macros and habits when she logs.
              </div>
            )}
          </Card>

          {progressLoading && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13.5, color: T.inkSoft }}>Loading her progress charts…</div>
            </Card>
          )}
          {progressError && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13.5, color: T.amber }}>{progressError}</div>
            </Card>
          )}
          {clientProgress && (
            <>
              <ProgressCharts
                audience="admin"
                macros={sel.macros}
                macroHistory={clientProgress.macroHistory}
                habitHistory={clientProgress.habitHistory}
                waterHistory={clientProgress.waterHistory}
                waterGoalOz={clientProgress.waterGoalOz}
              />
              <Card style={{ marginTop: 12 }}>
                <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Her 4-week trends</div>
                {clientProgress.trends.locked ? (
                  <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
                    Unlocks after four weeks of tracking. She&apos;s at{" "}
                    <b style={{ color: T.ink }}>{clientProgress.trends.n} of 4</b>.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: T.inkSoft, marginBottom: 10 }}>
                      Across her last {clientProgress.trends.n} weeks, consistency is{" "}
                      <b style={{ color: clientProgress.trends.delta >= 0 ? T.sage : T.amber }}>
                        {clientProgress.trends.delta >= 3 ? "climbing" : clientProgress.trends.delta <= -3 ? "slipping" : "holding steady"}
                      </b>
                      {" "}({clientProgress.trends.overall.map((o) => `${o}%`).join(" → ")}).
                    </div>
                    {clientProgress.trends.items.map((i) => (
                      <div key={i.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                          <span style={{ color: T.ink, fontWeight: 600 }}>{i.label}</span>
                          <span style={{ color: T.inkSoft }}>{i.strength ? `${i.avgSessions.toFixed(1)}× / wk (goal 3)` : `${i.pct}%`}</span>
                        </div>
                        <div style={{ height: 6, background: T.track, borderRadius: 99 }}>
                          <div style={{ height: 6, borderRadius: 99, width: `${i.strength ? Math.min((i.avgSessions / 3) * 100, 100) : i.pct}%`, background: (i.strength ? i.avgSessions >= 3 : i.pct >= 70) ? T.sage : T.accent }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ background: T.accentSoft, borderRadius: 12, padding: "10px 14px", marginTop: 10, fontSize: 13, color: T.accentDeep, lineHeight: 1.55 }}>
                      Strongest habit: <b>{clientProgress.trends.best.label.toLowerCase()}</b> ({clientProgress.trends.best.pct}%).
                      {" "}Worth a nudge: <b>{clientProgress.trends.worst.label.toLowerCase()}</b> ({clientProgress.trends.worst.pct}%).
                    </div>
                  </>
                )}
              </Card>
            </>
          )}
        </>
        )}

        <Card style={{ marginTop: 12 }}>
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Emails sent</div>
          <EmailTimeline profileId={sel.id} />
        </Card>
      </Shell>
    );
  }

  const stageShort = (c) => {
    const stage = c.stage || "signed_up";
    if (stage === "active" || c.status === "active") return `W${c.week ?? "—"}`;
    if (stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid)) return "Approve";
    if (stage === "paid_awaiting_intake") return "Intake";
    if (stage === "refunded" || c.refunded) return "Refunded";
    if (stage === "signed_up") return "Unpaid";
    return STAGE_LABEL[stage] || stage;
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
              onClick={() => {
                setFilter(computedStats.awaitingApproval > 0 ? "awaiting_approval" : "active");
                setTab("clients");
              }}
            >
              {computedStats.awaitingApproval > 0 ? "Review approvals" : "Open client list"}
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              ["active", "Active"],
              ["awaiting_approval", "Approve"],
              ["awaiting_intake", "Need intake"],
              ["unpaid", "Unpaid"],
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
                {id === "active" ? ` · ${computedStats.active}` : ""}
                {id === "awaiting_approval" && computedStats.awaitingApproval > 0 ? ` · ${computedStats.awaitingApproval}` : ""}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.4 }}>
            A–Z by name. Tap a row for her profile · Copy phone for WhatsApp.
          </p>
          {!filtered.length ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft }}>Nobody in this filter right now.</div>
          ) : (
            <div
              style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) auto",
                  gap: 8,
                  padding: "8px 12px",
                  background: T.bg,
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.inkSoft,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                <div>Name</div>
                <div>Phone</div>
                <div style={{ textAlign: "right" }}>Status</div>
              </div>
              {filtered.map((c, i) => {
                const flags = rosterFlags(c);
                const short = stageShort(c);
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setAdminSel(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAdminSel(c.id);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                      cursor: "pointer",
                      background: "#fff",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{
                          fontFamily: FD,
                          fontSize: 15,
                          color: T.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}
                        >
                          {c.name || "—"}
                        </span>
                        {c.role === "admin" && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, fontFamily: F,
                            padding: "2px 7px", borderRadius: 99, background: T.accentSoft, color: T.accentDeep,
                          }}
                          >
                            Admin
                          </span>
                        )}
                      </div>
                      {flags.length > 0 && (
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: T.amber, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        >
                          ⚠ {flags[0]}
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                      <CopyPhoneButton phone={c.phone} compact />
                    </div>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      justifyContent: "flex-end",
                      whiteSpace: "nowrap",
                    }}
                    >
                      <span style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 99,
                        background:
                          short === "Approve" || short === "Intake" ? T.amberSoft
                            : short.startsWith("W") ? T.sageSoft
                              : T.track,
                        color:
                          short === "Approve" || short === "Intake" ? T.amber
                            : short.startsWith("W") ? T.sage
                              : T.inkSoft,
                      }}
                      >
                        {short}
                      </span>
                      <span style={{ color: T.inkSoft, fontSize: 16, lineHeight: 1 }}>›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
