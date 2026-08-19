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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { addDaysIso, localDateIso, rateOf } from "../utils/dates";
import { buildMacroHistory, buildTrends, buildWaterHistory } from "../utils/progressSeries";
import { adminCohortName, resolveProgramStartWeekIso } from "../lib/cohorts";
import { mergeGoalItems } from "../lib/goals";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { Shell, Card, Btn, inputStyle } from "../components/ui";
import { ProgressCharts } from "../components/ProgressCharts";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AdminMessages } from "./AdminMessages";
import { AdminAnnouncements } from "./AdminAnnouncements";
import { AdminClientTracking } from "./AdminClientTracking";
import { AdminClientMessages } from "./AdminClientMessages";
import { AdminCredits } from "./AdminCredits";
import { AdminEmails } from "./AdminEmails";
import { AdminLeads } from "./AdminLeads";
import { AdminQuizFunnelCard } from "./AdminQuizFunnelCard";
import { AdminClientRoster, CohortFilterBar, CopyPhoneButton } from "./AdminClientRoster";
import { rosterStats } from "./clientRoster";
import { formatReferredBy, thankReferrerLabel } from "./referredBy";
import { AppUpdateBanner } from "../components/AppUpdateBanner";
import { supabase } from "../lib/supabase";
import { EMAIL_TYPE_LABELS } from "../content/emailCatalog";
import { useAuth } from "../auth/useAuth.jsx";
import { syncAppBadge } from "../lib/push";

const STAGE_LABEL = {
  signed_up: "Signed up — unpaid",
  paid_awaiting_intake: "Paid — needs intake",
  awaiting_approval: "Waiting on your approval",
  active: "Active",
  refunded: "Refunded",
};

const AI_LABELS = {
  estimate_photo: "Snap photo",
  estimate_text: "Describe",
  meal_suggest: "Suggest my week",
  meal_idea: "Meal ideas",
};

const EMPTY_ROSTER = [];

const AI_KINDS = {
  config: "not configured",
  auth: "bad API key",
  credits: "out of credits",
  rate_limited: "rate limited",
  timeout: "timed out",
  network: "network drop",
  upstream: "provider error",
  empty: "empty reply",
  parse: "unreadable reply",
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

function StatPill({ label, value, bg, color, onClick }) {
  const style = {
    flex: "1 1 30%",
    minWidth: 100,
    background: bg,
    borderRadius: 12,
    padding: "12px 8px",
    textAlign: "center",
    border: "none",
    fontFamily: F,
    cursor: onClick ? "pointer" : "default",
    appearance: "none",
    WebkitAppearance: "none",
  };
  const inner = (
    <>
      <div style={{ fontFamily: FD, fontSize: 24, color }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </>
  );
  if (!onClick) return <div style={style}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} style={style} aria-label={`${label}: ${value}. Open this list.`}>
      {inner}
    </button>
  );
}

function TabBar({ tab, setTab, unreadMessages = 0 }) {
  const tabs = [
    ["overview", "Overview"],
    ["clients", "Clients"],
    ["leads", "Leads"],
    ["credits", "Credits"],
    ["messages", "Messages"],
    ["announcements", "Announcements"],
    ["emails", "Emails"],
  ];
  return (
    <div style={{ display: "flex", gap: 6, margin: "10px 0 18px", flexWrap: "wrap" }}>
      {tabs.map(([id, label]) => {
        const showBadge = id === "messages" && unreadMessages > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: `1.5px solid ${
                tab === id ? T.accent : showBadge ? T.accent : T.border
              }`,
              background: tab === id ? T.accentSoft : showBadge ? T.accentSoft : "#fff",
              color: tab === id || showBadge ? T.accentDeep : T.inkSoft,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: F,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {label}
            {showBadge && (
              <span
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: T.accent,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "18px",
                  padding: "0 5px",
                  boxSizing: "border-box",
                  textAlign: "center",
                }}
              >
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            )}
          </button>
        );
      })}
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

