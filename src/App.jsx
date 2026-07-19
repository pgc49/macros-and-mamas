import { useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { CONFIG } from "./config";
import { useAuth } from "./auth/useAuth.jsx";
import { db } from "./db/db";
import { supabase } from "./lib/supabase";
import { computeMacros } from "./engine/computeMacros";
import { DEFAULT_ITEMS, DAYS } from "./content/data";
import { wkStartOf } from "./utils/dates";
import { PATHS, homePathFor, pathFromClientView } from "./routing";
import { SalesPage } from "./views/SalesPage";
import { IntakeFlow } from "./views/IntakeFlow";
import { DeclinedPage } from "./views/DeclinedPage";
import { PendingPage } from "./views/PendingPage";
import { SignInPage } from "./views/SignInPage";
import { ClientApp } from "./views/ClientApp";
import { AdminPortal } from "./admin/AdminPortal";
import { Shell } from "./components/ui";
import { T, FD } from "./theme/tokens";

const EMPTY_PROFILE = {
  name: "", age: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
  breastfeeding: null, pregnant: null, goal: "lose", activity: "moderate",
  stress: "medium", insulinResistance: false, diet: "none",
  prefB: "", prefL: "", prefD: "",
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
  const curWk = wkStartOf();
  const [checksByWeek, setChecksByWeek] = useState({});
  const [viewWk, setViewWk] = useState(curWk);
  const [editPast, setEditPast] = useState(false);
  const [weighins, setWeighins] = useState([]);
  const [wInput, setWInput] = useState("");
  const [mealFilter, setMealFilter] = useState("All");
  const [roster, setRoster] = useState([]);
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
          if (s?.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
          if (s?.macros) setMacros(s.macros);
          else setMacros(null);
          setApproved(!!s?.approved);
          setPaid(!!s?.paid);
          if (s?.checksByWeek) setChecksByWeek(s.checksByWeek);
          if (s?.weighins) setWeighins(s.weighins);
          if (s?.todayLog && s.todayLog.date === new Date().toISOString().slice(0, 10)) {
            setTodayLog(s.todayLog);
          } else {
            setTodayLog({ date: new Date().toISOString().slice(0, 10), entries: [] });
          }
        } else {
          setMacros(null);
          setApproved(false);
          setPaid(false);
        }
        if (isAdmin) {
          const r = await db.loadRoster();
          if (!cancelled) setRoster(r);
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

    const dest = homePathFor({ isAdmin, approved, paid, macros });
    // Signed-in visitors may still browse marketing at `/` — only auto-route
    // from `/signin` and legacy `/home`. From `/`, route approved clients + admins.
    if (location.pathname === PATHS.home) {
      if (isAdmin || (macros && approved && paid)) {
        routedAfterLoad.current = true;
        navigate(dest, { replace: true });
      }
      return;
    }
    routedAfterLoad.current = true;
    navigate(dest, { replace: true });
  }, [authLoading, loaded, user, isAdmin, approved, paid, macros, location.pathname, navigate]);

  const authMode = signInNext === "intake" ? "create" : "signin";
  const switchAuthMode = (next) => {
    setSignInNext(next === "create" ? "intake" : "app");
  };

  // Stripe return — reload paid status, then land on dashboard or pending
  useEffect(() => {
    if (!user || authLoading || !loaded) return;
    const params = new URLSearchParams(location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
    (async () => {
      try {
        const s = await db.loadClientState();
        if (!s) return;
        setApproved(!!s.approved);
        setPaid(!!s.paid);
        if (s.macros) setMacros(s.macros);
        if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
        navigate(pathFromClientView(s.view), { replace: true });
      } catch (e) {
        console.error("post-checkout refresh failed", e);
      }
    })();
  }, [user?.id, authLoading, loaded, location.search]);

  const refreshClientState = async () => {
    try {
      const s = await db.loadClientState();
      if (!s) return;
      if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
      if (s.macros) setMacros(s.macros);
      setApproved(!!s.approved);
      setPaid(!!s.paid);
      navigate(pathFromClientView(s.view), { replace: true });
    } catch (e) {
      console.error("refreshClientState failed", e);
    }
  };

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  /* Gating rules — PRESERVE VERBATIM. These run BEFORE any payment. */
  const submitIntake = async () => {
    if (profile.pregnant) { setDeclineReason("pregnant"); navigate(PATHS.declined); return; }
    if (profile.breastfeeding && Number(profile.monthsPP) < 6) { setDeclineReason("early"); navigate(PATHS.declined); return; }
    if (profile.diet !== "none") { setDeclineReason("diet"); navigate(PATHS.declined); return; }
    const m = computeMacros(profile);
    setMacros(m);
    setApproved(false);
    setPaid(false);
    try {
      await db.submitIntake(profile, m);
      await refreshProfile();
    } catch (e) {
      console.error("submitIntake failed", e);
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

  const goOnboarding = () => {
    if (!user) {
      setSignInNext("intake");
      navigate(PATHS.signin);
      return;
    }
    setStep(0);
    navigate(PATHS.onboarding);
  };

  const backToStart = () => {
    setDeclineReason("");
    setStep(0);
    setProfile({ ...EMPTY_PROFILE });
    setMacros(null);
    setApproved(false);
    setPaid(false);
    navigate(PATHS.home);
  };

  const dashboardUnlocked = !!(macros && approved && paid);

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
      setEstimate={setEstimate}
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
            onStartIntake={goOnboarding}
            onSignIn={() => { setSignInNext("app"); navigate(PATHS.signin); }}
          />
        )}
      />

      <Route path="/home" element={<Navigate to={PATHS.dashboard} replace />} />

      <Route
        path={PATHS.signin}
        element={
          user
            ? <Navigate to={homePathFor({ isAdmin, approved, paid, macros })} replace />
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
            : macros && !declineReason
              ? <Navigate to={PATHS.pending} replace />
              : (
                <IntakeFlow
                  profile={profile}
                  step={step}
                  setStep={setStep}
                  set={set}
                  onSubmit={submitIntake}
                />
              )
        }
      />

      <Route
        path={PATHS.declined}
        element={<DeclinedPage declineReason={declineReason} onBack={backToStart} />}
      />

      <Route
        path={PATHS.pending}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : dashboardUnlocked
              ? <Navigate to={PATHS.dashboard} replace />
              : macros
                ? <PendingPage approved={!!approved} onPaidRefresh={refreshClientState} />
                : <Navigate to={PATHS.onboarding} replace />
        }
      />

      <Route
        path={PATHS.dashboard}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace />
            : dashboardUnlocked
              ? clientApp
              : <Navigate to={macros ? PATHS.pending : PATHS.onboarding} replace />
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
