import { useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { CONFIG } from "./config";
import { useAuth } from "./auth/useAuth.jsx";
import { db } from "./db/db";
import { supabase } from "./lib/supabase";
import { computeMacros } from "./engine/computeMacros";
import { DEFAULT_ITEMS, DAYS } from "./content/data";
import { wkStartOf } from "./utils/dates";
import { PATHS, homePathFor, pathFromClientView, canAccessDashboard } from "./routing";
import { SalesPage } from "./views/SalesPage";
import { IntakeFlow } from "./views/IntakeFlow";
import { DeclinedPage } from "./views/DeclinedPage";
import { PendingPage } from "./views/PendingPage";
import { JoinPage } from "./views/JoinPage";
import { WelcomePage } from "./views/WelcomePage";
import { GoodbyePage } from "./views/GoodbyePage";
import { SignInPage } from "./views/SignInPage";
import { TermsPage } from "./views/TermsPage";
import { ClientApp } from "./views/ClientApp";
import { AdminPortal } from "./admin/AdminPortal";
import { Shell } from "./components/ui";
import { T, FD } from "./theme/tokens";
import { requestEligibilityRefund } from "./lib/checkout";

const EMPTY_PROFILE = {
  name: "", age: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
  breastfeeding: null, pregnant: null, goal: "lose", activity: "moderate",
  stress: "medium", insulinResistance: false, diet: "none",
  prefB: "", prefL: "", prefD: "", seasonNote: "",
};

export default function App() {
  const { user, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signInNext, setSignInNext] = useState("intake"); // "intake" → create; "app" → returning
  const [tab, setTab] = useState("today");
  const [step, setStep] = useState(0);
  const [declineReason, setDeclineReason] = useState("");
  const [profile, setProfile] = useState(() => ({ ...EMPTY_PROFILE }));
  const [macros, setMacros] = useState(null);
  const [approved, setApproved] = useState(false);
  const [paid, setPaid] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [refundIssued, setRefundIssued] = useState(false);
  const refundOnce = useRef(false);
  const curWk = wkStartOf();
  const [checksByWeek, setChecksByWeek] = useState({});
  const [viewWk, setViewWk] = useState(curWk);
  const [editPast, setEditPast] = useState(false);
  const [weighins, setWeighins] = useState([]);
  const [wInput, setWInput] = useState("");
  const [mealFilter, setMealFilter] = useState("All");
  const [roster, setRoster] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminSel, setAdminSel] = useState(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [estimateSource, setEstimateSource] = useState("photo");
  const [todayLog, setTodayLog] = useState({ date: new Date().toISOString().slice(0, 10), entries: [] });
  const [loaded, setLoaded] = useState(false);
  const routedAfterLoad = useRef(false);

  /* Hydrate client state for every signed-in user (admins included — dogfood). */
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    routedAfterLoad.current = false;
    (async () => {
      setLoaded(false);
      try {
        if (user) {
          const s = await db.loadClientState();
          if (cancelled) return;
          // Never wipe enrollment state on a null/failed fetch — that was sending
          // paid clients back to /onboarding after the meal-log migration.
          if (!s) {
            console.error("loadClientState returned null while signed in");
          } else {
            if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
            setMacros(s.macros || null);
            setApproved(!!s.approved);
            setPaid(!!s.paid);
            setRefunded(!!s.refunded);
            if (s.checksByWeek) setChecksByWeek(s.checksByWeek);
            if (s.weighins) setWeighins(s.weighins);
            if (s.todayLog && s.todayLog.date === new Date().toISOString().slice(0, 10)) {
              setTodayLog(s.todayLog);
            } else {
              setTodayLog({ date: new Date().toISOString().slice(0, 10), entries: [] });
            }
          }
        } else {
          setMacros(null);
          setApproved(false);
          setPaid(false);
          setRefunded(false);
          setRefundIssued(false);
          refundOnce.current = false;
        }
        if (isAdmin) {
          try {
            const r = await db.loadRoster();
            if (!cancelled) {
              // Supports new { clients, stats } shape and legacy array
              if (Array.isArray(r)) {
                setRoster(r);
                setAdminStats(null);
              } else {
                setRoster(r.clients || []);
                setAdminStats(r.stats || null);
              }
            }
          } catch (rosterErr) {
            console.error("loadRoster failed", rosterErr);
          }
        }
      } catch (e) {
        console.error("initial load failed", e);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, isAdmin]);

  /* After load / sign-in: send users from entry paths to the right home. */
  useEffect(() => {
    if (authLoading || !loaded || !user) return;
    const entryPaths = [PATHS.home, PATHS.signin, "/home"];
    if (!entryPaths.includes(location.pathname)) return;
    if (routedAfterLoad.current && location.pathname === PATHS.home) return;

    const dest = homePathFor({ isAdmin, approved, paid, macros, refunded });
    // Signed-in visitors may still browse marketing at `/` — only auto-route
    // from `/signin` and legacy `/home`. From `/`, route enrolled clients + admins.
    if (location.pathname === PATHS.home) {
      if (isAdmin || refunded || paid) {
        routedAfterLoad.current = true;
        navigate(dest, { replace: true });
      }
      return;
    }
    routedAfterLoad.current = true;
    navigate(dest, { replace: true });
  }, [authLoading, loaded, user, isAdmin, approved, paid, macros, refunded, location.pathname, navigate]);

  const authMode = signInNext === "intake" ? "create" : "signin";
  const switchAuthMode = (next) => {
    setSignInNext(next === "create" ? "intake" : "app");
  };

  const applyClientState = (s) => {
    if (!s) return;
    if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
    if (s.macros) setMacros(s.macros);
    else if (s.view === "onboarding" || s.view === "join") setMacros(null);
    setApproved(!!s.approved);
    setPaid(!!s.paid);
    setRefunded(!!s.refunded);
  };

  const refreshClientState = async () => {
    try {
      const s = await db.loadClientState();
      applyClientState(s);
      if (s) navigate(pathFromClientView(s.view), { replace: true });
    } catch (e) {
      console.error("refreshClientState failed", e);
    }
  };

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const runEligibilityRefund = async (reason) => {
    if (refundOnce.current) return;
    refundOnce.current = true;
    setDeclineReason(reason === "early_nursing" ? "early" : reason);
    try {
      await requestEligibilityRefund(reason);
      setRefundIssued(true);
      setPaid(false);
      setRefunded(true);
      await refreshProfile();
    } catch (e) {
      console.error("eligibility refund failed", e);
      // Allow a retry if the API failed (e.g. webhook lag on payment_intent)
      refundOnce.current = false;
    }
  };

  /* Gating: pregnant + early nursing are handled inline on step 2 (post-pay).
     Diet gate still runs here; both paths issue a full refund when paid. */
  const submitIntake = async () => {
    if (profile.pregnant) {
      await runEligibilityRefund("pregnant");
      navigate(PATHS.declined);
      return;
    }
    if (profile.breastfeeding && Number(profile.monthsPP) < 3) {
      await runEligibilityRefund("early_nursing");
      navigate(PATHS.declined);
      return;
    }
    if (profile.diet !== "none") {
      await runEligibilityRefund("diet");
      navigate(PATHS.declined);
      return;
    }
    const forEngine = {
      ...profile,
      // monthsPP only applies when nursing; clear for non-BF so storage stays clean
      monthsPP: profile.breastfeeding ? profile.monthsPP : "",
    };
    const m = computeMacros(forEngine);
    setMacros(m);
    setApproved(false);
    try {
      await db.submitIntake(forEngine, m);
      await refreshProfile();
      // Email #4 + Callie B (best-effort)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch("/api/intake-submitted", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: forEngine.name,
              age: forEngine.age,
              currentWeight: forEngine.currentWeight,
              goalWeight: forEngine.goalWeight,
              breastfeeding: forEngine.breastfeeding,
              monthsPP: forEngine.monthsPP,
              phone: forEngine.phone,
              tastes: [forEngine.prefB, forEngine.prefL, forEngine.prefD].filter(Boolean).join(" · "),
              seasonNote: forEngine.seasonNote,
            }),
          });
        }
      } catch (mailErr) {
        console.error("intake-submitted notify failed", mailErr);
      }
    } catch (e) {
      console.error("submitIntake failed", e);
      if (/Payment required/i.test(e?.message || "")) {
        navigate(PATHS.join, { replace: true });
        return;
      }
    }
    navigate(PATHS.pending);
  };

  const waterOz = profile.goalWeight ? Math.round(Number(profile.goalWeight) / 2) : null;

  const downscaleImage = (file, max = 1024) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });

  const runEstimate = async (payload, source) => {
    setEstimateBusy(true);
    setEstimate(null);
    setEstimateSource(source);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("not signed in");
      const resp = await fetch(CONFIG.ESTIMATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const parsed = await resp.json().catch(() => ({}));
      if (!resp.ok || parsed.error) setEstimate({ error: true });
      else setEstimate(parsed);
    } catch (e) {
      console.error("estimate failed", e);
      setEstimate({ error: true });
    }
    setEstimateBusy(false);
  };

  const analyzePhoto = async (file) => {
    if (!file) return;
    const b64 = await downscaleImage(file);
    if (!b64) { setEstimate({ error: true }); return; }
    await runEstimate({ type: "photo", image_b64: b64, media_type: "image/jpeg" }, "photo");
  };

  const analyzeText = async (description) => {
    if (!description?.trim()) return;
    await runEstimate({ type: "text", description: description.trim() }, "text");
  };

  const appendMealEntry = async (entry) => {
    try {
      const row = await db.addMealLog(entry);
      setTodayLog((tl) => ({
        date: new Date().toISOString().slice(0, 10),
        entries: [...tl.entries, {
          id: row.id,
          name: entry.name,
          cal: entry.cal,
          p: entry.p,
          c: entry.c,
          f: entry.f,
          source: entry.source || null,
        }],
      }));
      return true;
    } catch (e) {
      console.error("addMealLog failed", e);
      return false;
    }
  };

  const confirmEstimate = async () => {
    if (!estimate || estimate.error) return;
    await appendMealEntry({
      name: estimate.meal,
      cal: estimate.calories,
      p: estimate.protein_g,
      c: estimate.carbs_g,
      f: estimate.fat_g,
      source: estimateSource,
    });
    setEstimate(null);
  };

  const discardEstimate = () => setEstimate(null);

  const logRecipe = async (recipe) => {
    const ok = await appendMealEntry({
      name: recipe.name,
      cal: recipe.cal,
      p: recipe.p,
      c: recipe.c,
      f: recipe.f,
      source: "recipe",
    });
    if (ok) setTab("today");
  };

  const logManualMeal = async (entry) => {
    await appendMealEntry(entry);
  };

  const deleteMealEntry = async (id) => {
    if (!id) return;
    try {
      await db.deleteMealLog(id);
      setTodayLog((tl) => ({
        ...tl,
        entries: tl.entries.filter((e) => e.id !== id),
      }));
    } catch (e) {
      console.error("deleteMealLog failed", e);
    }
  };

  const logWeighin = async () => {
    const w = parseFloat(wInput);
    if (!w) return;
    try {
      const row = await db.addWeighin(w);
      setWeighins((arr) => [...arr, row]);
      setWInput("");
    } catch (e) {
      console.error("weigh-in failed", e);
    }
  };

  const totals = useMemo(() => todayLog.entries.reduce(
    (a, e) => ({ cal: a.cal + (e.cal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), f: a.f + (e.f || 0) }),
    { cal: 0, p: 0, c: 0, f: 0 }
  ), [todayLog]);

  const weeklyRate = useMemo(() => {
    if (weighins.length < 2) return null;
    const first = weighins[0], last = weighins[weighins.length - 1];
    const days = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (days < 5) return null;
    return ((first.w - last.w) / days) * 7;
  }, [weighins]);

  const toggleCheck = async (itemId, day) => {
    if (viewWk !== curWk && !editPast) return;
    const key = `${itemId}|${day}`;
    const prev = !!(checksByWeek[viewWk] || {})[key];
    const next = !prev;
    setChecksByWeek((cw) => ({ ...cw, [viewWk]: { ...(cw[viewWk] || {}), [key]: next } }));
    try {
      await db.toggleCheckin(viewWk, itemId, day, next);
    } catch (e) {
      console.error("toggleCheck failed", e);
      setChecksByWeek((cw) => ({ ...cw, [viewWk]: { ...(cw[viewWk] || {}), [key]: prev } }));
    }
  };

  const adherenceFor = (wk) => {
    const ch = checksByWeek[wk] || {};
    let done = 0, total = 0;
    DEFAULT_ITEMS.forEach((it) => {
      if (it.daily) {
        DAYS.forEach((d) => { total += 1; if (ch[`${it.id}|${d}`]) done += 1; });
      } else {
        total += 3;
        const sc = DAYS.filter((d) => ch[`${it.id}|${d}`]).length;
        done += Math.min(sc, 3);
      }
    });
    return total ? Math.round((done / total) * 100) : 0;
  };

  const wkKeys = useMemo(() => {
    const ks = new Set([...Object.keys(checksByWeek), curWk]);
    return [...ks].sort();
  }, [checksByWeek, curWk]);
  const earliestWk = wkKeys[0];
  const progWeekNum = (wk) => Math.round((new Date(wk) - new Date(earliestWk)) / (7 * 86400000)) + 1;

  const trends = useMemo(() => {
    const weeks = wkKeys.filter((w) => Object.keys(checksByWeek[w] || {}).length > 0 || w === curWk);
    const n = weeks.length;
    if (n < 4) return { locked: true, n };
    const overall = weeks.map(adherenceFor);
    const half = Math.floor(n / 2);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const delta = avg(overall.slice(half)) - avg(overall.slice(0, half));
    const items = DEFAULT_ITEMS.map((it) => {
      if (it.daily) {
        let hits = 0;
        weeks.forEach((w) => { const ch = checksByWeek[w] || {}; DAYS.forEach((d) => { if (ch[`${it.id}|${d}`]) hits += 1; }); });
        return { label: it.label, pct: Math.round((hits / (7 * n)) * 100), strength: false };
      }
      let sessions = 0;
      weeks.forEach((w) => { const ch = checksByWeek[w] || {}; sessions += DAYS.filter((d) => ch[`${it.id}|${d}`]).length; });
      return { label: it.label, avgSessions: sessions / n, strength: true };
    });
    const dailyItems = items.filter((i) => !i.strength);
    const best = [...dailyItems].sort((a, b) => b.pct - a.pct)[0];
    const worst = [...dailyItems].sort((a, b) => a.pct - b.pct)[0];
    return { locked: false, n, overall, delta, items, best, worst };
  }, [wkKeys, checksByWeek]);

  if (authLoading || (user && !loaded)) {
    return (
      <Shell>
        <div style={{ padding: "40px 8px", textAlign: "center", color: T.inkSoft, fontFamily: FD, fontSize: 18 }}>
          Loading…
        </div>
      </Shell>
    );
  }

  /** Sales CTA: create account (or join/pay / intake if already signed in). */
  const goJoin = () => {
    if (!user) {
      setSignInNext("intake");
      navigate(PATHS.signin);
      return;
    }
    navigate(homePathFor({ isAdmin, approved, paid, macros, refunded }));
  };

  const backToStart = () => {
    setDeclineReason("");
    setRefundIssued(false);
    setStep(0);
    setProfile({ ...EMPTY_PROFILE });
    setMacros(null);
    setApproved(false);
    navigate(PATHS.home);
  };

  // Clients need approve + pay. Admins with an approved intake can dogfood
  // /dashboard without a Stripe payment on their own account.
  const dashboardUnlocked = canAccessDashboard({ isAdmin, approved, paid, macros, refunded });

  const clientApp = (
    <ClientApp
      tab={tab}
      setTab={setTab}
      profile={profile}
      macros={macros}
      totals={totals}
      waterOz={waterOz}
        estimateBusy={estimateBusy}
        estimate={estimate}
        analyzePhoto={analyzePhoto}
      analyzeText={analyzeText}
      confirmEstimate={confirmEstimate}
      discardEstimate={discardEstimate}
      logRecipe={logRecipe}
      logManualMeal={logManualMeal}
      todayLog={todayLog}
      deleteMealEntry={deleteMealEntry}
      viewWk={viewWk}
      setViewWk={setViewWk}
      curWk={curWk}
      editPast={editPast}
      setEditPast={setEditPast}
      checksByWeek={checksByWeek}
      toggleCheck={toggleCheck}
      adherenceFor={adherenceFor}
      progWeekNum={progWeekNum}
      earliestWk={earliestWk}
      weighins={weighins}
      wInput={wInput}
      setWInput={setWInput}
      logWeighin={logWeighin}
      weeklyRate={weeklyRate}
      trends={trends}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
    />
  );

  return (
    <Routes>
      <Route
        path={PATHS.home}
        element={(
          <SalesPage
            onStartIntake={goJoin}
            onSignIn={() => { setSignInNext("app"); navigate(PATHS.signin); }}
          />
        )}
      />

      <Route path="/home" element={<Navigate to={PATHS.dashboard} replace />} />

      <Route path={PATHS.terms} element={<TermsPage />} />

      <Route
        path={PATHS.signin}
        element={
          user
            ? <Navigate to={homePathFor({ isAdmin, approved, paid, macros, refunded })} replace />
            : (
              <SignInPage
                mode={authMode}
                onSwitchMode={switchAuthMode}
                onBack={() => navigate(PATHS.home)}
              />
            )
        }
      />

      <Route
        path={PATHS.join}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : refunded
              ? <Navigate to={PATHS.goodbye} replace />
              : paid || isAdmin
                ? <Navigate to={homePathFor({ isAdmin, approved, paid, macros, refunded })} replace />
                : <JoinPage onRefresh={refreshClientState} />
        }
      />

      <Route
        path={PATHS.welcome}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : (
              <WelcomePage
                navigate={navigate}
                onPaid={(s) => {
                  applyClientState(s);
                }}
              />
            )
        }
      />

      <Route
        path={PATHS.goodbye}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : refunded || refundIssued
              ? <GoodbyePage onBack={backToStart} />
              : <Navigate to={homePathFor({ isAdmin, approved, paid, macros, refunded })} replace />
        }
      />

      <Route
        path={PATHS.onboarding}
        element={
          !user
            ? (
              <SignInPage
                mode="create"
                onSwitchMode={switchAuthMode}
                onBack={() => navigate(PATHS.home)}
              />
            )
            : refunded && !refundIssued
              ? <Navigate to={PATHS.goodbye} replace />
              : !paid && !isAdmin && !refundIssued
                ? <Navigate to={PATHS.join} replace />
                : macros && !declineReason && !refundIssued
                  ? <Navigate to={PATHS.pending} replace />
                  : (
                    <IntakeFlow
                      profile={profile}
                      step={step}
                      setStep={setStep}
                      set={set}
                      onSubmit={submitIntake}
                      onEligibilityDecline={runEligibilityRefund}
                      refundIssued={refundIssued}
                    />
                  )
        }
      />

      <Route
        path={PATHS.declined}
        element={(
          <DeclinedPage
            declineReason={declineReason}
            onBack={backToStart}
            refundIssued={refundIssued || refunded}
          />
        )}
      />

      <Route
        path={PATHS.pending}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : refunded
              ? <Navigate to={PATHS.goodbye} replace />
              : !paid && !isAdmin
                ? <Navigate to={PATHS.join} replace />
                : dashboardUnlocked
                  ? <Navigate to={PATHS.dashboard} replace />
                  : macros
                    ? <PendingPage />
                    : <Navigate to={PATHS.onboarding} replace />
        }
      />

      <Route
        path={PATHS.dashboard}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : refunded
              ? <Navigate to={PATHS.goodbye} replace />
              : dashboardUnlocked
                ? clientApp
                : <Navigate to={homePathFor({ isAdmin, approved, paid, macros, refunded })} replace />
        }
      />

      <Route
        path={PATHS.admin}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : !isAdmin
              ? <Navigate to={dashboardUnlocked ? PATHS.dashboard : PATHS.home} replace />
              : (
                <AdminPortal
                  roster={roster}
                  setRoster={setRoster}
                  stats={adminStats}
                  adminSel={adminSel}
                  setAdminSel={setAdminSel}
                />
              )
        }
      />

      <Route path="*" element={<Navigate to={PATHS.home} replace />} />
    </Routes>
  );
}