export function AdminPortal({ roster, setRoster, stats: _stats, adminSel, setAdminSel }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "overview";
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "messages" || q === "announcements" || q === "emails" || q === "clients" || q === "credits" || q === "leads") return q;
    return "overview";
  });
  const [filter, setFilter] = useState(() => {
    if (typeof window === "undefined") return "needs_you";
    const q = new URLSearchParams(window.location.search).get("filter");
    const allowed = new Set(["needs_you", "active", "awaiting_approval", "awaiting_intake", "paid", "unpaid", "refunded", "all"]);
    return allowed.has(q) ? q : "needs_you";
  });
  const [cohortFilter, setCohortFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("cohort") || "all";
  });
  const [aiFailures, setAiFailures] = useState([]);
  const [clientProgress, setClientProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const debounceRef = useRef({});

  useEffect(() => {
    syncAppBadge(unreadMessages);
  }, [unreadMessages]);

  const all = roster || EMPTY_ROSTER;

  // Keep unread count fresh on Overview (and elsewhere) so Callie sees it without opening Messages.
  const refreshUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await db.loadMessageInbox(user.id);
      setUnreadMessages(rows.reduce((n, r) => n + (r.unread || 0), 0));
    } catch (e) {
      console.warn("admin unread poll failed", e);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await refreshUnread();
    };
    run();
    const channel = supabase
      .channel("messages-admin-unread-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => { run(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshUnread]);

  const computedStats = useMemo(
    () => rosterStats(all, cohortFilter),
    [all, cohortFilter],
  );

  const openClients = useCallback((nextFilter) => {
    setFilter(nextFilter);
    setTab("clients");
  }, []);

  useEffect(() => {
    if (tab !== "overview") return;
    let cancelled = false;
    db.loadAiFailures(24, 50).then((rows) => {
      if (!cancelled) setAiFailures(rows);
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
        const goalItems = mergeGoalItems(payload.customGoals || []);
        setClientProgress({
          macroHistory: buildMacroHistory(payload.mealHistoryByDate),
          waterHistory: buildWaterHistory(payload.waterLogsByDate || {}, waterGoal),
          waterGoalOz: waterGoal,
          trends: buildTrends(payload.checksByWeek, undefined, goalItems),
          customGoals: payload.customGoals || [],
          checksByWeek: payload.checksByWeek || {},
          goalItems,
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
    // Quiet week-1 noise: don't flag checklist %. Flag silence — no app logs in ~48h.
    // lastActiveDate = meals / water / weigh-ins (not auth login).
    const active = c.status === "active" || c.stage === "active";
    if (active) {
      const today = localDateIso();
      const okIfOnOrAfter = addDaysIso(today, -1); // yesterday or today = fine
      const lastActive = c.lastActiveDate || c.lastMealDate || null;
      if (!lastActive || lastActive < okIfOnOrAfter) {
        flags.push("no logs in 48h — check in");
      }
    }
    return flags;
  };

  const patchMacros = (c, k, v) => {
    if (!c.macros) return;
    const next = { ...c.macros, [k]: Number(v) || 0 };
    setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, macros: next } : x)));
    clearTimeout(debounceRef.current[c.id]);
    debounceRef.current[c.id] = setTimeout(() => {
      db.updateClientMacros(c.id, next).catch((e) => console.error("updateClientMacros failed", e));
    }, 400);
  };

  const toggleComp = async (c) => {
    const next = !c.comp;
    setRoster((rs) => rs.map((x) => (x.id === c.id ? {
      ...x,
      comp: next,
      paid: next ? true : x.paid,
    } : x)));
    try {
      await db.setClientComp(c.id, next);
    } catch (e) {
      console.error("setClientComp failed", e);
      setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, comp: c.comp, paid: c.paid } : x)));
    }
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
    const referredLine = formatReferredBy(sel.referredBy);
    const thankLabel = thankReferrerLabel(sel.referredBy);
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
                {sel.comp && (
                  <span style={{
                    marginLeft: 10, fontSize: 12, fontWeight: 700, fontFamily: F,
                    padding: "3px 10px", borderRadius: 99, background: T.sageSoft, color: T.sage,
                    verticalAlign: "middle",
                  }}>
                    Comp
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
                {STAGE_LABEL[stage] || stage}
                {sel.comp ? " · Comp" : sel.paid ? " · Paid" : " · Unpaid"}
                {sel.refunded ? " · Refunded" : ""}
                {sel.cohort_label ? ` · ${adminCohortName(sel.cohort_label)}` : ""}
                {sel.email ? <><br />✉️ {sel.email}</> : null}
                {referredLine ? (
                  <div style={{ marginTop: 6 }}>
                    <div>{referredLine}</div>
                    {sel.referredBy?.advocateUserId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminSel(sel.referredBy.advocateUserId);
                          setTab("messages");
                        }}
                        aria-label={`${thankLabel} to thank her`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          marginTop: 8,
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
                        {thankLabel}
                      </button>
                    ) : null}
                  </div>
                ) : null}
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
                {(sel.allergens?.length || sel.allergenNote) ? (
                  <>
                    <br />
                    🚫 Allergens: {[...(sel.allergens || []), sel.allergenNote].filter(Boolean).join(", ")}
                  </>
                ) : null}
                {sel.foodAvoids ? <><br />👎 Avoids: {sel.foodAvoids}</> : null}
                {sel.phone ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 13, color: T.inkSoft }}>📱 Phone</span>
                    <CopyPhoneButton phone={sel.phone} />
                    {stage === "awaiting_approval" && (
                      <span style={{ fontSize: 12, color: T.inkSoft }}>Approve email points her to Messages</span>
                    )}
                  </div>
                ) : null}
                {(sel.prefB || sel.prefL || sel.prefD || sel.prefS) ? <><br />🍽 Loves: {[sel.prefB && `B: ${sel.prefB}`, sel.prefL && `L: ${sel.prefL}`, sel.prefD && `D: ${sel.prefD}`, sel.prefS && `S: ${sel.prefS}`].filter(Boolean).join(" · ")}</> : null}
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
              {sel.comp
                ? "Complimentary — waiting on her to finish intake. No macros to review yet."
                : sel.paid
                  ? "Paid — waiting on her to finish intake. No macros to review yet."
                  : "Signed up but hasn't paid yet."}
            </div>
          )}

          {sel.role !== "admin" && (
            <div style={{ marginTop: 10 }}>
              <Btn
                small
                ghost
                onClick={() => toggleComp(sel)}
                style={{ minHeight: 40 }}
              >
                {sel.comp ? "Clear complimentary" : "Mark complimentary"}
              </Btn>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
                Comp keeps dashboard access without counting as Stripe-paid. Does not write Stripe ids.
              </div>
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

        <ErrorBoundary
          key={`client-messages-${sel.id}`}
          name="AdminClientMessages"
          title="Messages couldn’t load"
          message="Her messages are safe. Try again here, or use the Messages inbox while the rest of her profile stays available."
          resetKeys={[sel.id]}
        >
          <AdminClientMessages
            client={sel}
            adminUserId={user?.id}
            onActivity={refreshUnread}
          />
        </ErrorBoundary>

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
              Last active:{" "}
              <b style={{ color: T.ink }}>
                {sel.lastActiveDate || sel.lastMealDate || "none yet"}
              </b>
              {" · "}last meal:{" "}
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
                      : f === "no logs in 48h — check in"
                        ? "No meals, water, or weigh-ins yesterday or today — a quick Messages check-in usually helps."
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
              {(clientProgress.customGoals || []).length > 0 && (
                <Card style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Her custom goals</div>
                  <p style={{ fontSize: 13, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>
                    Coaching signal — what she added on top of the program checklist.
                  </p>
                  {clientProgress.customGoals.map((g) => (
                    <div key={g.id} style={{ fontSize: 14, marginBottom: 8, lineHeight: 1.45 }}>
                      <b style={{ color: T.ink }}>{g.title}</b>
                      {g.subtitle ? <span style={{ color: T.inkSoft }}> · {g.subtitle}</span> : null}
                      <span style={{ color: T.inkSoft, fontSize: 12.5 }}>
                        {" "}· {g.frequency === "daily" ? "Daily" : `${g.n_target}× / week`}
                      </span>
                    </div>
                  ))}
                </Card>
              )}
              <ProgressCharts
                audience="admin"
                macros={sel.macros}
                macroHistory={clientProgress.macroHistory}
                waterHistory={clientProgress.waterHistory}
                waterGoalOz={clientProgress.waterGoalOz}
                checksByWeek={clientProgress.checksByWeek}
                goalItems={clientProgress.goalItems}
                programStartWeek={resolveProgramStartWeekIso(sel.cohort_label)}
              />
              {!clientProgress.trends.locked && clientProgress.trends.items?.length > 0 && (
                <Card style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>By goal</div>
                  <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
                    Per-habit consistency across finished weeks (includes her YOURS goals).
                  </p>
                  {clientProgress.trends.items.map((i) => (
                    <div key={i.label} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                        <span style={{ color: T.ink, fontWeight: 600 }}>{i.label}</span>
                        <span style={{ color: T.inkSoft }}>
                          {i.strength
                            ? `${i.avgSessions.toFixed(1)}× / wk (goal ${i.nTarget || 3})`
                            : `${i.pct}%`}
                        </span>
                      </div>
                      <div style={{ height: 6, background: T.track, borderRadius: 99 }}>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 99,
                            width: `${i.strength ? Math.min((i.avgSessions / (i.nTarget || 3)) * 100, 100) : i.pct}%`,
                            background: (i.strength ? i.avgSessions >= (i.nTarget || 3) : i.pct >= 70) ? T.sage : T.accent,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </Card>
              )}
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

  return (
    <Shell contentMaxWidth={tab === "messages" ? 1120 : 560}>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 4px" }}>Callie admin</h2>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 4px", lineHeight: 1.45 }}>
        Your mamas — find who needs you, then jump into a 1:1.{" "}
        Messages is replies. Announcements is a note to many mamas.{" "}
        <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700 }}>Your dashboard</Link>
        {" · "}
        Admin only.
      </p>

      <TabBar tab={tab} setTab={setTab} unreadMessages={unreadMessages} />

      <AppUpdateBanner />

      {tab === "overview" && (
      <Link
        to={`${PATHS.support}?kind=feedback&from=admin`}
        style={{
          display: "block",
          textDecoration: "none",
          marginBottom: 14,
          padding: "14px 16px",
          borderRadius: 14,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
          color: T.ink,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14.5, color: T.accentDeep }}>
          Feedback for Tech Guy
        </div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
          Recipes, content ideas, bugs, or product wishes — same form as App help; tagged as Callie.
        </div>
      </Link>
      )}

      {tab === "overview" && (
        <>
          <AdminQuizFunnelCard onOpenLeads={() => setTab("leads")} />
          {unreadMessages > 0 && (
            <button
              type="button"
              onClick={() => setTab("messages")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 14,
                padding: "16px 18px",
                borderRadius: 14,
                border: `2px solid ${T.accent}`,
                background: T.accentSoft,
                color: T.accentDeep,
                fontFamily: F,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>
                <span style={{ display: "block", fontFamily: FD, fontSize: 20, color: T.ink, marginBottom: 4 }}>
                  {unreadMessages} unread message{unreadMessages === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.inkSoft }}>
                  Open Messages to reply — no need to hunt for the tab.
                </span>
              </span>
              <span style={{
                flexShrink: 0,
                fontWeight: 800,
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                background: T.accent,
                color: "#fff",
              }}
              >
                Open →
              </span>
            </button>
          )}

          <CohortFilterBar roster={all} cohort={cohortFilter} setCohort={setCohortFilter} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <StatPill label="Signups" value={computedStats.signups} bg={T.accentSoft} color={T.accentDeep} onClick={() => openClients("all")} />
            <StatPill label="Paid" value={computedStats.paid} bg={T.sageSoft} color={T.sage} onClick={() => openClients("paid")} />
            <StatPill label="Unpaid" value={computedStats.unpaid} bg={T.track} color={T.inkSoft} onClick={() => openClients("unpaid")} />
            <StatPill label="Need intake" value={computedStats.awaitingIntake} bg={T.amberSoft} color={T.amber} onClick={() => openClients("awaiting_intake")} />
            <StatPill label="Need approval" value={computedStats.awaitingApproval} bg={T.amberSoft} color={T.amber} onClick={() => openClients("awaiting_approval")} />
            <StatPill label="Active" value={computedStats.active} bg={T.sageSoft} color={T.sage} onClick={() => openClients("active")} />
            <StatPill label="Refunded" value={computedStats.refunded} bg={T.track} color={T.inkSoft} onClick={() => openClients("refunded")} />
          </div>

          <Card>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>What needs you</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: T.inkSoft }}>
              {unreadMessages > 0 && (
                <p style={{ margin: "0 0 8px" }}>
                  <b style={{ color: T.accentDeep }}>{unreadMessages}</b> unread message{unreadMessages === 1 ? "" : "s"}
                  {" — "}
                  <button
                    type="button"
                    onClick={() => setTab("messages")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: T.accent,
                      fontWeight: 700,
                      fontFamily: F,
                      fontSize: 14,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    open Messages
                  </button>
                </p>
              )}
              {computedStats.awaitingApproval > 0
                ? (
                  <p style={{ margin: "0 0 8px" }}>
                    <button type="button" onClick={() => openClients("awaiting_approval")} style={{ background: "none", border: "none", padding: 0, color: T.ink, fontWeight: 700, fontFamily: F, fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
                      {computedStats.awaitingApproval} mama{computedStats.awaitingApproval === 1 ? "" : "s"} waiting on macro approval
                    </button>
                    .
                  </p>
                )
                : <p style={{ margin: "0 0 8px" }}>No intakes waiting on approval.</p>}
              {computedStats.awaitingIntake > 0 && (
                <p style={{ margin: "0 0 8px" }}>
                  <button type="button" onClick={() => openClients("awaiting_intake")} style={{ background: "none", border: "none", padding: 0, color: T.ink, fontWeight: 700, fontFamily: F, fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
                    {computedStats.awaitingIntake} paid but haven&apos;t finished intake yet
                  </button>
                  .
                </p>
              )}
              {computedStats.unpaid > 0 && (
                <p style={{ margin: 0 }}>
                  <button type="button" onClick={() => openClients("unpaid")} style={{ background: "none", border: "none", padding: 0, color: T.ink, fontWeight: 700, fontFamily: F, fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
                    {computedStats.unpaid} signed up and haven&apos;t paid
                  </button>
                  .
                </p>
              )}
            </div>
            <Btn
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => openClients(computedStats.awaitingApproval > 0 ? "awaiting_approval" : "needs_you")}
            >
              {computedStats.awaitingApproval > 0 ? "Review approvals" : "Open client list"}
            </Btn>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>AI health · last 24h</div>
            {!aiFailures.length ? (
              <div style={{ fontSize: 13.5, color: T.sage, lineHeight: 1.5 }}>
                No AI failures logged. Snap, Describe, and Suggest my week are all answering.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, color: T.amber, lineHeight: 1.5, marginBottom: 8 }}>
                  <b>{aiFailures.length}</b> failed AI call{aiFailures.length === 1 ? "" : "s"} in the last 24h.
                  {aiFailures.some((f) => f.kind === "credits" || f.kind === "auth")
                    ? " Check the OpenRouter key + balance."
                    : " Clients were told to retry — no data lost."}
                </div>
                {Object.entries(
                  aiFailures.reduce((acc, f) => {
                    const k = `${AI_LABELS[f.label] || f.label} · ${AI_KINDS[f.kind] || f.kind}`;
                    acc[k] = (acc[k] || 0) + 1;
                    return acc;
                  }, {}),
                ).map(([k, n]) => (
                  <div key={k} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                    <b>{n}×</b> {k}
                  </div>
                ))}
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
                  Most recent: {formatWhen(aiFailures[0].created_at)}
                </div>
              </>
            )}
          </Card>

        </>
      )}

      {tab === "clients" && (
        <AdminClientRoster
          roster={all}
          filter={filter}
          setFilter={setFilter}
          cohort={cohortFilter}
          setCohort={setCohortFilter}
          onOpenClient={(id) => setAdminSel(id)}
          onMessageClient={(id) => {
            setAdminSel(id);
            setTab("messages");
          }}
        />
      )}

      {tab === "leads" && (
        <ErrorBoundary message="Leads admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminLeads onOpenMama={setAdminSel} />
        </ErrorBoundary>
      )}

      {tab === "credits" && (
        <ErrorBoundary message="Credits admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminCredits roster={all} />
        </ErrorBoundary>
      )}

      {tab === "messages" && (
        <ErrorBoundary
          name="AdminMessages"
          title="Messages inbox hit a snag"
          message="Conversations are safe. Try again here — other admin tabs still work."
          resetKeys={[user?.id, adminSel, tab]}
        >
          <AdminMessages
            roster={all}
            adminUserId={user?.id}
            initialClientId={adminSel}
            onUnreadTotalChange={setUnreadMessages}
          />
        </ErrorBoundary>
      )}

      {tab === "announcements" && (
        <AdminAnnouncements roster={all} cohortFilter={cohortFilter} />
      )}

      {tab === "emails" && (
        <ErrorBoundary message="Emails admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminEmails roster={all} onOpenMama={setAdminSel} />
        </ErrorBoundary>
      )}
    </Shell>
  );
}
