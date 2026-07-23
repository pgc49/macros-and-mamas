import { useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { CONFIG } from "./config";
import { useAuth } from "./auth/useAuth.jsx";
import { db } from "./db/db";
import { supabase } from "./lib/supabase";
import { computeMacros } from "./engine/computeMacros";
import { addDaysIso, localDateIso, weekdayKey, wkStartOf } from "./utils/dates";
import {
  adherenceForWeek,
  buildHabitHistory,
  buildMacroHistory,
  buildTrends,
  buildWaterHistory,
  progWeekNum as weekNumberFromEarliest,
  weekKeysFromChecks,
} from "./utils/progressSeries";
import { PATHS, homePathFor, pathFromClientView, canAccessDashboard } from "./routing";
import { SalesPage } from "./views/SalesPage";
import { IntakeFlow } from "./views/IntakeFlow";
import { PendingPage } from "./views/PendingPage";
import { JoinPage } from "./views/JoinPage";
import { WelcomePage } from "./views/WelcomePage";
import { GoodbyePage } from "./views/GoodbyePage";
import { SignInPage } from "./views/SignInPage";
import { ResetPasswordPage } from "./views/ResetPasswordPage";
import { TermsPage } from "./views/TermsPage";
import { PrivacyPage } from "./views/PrivacyPage";
import { ClientApp } from "./views/ClientApp";
import { AdminPortal } from "./admin/AdminPortal";
import { Shell } from "./components/ui";
import { T, FD } from "./theme/tokens";

const EMPTY_PROFILE = {
  name: "", age: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
  bottleOz: 24,
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
  const [profile, setProfile] = useState(() => ({ ...EMPTY_PROFILE }));
  const [macros, setMacros] = useState(null);
  const [approved, setApproved] = useState(false);
  const [paid, setPaid] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const curWk = wkStartOf();
  const [checksByWeek, setChecksByWeek] = useState({});
  const [viewWk, setViewWk] = useState(curWk);
  const [editPast, setEditPast] = useState(false);
  const [weighins, setWeighins] = useState([]);
  const [mealFilter, setMealFilter] = useState("Breakfast");
  const [mealPlanMode, setMealPlanMode] = useState("default");
  const [publishedPlan, setPublishedPlan] = useState(null);
  const [roster, setRoster] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminSel, setAdminSel] = useState(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [estimateSource, setEstimateSource] = useState("photo");
  const [todayLog, setTodayLog] = useState({ date: localDateIso(), entries: [] });
  const [mealLogDate, setMealLogDate] = useState(() => localDateIso());
  const [mealLogWeekStart, setMealLogWeekStart] = useState(() => wkStartOf());
  const [mealLogsByDate, setMealLogsByDate] = useState({});
  const [mealHistoryByDate, setMealHistoryByDate] = useState({});
  const [waterLogsByDate, setWaterLogsByDate] = useState({});
  const [waterBusy, setWaterBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const routedAfterLoad = useRef(false);

  const refreshMealPlan = async (uid = user?.id) => {
    if (!uid) {
      setMealPlanMode("default");
      setPublishedPlan(null);
      return null;
    }
    try {
      const mp = await db.loadClientMealPlan(uid);
      const personalized = mp.mode === "personalized" && Array.isArray(mp.published?.days) && mp.published.days.length > 0;
      setMealPlanMode(personalized ? "personalized" : "default");
      setPublishedPlan(personalized ? mp.published : null);
      if (personalized) setMealFilter("By Day");
      return mp;
    } catch (mpErr) {
      console.warn("loadClientMealPlan failed", mpErr);
      return null;
    }
  };

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
            if (s.todayLog && s.todayLog.date === localDateIso()) {
              setTodayLog(s.todayLog);
              setMealLogDate(s.todayLog.date);
            } else {
              const today = localDateIso();
              setTodayLog({ date: today, entries: [] });
              setMealLogDate(today);
            }
            if (s.mealLogsByDate) setMealLogsByDate(s.mealLogsByDate);
            if (s.mealLogWeekStart) setMealLogWeekStart(s.mealLogWeekStart);
            if (s.mealHistoryByDate) setMealHistoryByDate(s.mealHistoryByDate);
            if (s.waterLogsByDate) setWaterLogsByDate(s.waterLogsByDate);
            else {
              try {
                const weekStart = s.mealLogWeekStart || wkStartOf();
                const water = await db.loadWaterLogsWeek(weekStart);
                if (!cancelled) setWaterLogsByDate(water.byDate || {});
              } catch (wErr) {
                console.warn("loadWaterLogsWeek failed", wErr);
              }
            }
            if (!cancelled) await refreshMealPlan(user.id);
          }
        } else {
          setMacros(null);
          setApproved(false);
          setPaid(false);
          setRefunded(false);
          setMealPlanMode("default");
          setPublishedPlan(null);
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

  /* Re-fetch published plan when opening dashboard / Meals (Admin → My dashboard). */
  useEffect(() => {
    if (!user?.id || authLoading || !loaded) return;
    if (location.pathname !== PATHS.dashboard) return;
    refreshMealPlan(user.id);
  }, [location.pathname, user?.id, authLoading, loaded]);

  useEffect(() => {
    if (!user?.id || authLoading || !loaded) return;
    if (location.pathname !== PATHS.dashboard) return;
    if (tab !== "meals") return;
    refreshMealPlan(user.id);
  }, [tab, location.pathname, user?.id, authLoading, loaded]);

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

  /* No auto-deny / auto-refund. Pregnant & early postpartum flag in admin for Callie. */
  const submitIntake = async () => {
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
              pregnant: forEngine.pregnant,
              phone: forEngine.phone,
              diet: forEngine.diet,
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
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1] || null);
      } catch (e) {
        console.error("downscaleImage failed", e);
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
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
      if (resp.status === 429) {
        setEstimate({
          error: true,
          message: parsed.message || "Too many AI estimates — try again later or log manually.",
        });
      } else if (!resp.ok || parsed.error) {
        const code = parsed.error;
        let message;
        if (code === "not food") {
          message = "That didn't look like a meal — try another photo or describe what you ate.";
        } else if (resp.status === 404 || resp.status === 405) {
          // Plain Vite has no /api/* — need wrangler pages dev (or test on production).
          message = "Meal estimator isn’t available on this local server. Use wrangler pages dev, or try on macrosandmamas.com.";
        } else if (code === "estimate unavailable" || code === "estimate failed") {
          message = "Couldn't reach the meal estimator right now. Try again, or use Describe.";
        } else if (parsed.message) {
          message = parsed.message;
        } else {
          message = `Couldn't estimate that meal (${resp.status}). Try Describe, or try again.`;
        }
        setEstimate({ error: true, message });
      } else setEstimate(parsed);
    } catch (e) {
      console.error("estimate failed", e);
      setEstimate({
        error: true,
        message: "Couldn't reach the meal estimator. Check your connection, or try Describe.",
      });
    }
    setEstimateBusy(false);
  };

  const analyzePhoto = async (file, note = "") => {
    if (!file) return;
    const b64 = await downscaleImage(file);
    if (!b64) {
      setEstimate({
        error: true,
        message: "Couldn't process that image file. Try a JPG/PNG from Photo library, or use Describe.",
      });
      return;
    }
    const description = String(note || "").trim().slice(0, 400);
    await runEstimate(
      {
        type: "photo",
        image_b64: b64,
        media_type: "image/jpeg",
        ...(description ? { description } : {}),
      },
      "photo",
    );
  };

  const analyzeText = async (description) => {
    if (!description?.trim()) return;
    await runEstimate({ type: "text", description: description.trim() }, "describe");
  };

  const applyDayFromCache = (date, byDate) => {
    setMealLogDate(date);
    setTodayLog({ date, entries: byDate[date] || [] });
  };

  const selectMealLogDate = (date) => {
    if (!date) return;
    setEstimate(null);
    const ws = wkStartOf(new Date(`${date}T12:00:00`));
    if (ws !== mealLogWeekStart) {
      changeMealWeek(ws, date);
      return;
    }
    applyDayFromCache(date, mealLogsByDate);
  };

  const changeMealWeek = async (weekStart, preferDate) => {
    setMealLogWeekStart(weekStart);
    setEstimate(null);
    try {
      const [{ byDate }, water] = await Promise.all([
        db.loadMealLogsWeek(weekStart),
        db.loadWaterLogsWeek(weekStart),
      ]);
      setMealLogsByDate(byDate);
      setMealHistoryByDate((prev) => ({ ...prev, ...byDate }));
      setWaterLogsByDate((prev) => ({ ...prev, ...(water.byDate || {}) }));
      const today = localDateIso();
      let nextDate = preferDate;
      if (!nextDate || nextDate < weekStart || nextDate > addDaysIso(weekStart, 6)) {
        // Prefer today when this is the current week; otherwise Monday of that week.
        nextDate = today >= weekStart && today <= addDaysIso(weekStart, 6) ? today : weekStart;
      }
      if (nextDate > today) nextDate = today;
      applyDayFromCache(nextDate, byDate);
    } catch (e) {
      console.error("loadMealLogsWeek failed", e);
      setMealLogsByDate({});
      const today = localDateIso();
      const fallback = preferDate && preferDate <= today ? preferDate : weekStart;
      applyDayFromCache(fallback > today ? today : fallback, {});
    }
  };

  const maybeAutoCheckWater = async (date, dayTotal, goal) => {
    if (!goal || dayTotal < goal) return;
    const weekStart = wkStartOf(date);
    const day = weekdayKey(date);
    const key = `water|${day}`;
    const already = !!(checksByWeek[weekStart] || {})[key];
    if (already) return;
    setChecksByWeek((cw) => ({
      ...cw,
      [weekStart]: { ...(cw[weekStart] || {}), [key]: true },
    }));
    try {
      await db.toggleCheckin(weekStart, "water", day, true);
    } catch (e) {
      console.error("auto-check water failed", e);
    }
  };

  const addWater = async (oz) => {
    const date = mealLogDate || localDateIso();
    setWaterBusy(true);
    try {
      const row = await db.addWaterLog(oz, date);
      const prevList = waterLogsByDate[date] || [];
      const list = [...prevList, row];
      const dayTotal = list.reduce((s, e) => s + (Number(e.oz) || 0), 0);
      setWaterLogsByDate((prev) => ({ ...prev, [date]: list }));
      await maybeAutoCheckWater(date, dayTotal, waterOz);
    } catch (e) {
      console.error("addWater failed", e);
    }
    setWaterBusy(false);
  };

  const undoWater = async () => {
    const date = mealLogDate || localDateIso();
    setWaterBusy(true);
    try {
      const id = await db.undoLastWaterLog(date);
      if (id) {
        setWaterLogsByDate((prev) => {
          const list = prev[date] || [];
          // Remove last by created_at / id
          const next = list.filter((e) => e.id !== id);
          const nextMap = { ...prev };
          if (!next.length) delete nextMap[date];
          else nextMap[date] = next;
          return nextMap;
        });
      }
    } catch (e) {
      console.error("undoWater failed", e);
    }
    setWaterBusy(false);
  };

  const changeBottleOz = async (oz) => {
    try {
      const n = await db.updateBottleOz(oz);
      setProfile((p) => ({ ...p, bottleOz: n }));
    } catch (e) {
      console.error("updateBottleOz failed", e);
    }
  };

  const syncEntryIntoWeek = (date, updater) => {
    setMealLogsByDate((prev) => {
      const list = prev[date] || [];
      const nextList = updater(list);
      const next = { ...prev };
      if (!nextList.length) delete next[date];
      else next[date] = nextList;
      return next;
    });
    setMealHistoryByDate((prev) => {
      const list = prev[date] || [];
      const nextList = updater(list);
      const next = { ...prev };
      if (!nextList.length) delete next[date];
      else next[date] = nextList;
      return next;
    });
    setTodayLog((tl) => {
      if (tl.date !== date) return tl;
      return { date, entries: updater(tl.entries) };
    });
  };

  const appendMealEntry = async (entry) => {
    const date = entry.logged_date || mealLogDate || localDateIso();
    const via = entry.via || (entry.source === "text" ? "describe" : entry.source) || "manual";
    try {
      const row = await db.addMealLog({ ...entry, via }, date);
      syncEntryIntoWeek(date, (list) => [...list, row]);
      return true;
    } catch (e) {
      console.error("addMealLog failed", e);
      return false;
    }
  };

  const confirmEstimate = async (overrides = null, opts = {}) => {
    if (!estimate || estimate.error) return;
    const name = overrides?.name ?? estimate.meal;
    const cal = overrides?.cal ?? estimate.calories;
    const p = overrides?.p ?? estimate.protein_g;
    const c = overrides?.c ?? estimate.carbs_g;
    const f = overrides?.f ?? estimate.fat_g;
    const baseVia = estimateSource === "text" ? "describe" : estimateSource;
    await appendMealEntry({
      name,
      cal,
      p,
      c,
      f,
      via: opts.adjusted ? "adjusted" : baseVia,
      logged_date: mealLogDate,
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
      via: "recipe",
      logged_date: mealLogDate,
    });
    if (ok) setTab("today");
  };

  const logManualMeal = async (entry) => {
    await appendMealEntry({
      ...entry,
      via: entry.via || "manual",
      logged_date: entry.logged_date || mealLogDate,
    });
  };

  const updateMealEntry = async (id, patch) => {
    if (!id) return;
    try {
      const row = await db.updateMealLog(id, patch);
      const date = mealLogDate;
      syncEntryIntoWeek(date, (list) => list.map((e) => (e.id === id ? { ...e, ...row } : e)));
    } catch (e) {
      console.error("updateMealLog failed", e);
    }
  };

  const deleteMealEntry = async (id) => {
    if (!id) return;
    try {
      await db.deleteMealLog(id);
      const date = mealLogDate;
      syncEntryIntoWeek(date, (list) => list.filter((e) => e.id !== id));
    } catch (e) {
      console.error("deleteMealLog failed", e);
    }
  };

  const logWeighin = async (weight, date = localDateIso()) => {
    const w = typeof weight === "number" ? weight : parseFloat(weight);
    if (!w) return;
    try {
      const row = await db.addWeighin(w, date);
      setWeighins((arr) => {
        const without = arr.filter((x) => x.date !== row.date);
        return [...without, row].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
    } catch (e) {
      console.error("weigh-in failed", e);
    }
  };

  const deleteWeighin = async (date) => {
    if (!date) return;
    try {
      await db.deleteWeighin(date);
      setWeighins((arr) => arr.filter((x) => x.date !== date));
    } catch (e) {
      console.error("delete weigh-in failed", e);
    }
  };

  const totals = useMemo(() => todayLog.entries.reduce(
    (a, e) => ({ cal: a.cal + (e.cal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), f: a.f + (e.f || 0) }),
    { cal: 0, p: 0, c: 0, f: 0 }
  ), [todayLog]);

  const weeklyRate = useMemo(() => {
    // Dedupe by date (newest wins) before rate math — same-day doubles break the chart.
    const byDate = new Map();
    weighins.forEach((x) => byDate.set(x.date, x.w));
    const series = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, w]) => ({ date, w }));
    if (series.length < 2) return null;
    const first = series[0], last = series[series.length - 1];
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

  const adherenceFor = (wk) => adherenceForWeek(checksByWeek, wk);

  const wkKeys = useMemo(
    () => weekKeysFromChecks(checksByWeek, curWk),
    [checksByWeek, curWk],
  );
  const earliestWk = wkKeys[0];
  const progWeekNum = (wk) => weekNumberFromEarliest(wk, earliestWk);

  const trends = useMemo(
    () => buildTrends(checksByWeek, curWk),
    [checksByWeek, curWk],
  );

  /** Daily macro totals for Progress charts (logged days only, last ~28 days). */
  const macroHistory = useMemo(
    () => buildMacroHistory(mealHistoryByDate),
    [mealHistoryByDate],
  );

  /** Daily water totals for Progress chart. */
  const waterHistory = useMemo(
    () => buildWaterHistory(waterLogsByDate, waterOz),
    [waterLogsByDate, waterOz],
  );

  /** Weekly habit adherence series for Progress chart. */
  const habitHistory = useMemo(
    () => buildHabitHistory(checksByWeek, curWk),
    [checksByWeek, curWk],
  );

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
      mealLogDate={mealLogDate}
      mealLogWeekStart={mealLogWeekStart}
      mealLogsByDate={mealLogsByDate}
      selectMealLogDate={selectMealLogDate}
      changeMealWeek={changeMealWeek}
      waterLogsByDate={waterLogsByDate}
      waterBusy={waterBusy}
      onAddWater={addWater}
      onUndoWater={undoWater}
      onChangeBottleOz={changeBottleOz}
      updateMealEntry={updateMealEntry}
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
      logWeighin={logWeighin}
      deleteWeighin={deleteWeighin}
      weeklyRate={weeklyRate}
      trends={trends}
      macroHistory={macroHistory}
      habitHistory={habitHistory}
      waterHistory={waterHistory}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
      mealPlanMode={mealPlanMode}
      publishedPlan={publishedPlan}
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
      <Route path={PATHS.privacy} element={<PrivacyPage />} />
      <Route path={PATHS.resetPassword} element={<ResetPasswordPage />} />

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
            : refunded
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
            : refunded
              ? <Navigate to={PATHS.goodbye} replace />
              : !paid && !isAdmin
                ? <Navigate to={PATHS.join} replace />
                : macros
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
        element={<Navigate to={PATHS.onboarding} replace />}
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
