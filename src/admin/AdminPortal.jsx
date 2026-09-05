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
import { rateOf } from "../utils/dates";
import { buildMacroHistory, buildTrends, buildWaterHistory } from "../utils/progressSeries";
import { adminCohortName, mamaProgramOpts, mamaProgramStartWeekIso, mamaProgramWeekNumber } from "../lib/cohorts";
import { mergeGoalItems } from "../lib/goals";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { Shell, Card, Btn, inputStyle } from "../components/ui";
import { ProgressCharts } from "../components/ProgressCharts";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AdminMessages } from "./AdminMessages";
import { AdminClientTracking } from "./AdminClientTracking";
import { AdminClientMessages } from "./AdminClientMessages";
import { TextSmsButton } from "./AdminClientRoster";
import { loadQuizLeads } from "./quizLeads";
import { assemblePeople } from "./personModel";
import {
  clearLocalSkip,
  loadLocalSkips,
  mergeOverrideRows,
  skipUntilIso,
  stampRosterOverrides,
  writeLocalSkip,
} from "./dailySkip";
import {
  moreViewFromQuery,
  peopleSegmentFromQuery,
  primaryTabFromQuery,
  queryTabFor,
} from "./adminNav";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminHome } from "./AdminHome";
import { AdminPeople } from "./AdminPeople";
import { AdminMore } from "./AdminMore";
import { AdminClientSummary } from "./AdminClientSummary";
import { AdminPersonTimeline } from "./AdminPersonTimeline";
import { AdminStickyVoiceBar } from "./AdminStickyVoiceBar";
import { buildClientFlagChips } from "./clientFlags";
import { formatReferredBy, thankReferrerLabel } from "./referredBy";
import { AppUpdateBanner } from "../components/AppUpdateBanner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth.jsx";
import { syncAppBadge } from "../lib/push";

const STAGE_LABEL = {
  signed_up: "Signed up — unpaid",
  paid_awaiting_intake: "Paid — needs intake",
  awaiting_approval: "Waiting on your approval",
  active: "Active",
  refunded: "Refunded",
};

const EMPTY_ROSTER = [];

