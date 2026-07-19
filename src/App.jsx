import { useState, useEffect, useMemo } from "react";
import { CONFIG } from "./config";
import { useAuth } from "./auth/useAuth.jsx";
import { db } from "./db/db";
import { computeMacros } from "./engine/computeMacros";
import { DEFAULT_ITEMS, DAYS } from "./content/data";
import { wkStartOf } from "./utils/dates";
import { SalesPage } from "./views/SalesPage";
import { IntakeFlow } from "./views/IntakeFlow";
import { DeclinedPage } from "./views/DeclinedPage";
import { PendingPage } from "./views/PendingPage";
import { SignInPage } from "./views/SignInPage";
import { ClientApp } from "./views/ClientApp";
import { AdminPortal } from "./admin/AdminPortal";
import { Shell } from "./components/ui";
import { T, FD } from "./theme/tokens";

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */
export default function App() {
  const { user, isAdmin, loading: authLoading, refreshProfile } = useAuth(); // Supabase magic-link auth
  const [view, setView] = useState("sales"); // sales | intake | declined | pending | app | signin
  const [signInNext, setSignInNext] = useState("intake"); // where to go after magic-link for new sessions
  const [tab, setTab] = useState("today");
  const [step, setStep] = useState(0);
  const [declineReason, setDeclineReason] = useState("");
  const [profile, setProfile] = useState({
    name: "", age: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
    breastfeeding: null, pregnant: null, goal: "lose", activity: "moderate",
    stress: "medium", insulinResistance: false, diet: "none",
    prefB: "", prefL: "", prefD: "",
  });
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
  const [roster, setRoster] = useState([]); // loads from db
  const [adminSel, setAdminSel] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoResult, setPhotoResult] = useState(null);
  const [todayLog, setTodayLog] = useState({ date: new Date().toISOString().slice(0, 10), entries: [] });
  const [loaded, setLoaded] = useState(false);

  /* Initial load — hydrate from Supabase per signed-in user / admin roster. */
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      setLoaded(false);
      try {
        if (isAdmin) {
          if (!cancelled) setRoster(await db.loadRoster());
        } else if (user) {
          const s = await db.loadClientState();
          if (cancelled || !s) return;
          if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
          if (s.macros) setMacros(s.macros);
          setApproved(!!s.approved);
          setPaid(!!s.paid);
          if (s.checksByWeek) setChecksByWeek(s.checksByWeek);
          if (s.weighins) setWeighins(s.weighins);
          if (s.todayLog && s.todayLog.date === new Date().toISOString().slice(0, 10)) setTodayLog(s.todayLog);
          // Don't clobber an in-progress intake/declined flow with sales/pending
          if (view === "sales" || view === "signin" || view === "pending" || view === "app") {
            if (s.view) setView(s.view);
          }
        }
      } catch (e) { console.error("initial load failed", e); }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, isAdmin]);

  // After magic-link lands, leave the sign-in screen (load effect sets real view next)
  useEffect(() => {
    if (!user || isAdmin || view !== "signin") return;
    if (signInNext === "intake") {
      setView("intake");
      setStep(0);
    } else {
      setView("pending");
    }
  }, [user, isAdmin, view, signInNext]);

  // Stripe success/cancel return — reload paid status
  useEffect(() => {
    if (!user || isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    window.history.replaceState({}, "", window.location.pathname);
    (async () => {
      try {
        const s = await db.loadClientState();
        if (!s) return;
        setApproved(!!s.approved);
        setPaid(!!s.paid);
        if (s.macros) setMacros(s.macros);
        if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
        if (s.view) setView(s.view);
      } catch (e) {
        console.error("post-checkout refresh failed", e);
      }
    })();
  }, [user?.id, isAdmin]);

  const refreshClientState = async () => {
    try {
      const s = await db.loadClientState();
      if (!s) return;
      if (s.profile) setProfile((prev) => ({ ...prev, ...s.profile }));
      if (s.macros) setMacros(s.macros);
      setApproved(!!s.approved);
      setPaid(!!s.paid);
      if (s.view) setView(s.view);
    } catch (e) {
      console.error("refreshClientState failed", e);
    }
  };

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  /* Gating rules — PRESERVE VERBATIM. These run BEFORE any payment. */
  const submitIntake = async () => {
    if (profile.pregnant) { setDeclineReason("pregnant"); setView("declined"); return; }
    if (profile.breastfeeding && Number(profile.monthsPP) < 6) { setDeclineReason("early"); setView("declined"); return; }
    if (profile.diet !== "none") { setDeclineReason("diet"); setView("declined"); return; }
    const m = computeMacros(profile);
    setMacros(m);
    setApproved(false);
    setPaid(false);
    try {
      await db.submitIntake(profile, m); // puts this mama in Callie's pending queue
      await refreshProfile();
    } catch (e) {
      console.error("submitIntake failed", e);
    }
    setView("pending");
  };

  const waterOz = profile.goalWeight ? Math.round(Number(profile.goalWeight) / 2) : null;

  /* Photo analysis — now proxied through /api/analyze so the
     Anthropic key stays server-side. See functions/api/analyze.js.
     The server returns the parsed JSON estimate directly. */
  const analyzePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true); setPhotoResult(null);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const resp = await fetch(CONFIG.ANALYZE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, media_type: file.type || "image/jpeg" }),
      });
      if (!resp.ok) throw new Error(`analyze failed: ${resp.status}`);
      const parsed = await resp.json();
      setPhotoResult(parsed.error ? { error: true } : parsed);
    } catch (e) {
      console.error("photo analysis failed", e);
      setPhotoResult({ error: true });
    }
    setPhotoBusy(false);
  };

  const logMeal = async () => {
    if (!photoResult || photoResult.error) return;
    const entry = {
      name: photoResult.meal,
      cal: photoResult.calories,
      p: photoResult.protein_g,
      c: photoResult.carbs_g,
      f: photoResult.fat_g,
    };
    try {
      const row = await db.addMealLog(entry);
      setTodayLog((tl) => ({
        date: new Date().toISOString().slice(0, 10),
        entries: [...tl.entries, { ...entry, id: row.id }],
      }));
    } catch (e) {
      console.error("logMeal failed", e);
    }
    setPhotoResult(null);
  };

  const clearTodayMeals = async () => {
    const date = new Date().toISOString().slice(0, 10);
    try {
      await db.clearTodayMeals(date);
      setTodayLog({ date, entries: [] });
    } catch (e) {
      console.error("clearTodayMeals failed", e);
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
    if (viewWk !== curWk && !editPast) return; // past weeks locked unless explicitly unlocked
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
        total += 3; // goal is 3 strength sessions, extra sessions are bonus
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

  if (authLoading) {
    return (
      <Shell>
        <div style={{ padding: "40px 8px", textAlign: "center", color: T.inkSoft, fontFamily: FD, fontSize: 18 }}>
          Loading…
        </div>
      </Shell>
    );
  }

  const goIntake = () => {
    if (!user) {
      setSignInNext("intake");
      setView("signin");
      return;
    }
    setView("intake");
    setStep(0);
  };

  /* ------------------------- ADMIN PORTAL ------------------------- */
  if (isAdmin) {
    return (
      <AdminPortal
        roster={roster}
        setRoster={setRoster}
        adminSel={adminSel}
        setAdminSel={setAdminSel}
      />
    );
  }

  /* ------------------------- DECLINED ----------------------------- */
  if (view === "declined") {
    return <DeclinedPage declineReason={declineReason} onBack={() => setView("sales")} />;
  }

  /* ------------------------- SIGN IN ------------------------------ */
  if (view === "signin" && !user) {
    return (
      <SignInPage
        title={signInNext === "intake" ? "Sign in to start your intake" : "Welcome back"}
        onBack={() => setView("sales")}
      />
    );
  }

  /* ------------------------- INTAKE ------------------------------- */
  if (view === "intake") {
    if (!user) {
      return (
        <SignInPage
          title="Sign in to start your intake"
          onBack={() => setView("sales")}
        />
      );
    }
    return (
      <IntakeFlow
        profile={profile}
        step={step}
        setStep={setStep}
        set={set}
        onSubmit={submitIntake}
      />
    );
  }

  /* ------------------------- CLIENT DASHBOARD / PENDING ------------ */
  // Dashboard unlocks only when Callie approved AND Stripe paid (Step 5).
  if (macros && approved && paid) {
    return (
      <ClientApp
        tab={tab}
        setTab={setTab}
        profile={profile}
        macros={macros}
        totals={totals}
        waterOz={waterOz}
        photoBusy={photoBusy}
        photoResult={photoResult}
        setPhotoResult={setPhotoResult}
        analyzePhoto={analyzePhoto}
        logMeal={logMeal}
        todayLog={todayLog}
        clearTodayMeals={clearTodayMeals}
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
  }

  if (macros || view === "pending") {
    return (
      <PendingPage
        approved={!!approved}
        onPaidRefresh={refreshClientState}
      />
    );
  }

  // Signed-in but no intake yet — back to sales
  return (
    <SalesPage
      onStartIntake={goIntake}
      onSignIn={() => { setSignInNext("app"); setView("signin"); }}
    />
  );
}