export function AdminPortal({ roster, setRoster, stats: _stats, adminSel, setAdminSel }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "home";
    return primaryTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
  });
  const [peopleSegment, setPeopleSegment] = useState(() => {
    if (typeof window === "undefined") return "needs_action";
    return peopleSegmentFromQuery(new URLSearchParams(window.location.search).get("tab"));
  });
  const [moreView, setMoreView] = useState(() => {
    if (typeof window === "undefined") return "menu";
    return moreViewFromQuery(new URLSearchParams(window.location.search).get("tab"));
  });
  const [people, setPeople] = useState([]);
  const [overrides, setOverrides] = useState(() => loadLocalSkips());
  const overridesRef = useRef([]);
  const [composerOffscreen, setComposerOffscreen] = useState(false);
  const composerRef = useRef(null);
  const [filter, setFilter] = useState(() => {
    if (typeof window === "undefined") return "needs_you";
    const q = new URLSearchParams(window.location.search).get("filter");
    const allowed = new Set([
      "needs_help", "needs_note", "unread", "quiet", "doing_well", "steady", "needs_you",
      "active", "awaiting_approval", "awaiting_intake", "paid", "unpaid", "refunded", "all",
    ]);
    return allowed.has(q) ? q : "needs_help";
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
  const [leadsFilter, setLeadsFilter] = useState("unpaid");
  const [selectedLeadEmail, setSelectedLeadEmail] = useState(null);
  const debounceRef = useRef({});

  const setPrimaryTab = useCallback((next, extras = {}) => {
    const nextSegment = extras.peopleSegment ?? peopleSegment;
    const nextMore = extras.moreView ?? moreView;
    if (extras.peopleSegment) setPeopleSegment(extras.peopleSegment);
    if (extras.moreView) setMoreView(extras.moreView);
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", queryTabFor(next, { peopleSegment: nextSegment, moreView: nextMore }));
      window.history.replaceState({}, "", url);
    }
  }, [peopleSegment, moreView]);

  const updatePeopleSegment = useCallback((next) => {
    setPeopleSegment(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", queryTabFor("people", { peopleSegment: next, moreView }));
      window.history.replaceState({}, "", url);
    }
  }, [moreView]);

  const updateMoreView = useCallback((next) => {
    setMoreView(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", queryTabFor("more", { peopleSegment, moreView: next }));
      window.history.replaceState({}, "", url);
    }
  }, [peopleSegment]);

  useEffect(() => {
    syncAppBadge(unreadMessages);
  }, [unreadMessages]);

  const all = roster || EMPTY_ROSTER;
  const boardRoster = useMemo(() => stampRosterOverrides(all, overrides), [all, overrides]);
  overridesRef.current = overrides;

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

  const refreshPeople = useCallback(async () => {
    try {
      const [leadRows, nextOverrides] = await Promise.all([
        loadQuizLeads(),
        db.loadPersonOverrides(),
      ]);
      const emails = [
        ...leadRows.map((l) => l.email),
        ...(roster || []).map((c) => c.email),
      ];
      const [eventsByEmail, unsubscribed] = await Promise.all([
        db.loadLatestEmailEventsByEmails(emails),
        db.loadUnsubscribedEmailSet(emails),
      ]);
      const merged = mergeOverrideRows(
        nextOverrides || [],
        [...loadLocalSkips(), ...overridesRef.current],
      );
      setOverrides(merged);
      setPeople(assemblePeople({
        clients: roster || [],
        leads: leadRows,
        overrides: merged,
        eventsByEmail,
        unsubscribedEmails: unsubscribed,
      }));
    } catch (e) {
      console.warn("assemble people failed", e);
    }
  }, [roster]);

  const openLeads = useCallback((nextFilter) => {
    setLeadsFilter(nextFilter || "unpaid");
    setPrimaryTab("people", { peopleSegment: "leads" });
  }, [setPrimaryTab]);

  const openPerson = useCallback((person) => {
    if (person?.profileId) {
      setAdminSel(person.profileId);
      return;
    }
    if (person?.email) {
      setSelectedLeadEmail(person.email);
      setPrimaryTab("people", { peopleSegment: "leads" });
    }
  }, [setAdminSel, setPrimaryTab]);

  const touchLead = useCallback(async (email, kind) => {
    if (!email) return;
    await db.recordAdminTouch(email, kind || "email").catch(() => {});
    await refreshPeople();
  }, [refreshPeople]);

  const upsertOverride = useCallback((email, patch) => {
    const email_lower = String(email || "").trim().toLowerCase();
    if (!email_lower) return;
    setOverrides((prev) => {
      const existing = (prev || []).find(
        (row) => String(row.email_lower || row.email || "").trim().toLowerCase() === email_lower,
      );
      const rest = (prev || []).filter(
        (row) => String(row.email_lower || row.email || "").trim().toLowerCase() !== email_lower,
      );
      return [...rest, { ...existing, email_lower, ...patch }];
    });
  }, []);

  const passClientToday = useCallback(async (client) => {
    if (!client?.email) return;
    const snoozed_until = skipUntilIso();
    const last_touch_at = new Date().toISOString();
    writeLocalSkip(client.email, { snoozed_until, last_touch_at });
    upsertOverride(client.email, { snoozed_until, last_touch_at });
    const saved = await db.savePersonOverride(client.email, { snoozed_until, last_touch_at });
    if (saved) {
      upsertOverride(client.email, saved);
      db.recordAdminTouch(client.email, "skip", client.id).catch(() => {});
    }
  }, [upsertOverride]);

  const undoPassClient = useCallback(async (client) => {
    if (!client?.email) return;
    clearLocalSkip(client.email);
    upsertOverride(client.email, { snoozed_until: null });
    const saved = await db.savePersonOverride(client.email, { snoozed_until: null });
    if (saved) {
      upsertOverride(client.email, saved);
      db.recordAdminTouch(client.email, "unskip", client.id).catch(() => {});
    }
  }, [upsertOverride]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refreshPeople();
    })();
    return () => { cancelled = true; };
  }, [refreshPeople]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setComposerOffscreen(false);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setComposerOffscreen(!entry?.isIntersecting),
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [adminSel]);

  useEffect(() => {
    if (tab !== "more" && tab !== "home") return;
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
          mealHistoryByDate: payload.mealHistoryByDate || {},
          waterLogsByDate: payload.waterLogsByDate || {},
          programStartWeek: mamaProgramStartWeekIso(mamaProgramOpts(client)),
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
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const resp = await fetch("/api/admin-comp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId: c.id,
            comp: next,
            name: c.firstName || c.name || "",
          }),
        });
        if (!resp.ok) throw new Error(`admin-comp ${resp.status}`);
        const data = await resp.json().catch(() => ({}));
        if (data?.comp != null) {
          setRoster((rs) => rs.map((x) => (x.id === c.id ? {
            ...x,
            comp: !!data.comp,
            paid: data.paid != null ? !!data.paid : x.paid,
          } : x)));
        }
      } else {
        await db.setClientComp(c.id, next);
      }
    } catch (e) {
      console.error("setClientComp failed", e);
      try {
        await db.setClientComp(c.id, next);
      } catch (e2) {
        console.error("setClientComp fallback failed", e2);
        setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, comp: c.comp, paid: c.paid } : x)));
      }
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

  useEffect(() => {
    if (!sel?.email) return;
    db.recordAdminTouch(sel.email, "open", sel.id).catch(() => {});
  }, [sel?.id, sel?.email]);

  /* ---- client detail ---- */
  if (sel) {
    const r = rateOf(sel.weighins || []);
    const stage = sel.stage || (sel.status === "active" ? "active" : "awaiting_approval");
    const weekNum = mamaProgramWeekNumber(mamaProgramOpts(sel));
    const flagChips = buildClientFlagChips({
      client: sel,
      checksByWeek: clientProgress?.checksByWeek || {},
      goalItems: clientProgress?.goalItems || [],
      macroHistory: clientProgress?.macroHistory || [],
      programStartWeek: mamaProgramStartWeekIso(mamaProgramOpts(sel)),
    });
    const referredLine = formatReferredBy(sel.referredBy);
    const thankLabel = thankReferrerLabel(sel.referredBy);
    return (
      <Shell
        contentMaxWidth={560}
        bottomBar={(
          <>
            <AdminStickyVoiceBar
              clientId={sel.id}
              visible={composerOffscreen}
              onSent={refreshUnread}
            />
            <AdminBottomNav tab={tab} setTab={setPrimaryTab} unreadMessages={unreadMessages} />
          </>
        )}
      >
        <button
          type="button"
          onClick={() => setAdminSel(null)}
          style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "4px 0 10px" }}
        >
          ← People
        </button>
        <AdminClientSummary
          client={sel}
          progress={clientProgress}
          progressLoading={progressLoading || (!clientProgress && !progressError)}
          chips={flagChips}
        />
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
                          setPrimaryTab("messages");
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
                    <TextSmsButton phone={sel.phone} name={sel.name || sel.firstName || ""} />
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
              {stage === "active"
                ? (weekNum >= 1 ? `Week ${weekNum} of 8` : "Active")
                : "Pending"}
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
                Comp keeps dashboard access without counting as Stripe-paid. Sends the You&apos;re in welcome email once. Does not write Stripe ids.
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

        <div ref={composerRef}>
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
        </div>

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
                programStartWeek={mamaProgramStartWeekIso(mamaProgramOpts(sel))}
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

        <AdminPersonTimeline client={sel} />
      </Shell>
    );
  }

  return (
    <Shell
      contentMaxWidth={tab === "messages" ? 1120 : 560}
      bottomBar={<AdminBottomNav tab={tab} setTab={setPrimaryTab} unreadMessages={unreadMessages} />}
    >
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 4px" }}>Callie admin</h2>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
        Today’s new leads and client health. People is Clients or Leads.{" "}
        <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700 }}>Your dashboard</Link>
        {" · "}
        Admin only.
      </p>

      <AppUpdateBanner />

      {tab === "home" && (
        <AdminHome
          people={people}
          roster={boardRoster}
          cohortFilter={cohortFilter}
          onOpenLead={openPerson}
          onOpenLeads={() => openLeads("unpaid")}
          onOpenClients={(nextFilter, nextCohort) => {
            if (nextFilter) setFilter(nextFilter);
            if (nextCohort) setCohortFilter(nextCohort);
            setPrimaryTab("people", { peopleSegment: "clients" });
          }}
        />
      )}

      {tab === "people" && (
        <AdminPeople
          segment={peopleSegment}
          setSegment={updatePeopleSegment}
          roster={boardRoster}
          filter={filter}
          setFilter={setFilter}
          cohortFilter={cohortFilter}
          setCohortFilter={setCohortFilter}
          leadsFilter={leadsFilter}
          selectedLeadEmail={selectedLeadEmail}
          onOpenClient={(id) => setAdminSel(id)}
          onMessageClient={(id) => {
            setAdminSel(id);
            setPrimaryTab("messages");
          }}
          onPassToday={passClientToday}
          onUndoPass={undoPassClient}
          onAdminTouch={touchLead}
        />
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

      {tab === "more" && (
        <AdminMore
          view={moreView}
          setView={updateMoreView}
          roster={all}
          cohortFilter={cohortFilter}
          onOpenMama={setAdminSel}
          onOpenLeads={openLeads}
          aiFailures={aiFailures}
        />
      )}
    </Shell>
  );
}
