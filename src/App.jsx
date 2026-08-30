import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { CONFIG } from "./config";
import { useAuth } from "./auth/useAuth.jsx";
import { db } from "./db/db";
import { joinPersonName } from "./lib/personName";
import { supabase } from "./lib/supabase";
import { computeMacros } from "./engine/computeMacros";
import { addDaysIso, localDateIso, planDayLabel, weekdayKey, wkStartOf } from "./utils/dates";
import { resolveLogSlot } from "./utils/mealSlots";
import {
  adherenceForWeek,
  buildMacroHistory,
  buildTrends,
  buildWaterHistory,
  weekKeysFromChecks,
} from "./utils/progressSeries";
import { programRelativeWeekNum, resolveProgramStartWeekIso } from "./lib/cohorts";
import { isBeforeGoalCreated, isFutureDayInWeek, mergeGoalItems } from "./lib/goals";
import { PATHS, canonicalPath, homePathFor, pathFromClientView, canAccessDashboard, goMarketingHome } from "./routing";
import { needsMembershipPaywall } from "./lib/membershipAccess";
import { SalesPage } from "./views/SalesPage";
import { WaitlistPage } from "./views/WaitlistPage";
import { SupportPage } from "./views/SupportPage";
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
import { OnboardingBannersPreview } from "./views/OnboardingBannersPreview";
import { Shell, Card } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { T, FD } from "./theme/tokens";
import { isStandaloneDisplay, registerMessageServiceWorker, syncAppBadge } from "./lib/push";
import { ensureMetaPixel } from "./lib/metaPixel";
import { ensureCloudflareWebAnalytics } from "./lib/cloudflareWebAnalytics";
import {
  isPublicTrackingPath,
  persistAttributionToProfile,
} from "./lib/attribution";
import { CanonicalizeTrailingSlash } from "./components/CanonicalizeTrailingSlash";
import { AdminEnrollmentRedirect } from "./components/AdminEnrollmentRedirect";
import { emailsMatch, quizJoinHref } from "./lib/quizCheckout";
import {
  clearQuizPayHandoff,
  isQuizPayHandoffActive,
  joinCheckoutDecision,
  urlQuizEmail,
} from "./auth/quizAuthHandoff";
import { signedOutJoinRedirect } from "./auth/quizSignupBounce";
import { isAdminSignupLockedSurface } from "./auth/adminSignupLock";
import { nextAuthSwitch, resolveSignInMode } from "./auth/signInMode";
import { ageFromDateOfBirth } from "./db/db";

/**
 * /signin entry: quiz Lock my spot carries ?from=quiz&email=.
 *
 * Never sign anyone out here. Supabase syncs sessions across tabs, so an older
 * tab sitting on a previous quiz email would see a brand-new signup and log it
 * out everywhere — the mama was signed out the moment her account was created.
 * A different signed-in account is handled by the explicit switch button on
 * /join instead.
 */
function SignInGate({
  authMode,
  onSwitchMode,
  onBack,
  isAdmin,
  approved,
  paid,
  macros,
  refunded,
  membershipPaywall = false,
}) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const fromQuiz = searchParams.get("from") === "quiz";

  if (authLoading) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 28 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: T.inkSoft }}>
            Loading…
          </p>
        </Card>
      </Shell>
    );
  }

  if (user) {
    const joinQuiz = fromQuiz
      ? quizJoinHref(urlQuizEmail(searchParams) || user.email)
      : null;
    const deepAccount = location.state?.from && String(location.state.from).startsWith("/account")
      ? location.state.from
      : null;
    const to = deepAccount
      || (location.state?.from === PATHS.support ? PATHS.support : null)
      || joinQuiz
      || homePathFor({ isAdmin, approved, paid, macros, refunded, membershipPaywall });
    return <Navigate to={to} replace />;
  }

  const signupLocked = isAdminSignupLockedSurface();
  return (
    <SignInPage
      mode={resolveSignInMode({
        authMode,
        search: location.search,
        from: location.state?.from,
        enrollmentOpen: CONFIG.ENROLLMENT_OPEN,
        signupLocked,
      })}
      onSwitchMode={signupLocked ? undefined : onSwitchMode}
      onBack={onBack}
      signupLocked={signupLocked}
    />
  );
}

function JoinGate({ refunded, paid, isAdmin, approved, macros, membershipPaywall, profileCreatedAt }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [probe, setProbe] = useState({ done: false, hasSession: false });
  const [handoffActive, setHandoffActive] = useState(() => isQuizPayHandoffActive());

  useEffect(() => {
    if (user) {
      clearQuizPayHandoff();
      setHandoffActive(false);
      setProbe({ done: true, hasSession: true });
      return undefined;
    }
    let cancelled = false;
    const tick = () => {
      supabase.auth.getSession()
        .then(({ data }) => {
          if (cancelled) return;
          const has = Boolean(data.session?.user);
          setProbe({ done: true, hasSession: has });
          setHandoffActive(isQuizPayHandoffActive() && !has);
        })
        .catch(() => {
          if (!cancelled) {
            setProbe({ done: true, hasSession: false });
            setHandoffActive(isQuizPayHandoffActive());
          }
        });
    };
    tick();
    const interval = setInterval(tick, 300);
    const giveUp = setTimeout(() => {
      if (!cancelled) setHandoffActive(false);
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(giveUp);
    };
  }, [user]);

  const decision = joinCheckoutDecision({
    user,
    authLoading,
    probeDone: probe.done,
    supabaseHasSession: probe.hasSession,
    handoffActive,
  });
  if (decision === "hold") {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 28 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: T.inkSoft }}>
            Opening checkout…
          </p>
        </Card>
      </Shell>
    );
  }
  if (decision === "signin") {
    const signedOutTo = signedOutJoinRedirect({
      user: null,
      authLoading: false,
      search: location.search,
    });
    return <Navigate to={signedOutTo} replace state={{ from: PATHS.join }} />;
  }
  if (refunded) return <Navigate to={PATHS.goodbye} replace />;
  if (paid || isAdmin) {
    return (
      <Navigate
        to={homePathFor({
          isAdmin,
          approved,
          paid,
          macros,
          refunded,
          membershipPaywall,
        })}
        replace
      />
    );
  }
  return <JoinPage profileCreatedAt={profileCreatedAt} />;
}

const APP_SURFACE = import.meta.env.VITE_APP_SURFACE || "combined";
const ADMIN_SURFACE_ENABLED = APP_SURFACE !== "customer";

/* Customer builds compile this import away; admin/combined builds keep it lazy. */
const AdminPortal = ADMIN_SURFACE_ENABLED
  ? lazy(() => import("./admin/AdminPortal").then((m) => ({ default: m.AdminPortal })))
  : null;

function AdminSurfaceRedirect() {
  useEffect(() => {
    const target = new URL("/admin", CONFIG.ADMIN_APP_URL);
    target.search = window.location.search;
    target.hash = window.location.hash;
    window.location.replace(target.toString());
  }, []);
  return (
    <Shell>
      <div style={{ fontFamily: FD, fontSize: 18, color: T.inkSoft, padding: "24px 0" }}>
        Opening the secure admin app…
      </div>
    </Shell>
  );
}

/* Account hub pages — lazy so marketing homepage / Safari first paint never pulls Profile+Payments. */
const AccountPage = lazy(() =>
  import("./views/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const ProfilePage = lazy(() =>
  import("./views/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const PaymentsPage = lazy(() =>
  import("./views/PaymentsPage").then((m) => ({ default: m.PaymentsPage })),
);
const MembershipGatePage = lazy(() =>
  import("./views/MembershipGatePage").then((m) => ({ default: m.MembershipGatePage })),
);
const SharePage = lazy(() =>
  import("./views/SharePage").then((m) => ({ default: m.SharePage })),
);

function AccountRouteFallback() {
  return (
    <Shell>
      <div style={{ fontFamily: FD, fontSize: 18, color: T.inkSoft, padding: "24px 0" }}>
        Loading…
      </div>
    </Shell>
  );
}

const EMPTY_PROFILE = {
  name: "", lastName: "", age: "", dateOfBirth: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
  bottleOz: 24,
  breastfeeding: null, pregnant: null, goal: "lose", activity: "moderate",
  stress: "medium", insulinResistance: false, diet: "none",
  prefB: "", prefL: "", prefD: "", prefS: "", seasonNote: "",
  allergens: [], allergenNote: "", foodAvoids: "",
  coachNote: "", coachNoteAt: null, coachNoteDismissedAt: null,
  homescreenTipDismissedAt: null,
  avatarPath: null, avatarUrl: null,
};

export default function App() {
  const {
    user,
    isAdmin,
    loading: authLoading,
    refreshProfile,
    profile: authProfile,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const signupLocked = isAdminSignupLockedSurface();
  const [signInNext, setSignInNext] = useState(() => (
    isAdminSignupLockedSurface() ? "app" : "intake"
  )); // "intake" → create; "app" → returning
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "today";
    const q = new URLSearchParams(window.location.search).get("tab");
    return ["today", "meals", "messages", "progress"].includes(q) ? q : "today";
  });
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Home Screen icon badge mirrors unread (iOS 16.4+ / supported browsers).
  useEffect(() => {
    if (!user?.id) {
      syncAppBadge(0);
      return;
    }
    syncAppBadge(unreadMessages);
  }, [user?.id, unreadMessages]);

  // Keep the push SW registered in standalone so badge updates on push work.
  useEffect(() => {
    if (!user?.id || !isStandaloneDisplay()) return undefined;
    registerMessageServiceWorker();
    return undefined;
  }, [user?.id]);

  // Meta Pixel + CF Web Analytics + UTM capture on public routes only (env-gated).
  useEffect(() => {
    ensureMetaPixel(location.pathname);
    ensureCloudflareWebAnalytics(location.pathname);
  }, [location.pathname]);

  // First-touch attribution → profiles once signed in (signup / join / welcome).
  useEffect(() => {
    if (!user?.id) return undefined;
    if (!isPublicTrackingPath(location.pathname)) return undefined;
    let cancelled = false;
    persistAttributionToProfile(user.id).catch((err) => {
      if (!cancelled) console.error("attribution persist failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, location.pathname]);

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
  const [mealFilter, setMealFilter] = useState("All meals");
  const [mealPlanMode, setMealPlanMode] = useState("default");
  const [publishedPlan, setPublishedPlan] = useState(null);
  const [weekPlanDays, setWeekPlanDays] = useState([]);
  const [weekPlanSource, setWeekPlanSource] = useState("manual");
  const [weekPlanWeekStart, setWeekPlanWeekStart] = useState(() => wkStartOf());
  const [weekPlanSaving, setWeekPlanSaving] = useState(false);
  const [weekPlanSuggestBusy, setWeekPlanSuggestBusy] = useState(false);
  const [planMealsForLogDate, setPlanMealsForLogDate] = useState([]);
  const [logFlash, setLogFlash] = useState("");
  const weekPlanSaveTimer = useRef(null);
  const weekPlanWeekRef = useRef(weekPlanWeekStart);
  weekPlanWeekRef.current = weekPlanWeekStart;
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
  const [customMeals, setCustomMeals] = useState([]);
  const [customGoals, setCustomGoals] = useState([]);
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
      return mp;
    } catch (mpErr) {
      console.warn("loadClientMealPlan failed", mpErr);
      return null;
    }
  };

  const refreshWeekPlan = async (weekStart = weekPlanWeekRef.current) => {
    const ws = weekStart || wkStartOf();
    try {
      const wp = await db.loadWeekPlan(ws);
      setWeekPlanWeekStart(ws);
      setWeekPlanDays(Array.isArray(wp.days) ? wp.days : []);
      setWeekPlanSource(wp.source || "manual");
      return wp;
    } catch (e) {
      console.warn("loadWeekPlan failed", e);
      setWeekPlanWeekStart(ws);
      setWeekPlanDays([]);
      setWeekPlanSource("manual");
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
            if (!cancelled) setCustomGoals(s.customGoals || []);
            try {
              const customs = await db.loadCustomMeals();
              if (!cancelled) setCustomMeals(customs);
            } catch (cErr) {
              console.warn("loadCustomMeals failed", cErr);
              if (!cancelled) setCustomMeals([]);
            }
            try {
              const unread = await db.countUnreadMessages(user.id, user.id);
              if (!cancelled) setUnreadMessages(unread);
            } catch (uErr) {
              console.warn("countUnreadMessages failed", uErr);
            }
            if (!cancelled) {
              try { await refreshMealPlan(user.id); } catch (e) { console.warn("refreshMealPlan failed", e); }
              try { await refreshWeekPlan(); } catch (e) { console.warn("refreshWeekPlan failed", e); }
            }
          }
        } else {
          setMacros(null);
          setApproved(false);
          setPaid(false);
          setRefunded(false);
          setMealPlanMode("default");
          setPublishedPlan(null);
          setWeekPlanDays([]);
          setWeekPlanSource("manual");
          setWeekPlanWeekStart(wkStartOf());
          setCustomMeals([]);
          setCustomGoals([]);
        }
      } catch (e) {
        console.error("initial load failed", e);
      } finally {
        // Paint the app even if admin roster is slow — roster used to block Loading forever.
        if (!cancelled) setLoaded(true);
      }
      if (!cancelled && isAdmin) {
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
    refreshWeekPlan();
  }, [tab, location.pathname, user?.id, authLoading, loaded]);

  /* Membership fields may arrive from db load or auth profile refresh. */
  const membershipProfile = {
    role: isAdmin ? "admin" : (profile?.role || authProfile?.role || "client"),
    paid: paid || !!profile?.paid || !!authProfile?.paid,
    refunded: refunded || !!profile?.refunded || !!authProfile?.refunded,
    cohort_label: profile?.cohort_label ?? authProfile?.cohort_label ?? null,
    tier: profile?.tier ?? authProfile?.tier ?? "none",
    subscription_status:
      profile?.subscription_status ?? authProfile?.subscription_status ?? null,
  };
  const membershipPaywall = needsMembershipPaywall(membershipProfile);

  /* After load / sign-in: send users from entry paths to the right home. */
  useEffect(() => {
    if (authLoading || !loaded || !user) return;
    const path = canonicalPath(location.pathname);
    const entryPaths = [PATHS.home, PATHS.signin, "/home"];
    if (!entryPaths.includes(path)) return;
    if (routedAfterLoad.current && path === PATHS.home) return;

    // Deep-links: after sign-in, return to support / account (not dashboard).
    if (path === PATHS.signin && location.state?.from === PATHS.support) {
      routedAfterLoad.current = true;
      navigate(PATHS.support, { replace: true });
      return;
    }
    if (
      path === PATHS.signin
      && location.state?.from
      && String(location.state.from).startsWith("/account")
    ) {
      routedAfterLoad.current = true;
      navigate(location.state.from, { replace: true });
      return;
    }
    if (path === PATHS.signin && location.state?.from === PATHS.membership) {
      routedAfterLoad.current = true;
      navigate(PATHS.membership, { replace: true });
      return;
    }

    // Quiz Lock my spot → /signin?from=quiz&email=…
    // Keep them on create/sign-in when another account is still signed in;
    // SignInGate signs that session out. Matching email → join with early rate.
    if (path === PATHS.signin) {
      const params = new URLSearchParams(location.search);
      if (params.get("from") === "quiz") {
        const quizEmail = urlQuizEmail(params);
        if (quizEmail && !emailsMatch(user.email, quizEmail)) return;
        routedAfterLoad.current = true;
        navigate(quizJoinHref(quizEmail || user.email), { replace: true });
        return;
      }
    }

    const dest = homePathFor({
      isAdmin,
      approved,
      paid,
      macros,
      refunded,
      membershipPaywall,
    });
    // Signed-in visitors may still browse marketing at `/` — only auto-route
    // from `/signin` and legacy `/home`. From `/`, route enrolled clients + admins.
    if (path === PATHS.home) {
      if (isAdmin || refunded || paid) {
        routedAfterLoad.current = true;
        navigate(dest, { replace: true });
      }
      return;
    }
    routedAfterLoad.current = true;
    navigate(dest, { replace: true });
  }, [authLoading, loaded, user, isAdmin, approved, paid, macros, refunded, membershipPaywall, location.pathname, location.search, location.state, navigate]);

  const authMode = signupLocked
    ? "signin"
    : signInNext === "intake" ? "create" : "signin";
  /** Toggle create/signin and keep ?auth= in sync (URL was winning over button clicks). */
  const switchAuthMode = (next) => {
    if (nextAuthSwitch(next, { signupLocked }) == null) return;
    const create = next === "create";
    setSignInNext(create ? "intake" : "app");
    const p = new URLSearchParams(location.search);
    p.set("auth", create ? "create" : "signin");
    navigate(
      { pathname: PATHS.signin, search: `?${p.toString()}` },
      { replace: true, state: location.state },
    );
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
    const derivedAge = ageFromDateOfBirth(profile.dateOfBirth);
    const forEngine = {
      ...profile,
      // Store age derived from DOB (column kept for admin/display; DOB is source of truth)
      age: derivedAge != null ? String(derivedAge) : profile.age,
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
              name: joinPersonName(forEngine.name, forEngine.lastName),
              age: forEngine.age,
              dateOfBirth: forEngine.dateOfBirth || null,
              currentWeight: forEngine.currentWeight,
              goalWeight: forEngine.goalWeight,
              breastfeeding: forEngine.breastfeeding,
              monthsPP: forEngine.monthsPP,
              pregnant: forEngine.pregnant,
              phone: forEngine.phone,
              diet: forEngine.diet,
              tastes: [forEngine.prefB, forEngine.prefL, forEngine.prefD, forEngine.prefS].filter(Boolean).join(" · "),
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

  // Keep Snap payloads small — large phone photos were timing out OpenRouter
  // and surfacing as a bare Cloudflare 502 in the UI.
  const downscaleImage = (file, max = 768) => new Promise((resolve) => {
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
        resolve(canvas.toDataURL("image/jpeg", 0.72).split(",")[1] || null);
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

  /**
   * One call to /api/estimate. Returns the parsed estimate or a friendly
   * error — it never touches shared state, so callers that must not disturb
   * the review panel (adding a food, building a recipe) can use it too.
   */
  const postEstimate = async (payload) => {
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
        return {
          error: true,
          message: parsed.message || "Too many AI estimates — try again later or log manually.",
        };
      }
      if (!resp.ok || parsed.error) {
        const code = parsed.error;
        let message;
        if (code === "not food") {
          message = payload.type === "recipe"
            ? "That didn't read like a recipe — paste the ingredient list and how many it serves."
            : "That didn't look like a meal — try another photo or describe what you ate.";
        } else if (resp.status === 404 || resp.status === 405) {
          // Plain Vite has no /api/* — need wrangler pages dev (or test on production).
          message = "Meal estimator isn’t available on this local server. Use wrangler pages dev, or try on macrosandmamas.com.";
        } else if (parsed.message) {
          message = parsed.message;
        } else if (code === "estimate unavailable" || code === "estimate failed" || resp.status >= 500) {
          message = "Couldn't reach the meal estimator right now. Try again, or use Describe.";
        } else {
          message = `Couldn't estimate that meal (${resp.status}). Try Describe, or try again.`;
        }
        return { error: true, message };
      }
      return parsed;
    } catch (e) {
      console.error("estimate failed", e);
      return {
        error: true,
        message: "Couldn't reach the meal estimator. Check your connection, or try Describe.",
      };
    }
  };

  const runEstimate = async (payload, source) => {
    setEstimateBusy(true);
    setEstimate(null);
    setEstimateSource(source);
    const result = await postEstimate(payload);
    setEstimate(result);
    setEstimateBusy(false);
    return result;
  };

  const photoPayload = async (files, note = "") => {
    const list = (Array.isArray(files) ? files : (files ? [files] : []))
      .filter(Boolean)
      .slice(0, 3);
    if (!list.length) return null;
    const images = [];
    for (const file of list) {
      const b64 = await downscaleImage(file);
      if (!b64) continue;
      images.push({ image_b64: b64, media_type: "image/jpeg" });
    }
    if (!images.length) return null;
    const description = String(note || "").trim().slice(0, 800);
    return {
      type: "photo",
      // Legacy single-image fields (first photo) + images[] for multi-photo.
      image_b64: images[0].image_b64,
      media_type: "image/jpeg",
      images,
      ...(description ? { description } : {}),
    };
  };

  const analyzePhoto = async (files, note = "") => {
    const list = (Array.isArray(files) ? files : (files ? [files] : [])).filter(Boolean);
    if (!list.length) return;
    const payload = await photoPayload(list, note);
    if (!payload) {
      setEstimate({
        error: true,
        message: "Couldn't process that image file. Try a JPG/PNG from Photo library, or use Describe.",
      });
      return;
    }
    await runEstimate(payload, "photo");
  };

  const analyzeText = async (description) => {
    if (!description?.trim()) return;
    await runEstimate({ type: "text", description: description.trim() }, "describe");
  };

  /**
   * Update a logged meal from optional photo(s) and/or a note.
   * Silent — does not open the new-meal review panel.
   * Pass currentMeal so the model treats new photos as extras/context
   * on what’s already logged, not a brand-new unrelated plate.
   */
  const estimateMealRefine = async ({ files, description, currentMeal } = {}) => {
    const list = (Array.isArray(files) ? files : (files ? [files] : []))
      .filter(Boolean)
      .slice(0, 3);
    const note = String(description || "").trim();
    const cur = currentMeal && typeof currentMeal === "object" ? currentMeal : null;
    const baseline = cur
      ? `Already logged: ${String(cur.name || "Meal").trim() || "Meal"} — ${Math.round(Number(cur.cal) || 0)} cal · P ${Math.round(Number(cur.p) || 0)}g · C ${Math.round(Number(cur.c) || 0)}g · F ${Math.round(Number(cur.f) || 0)}g.`
      : "";

    if (list.length) {
      const photoNote = [
        baseline,
        "New photo is usually additional food, a side, leftovers, or portion context on the meal above — not a totally different plate. Return one updated meal total.",
        note
          ? `Her note (additions/portions/hidden extras): """${note.slice(0, 280)}"""`
          : "No note — add what you can see onto the logged meal; don't invent a new dish.",
      ].filter(Boolean).join(" ");
      const payload = await photoPayload(list, photoNote.slice(0, 800));
      if (!payload) {
        return {
          error: true,
          message: "Couldn't process that image. Try a JPG/PNG, or describe the change instead.",
        };
      }
      return postEstimate(payload);
    }
    if (!note) {
      return { error: true, message: "Add a photo or describe what you added / changed." };
    }
    const textBody = [
      baseline,
      "Update this logged meal. Her note may add food, remove something, or change the portion — return the NEW full meal total (not only the addition).",
      `Note: """${note}"""`,
    ].filter(Boolean).join(" ");
    return postEstimate({ type: "text", description: textBody.slice(0, 1000) });
  };

  /** Batch macros + detected yield for a pasted recipe. */
  const estimateRecipe = async (text) => {
    const description = String(text || "").trim();
    if (!description) return { error: true, message: "Paste the recipe first." };
    return postEstimate({ type: "recipe", description });
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
    const slot = resolveLogSlot(entry.slot);
    try {
      const row = await db.addMealLog({ ...entry, via, slot }, date);
      syncEntryIntoWeek(date, (list) => [...list, row]);
      return true;
    } catch (e) {
      console.error("addMealLog failed", e);
      return false;
    }
  };

  const confirmEstimate = async (overrides = null, opts = {}) => {
    // Prefer explicit review-panel overrides so Save still works after a
    // failed re-estimate (estimate may be an error object or briefly null).
    const o = overrides && typeof overrides === "object" ? overrides : null;
    if (!o && (!estimate || estimate.error)) return;
    const name = o?.name ?? estimate?.meal;
    const cal = o?.cal ?? estimate?.calories;
    const p = o?.p ?? estimate?.protein_g;
    const c = o?.c ?? estimate?.carbs_g;
    const f = o?.f ?? estimate?.fat_g;
    if (name == null || String(name).trim() === "") return;
    const baseVia = estimateSource === "text" ? "describe" : (estimateSource || "photo");
    const ok = await appendMealEntry({
      name,
      cal,
      p,
      c,
      f,
      via: opts.adjusted ? "adjusted" : baseVia,
      slot: o?.slot ?? opts.slot ?? null,
      logged_date: mealLogDate,
    });
    if (!ok) return false;
    if (opts.saveCustom) {
      try {
        const saved = await db.saveCustomMeal({ name, cal, p, c, f });
        setCustomMeals((list) => {
          const without = list.filter((m) => m.id !== saved.id && m.name !== saved.name);
          return [saved, ...without];
        });
      } catch (e) {
        console.error("saveCustomMeal failed", e);
      }
    }
    setEstimate(null);
    return true;
  };

  const discardEstimate = () => setEstimate(null);

  const logRecipe = async (recipe) => {
    // Planner "Add to Today" always lands on calendar today; Today→My plan uses the selected log date.
    const date = recipe.fromPlanner
      ? localDateIso()
      : (recipe.logged_date || mealLogDate || localDateIso());
    const ok = await appendMealEntry({
      name: recipe.name,
      cal: recipe.cal,
      p: recipe.p,
      c: recipe.c,
      f: recipe.f,
      via: recipe.via || "recipe",
      slot: recipe.slot || recipe.cat || null,
      logged_date: date,
    });
    if (ok) {
      if (date !== mealLogDate) {
        selectMealLogDate(date);
      }
      // Stay on Meals / Plan / Today so mamas can keep adding more than one meal.
      setLogFlash(`Added ${recipe.name} to Today`);
      window.setTimeout(() => setLogFlash(""), 3500);
    }
    return ok;
  };

  const logManualMeal = async (entry) => {
    const ok = await appendMealEntry({
      ...entry,
      via: entry.via || "manual",
      logged_date: entry.logged_date || mealLogDate,
    });
    if (!ok) return false;
    if (entry.saveCustom) {
      try {
        const saved = await db.saveCustomMeal({
          name: entry.name,
          cal: entry.cal,
          p: entry.p,
          c: entry.c,
          f: entry.f,
          serves: entry.serves,
          ingredients: entry.ingredients,
        });
        setCustomMeals((list) => {
          const without = list.filter((m) => m.id !== saved.id && m.name !== saved.name);
          return [saved, ...without];
        });
      } catch (e) {
        console.error("saveCustomMeal failed", e);
      }
    }
    return true;
  };

  const saveCustomMeal = async (meal) => {
    try {
      const saved = await db.saveCustomMeal(meal);
      setCustomMeals((list) => {
        const without = list.filter((m) => m.id !== saved.id && m.name !== saved.name);
        return [saved, ...without];
      });
      return saved;
    } catch (e) {
      console.error("saveCustomMeal failed", e);
      return null;
    }
  };

  const deleteCustomMeal = async (id) => {
    try {
      await db.deleteCustomMeal(id);
      setCustomMeals((list) => list.filter((m) => m.id !== id));
    } catch (e) {
      console.error("deleteCustomMeal failed", e);
    }
  };

  const persistWeekPlan = async (days, source, weekStart = weekPlanWeekRef.current) => {
    const ws = weekStart || wkStartOf();
    setWeekPlanSaving(true);
    try {
      const saved = await db.saveWeekPlan(days, source, ws);
      // Only apply echo if still viewing that week
      if (weekPlanWeekRef.current === ws) {
        setWeekPlanDays(saved.days || days);
        setWeekPlanSource(saved.source || source || "manual");
      }
    } catch (e) {
      console.error("saveWeekPlan failed", e);
    } finally {
      setWeekPlanSaving(false);
    }
  };

  const flushWeekPlanSave = async () => {
    if (weekPlanSaveTimer.current) {
      window.clearTimeout(weekPlanSaveTimer.current);
      weekPlanSaveTimer.current = null;
      await persistWeekPlan(weekPlanDays, weekPlanSource, weekPlanWeekRef.current);
    }
  };

  const onWeekPlanChange = (days, source = "manual") => {
    setWeekPlanDays(days);
    setWeekPlanSource(source);
    const ws = weekPlanWeekRef.current;
    if (weekPlanSaveTimer.current) window.clearTimeout(weekPlanSaveTimer.current);
    weekPlanSaveTimer.current = window.setTimeout(() => {
      persistWeekPlan(days, source, ws);
    }, 600);
  };

  /** Flip planner week (like Today log). Future weeks start blank. */
  const changeWeekPlanWeek = async (weekStart) => {
    if (!weekStart || weekStart === weekPlanWeekRef.current) return;
    await flushWeekPlanSave();
    setWeekPlanDays([]);
    setWeekPlanSource("manual");
    setWeekPlanWeekStart(weekStart);
    await refreshWeekPlan(weekStart);
  };

  /** Meals from her week planner for the day she's viewing on Today. */
  useEffect(() => {
    let cancelled = false;
    const date = mealLogDate || localDateIso();
    const ws = wkStartOf(date);
    const dayKey = planDayLabel(date);
    (async () => {
      try {
        let days = weekPlanDays;
        if (ws !== weekPlanWeekStart) {
          const wp = await db.loadWeekPlan(ws);
          days = Array.isArray(wp?.days) ? wp.days : [];
        }
        if (cancelled) return;
        const row = (days || []).find((d) => d.day === dayKey);
        setPlanMealsForLogDate(Array.isArray(row?.meals) ? row.meals : []);
      } catch (e) {
        console.warn("plan meals for log date failed", e);
        if (!cancelled) setPlanMealsForLogDate([]);
      }
    })();
    return () => { cancelled = true; };
  }, [mealLogDate, weekPlanDays, weekPlanWeekStart]);

  const onSuggestAiWeek = async () => {
    setWeekPlanSuggestBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { error: "Sign in again to get AI suggestions." };

      const headers = {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };

      // One client retry for transient OpenRouter / edge flakes (same pattern as "tap again").
      // attempt is sent to the API so silent retries are counted in estimate_calls.
      let lastError = "Couldn’t suggest a week right now.";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const resp = await fetch("/api/meal-suggest", {
            method: "POST",
            headers,
            body: JSON.stringify({ attempt }),
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok) {
            return {
              days: data.plan?.days || [],
              summary: data.summary || data.plan?.summaryForClient || "",
              retried: attempt > 1 || !!data.retried,
            };
          }
          // Don't retry auth / payment / rate-limit / macros-required
          if (resp.status === 401 || resp.status === 403 || resp.status === 409 || resp.status === 429) {
            return {
              error: data.message || data.error || "Couldn’t suggest a week right now.",
            };
          }
          lastError = data.message || data.error || lastError;
          console.warn("meal-suggest attempt failed", { attempt, status: resp.status, lastError });
        } catch (e) {
          console.warn("meal-suggest network failed", { attempt, e });
          lastError = "Couldn’t reach week suggestions — try again or add meals by hand.";
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
      }
      return { error: typeof lastError === "string" ? lastError : "Couldn’t suggest a week right now." };
    } finally {
      setWeekPlanSuggestBusy(false);
    }
  };

  /**
   * Single-meal AI: describe one meal, 2–3 slot options, or eating-out menu picks.
   * Eating out may pass File[] as `files` (menu photos) plus remaining macros (up to 5 ranked picks).
   */
  const onMealIdea = async ({
    mode,
    slot,
    description,
    files,
    remaining,
    dayTotals,
  } = {}) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { error: "Sign in again for AI meal ideas." };

      let payload = { mode, slot, description };
      if (mode === "eating_out") {
        const photo = await photoPayload(files || [], description || "");
        if (!photo?.images?.length) {
          return { error: "Add a clear photo of the menu first." };
        }
        payload = {
          mode,
          slot,
          description: String(description || "").trim().slice(0, 400),
          images: photo.images,
          image_b64: photo.image_b64,
          media_type: photo.media_type,
          ...(remaining ? { remaining } : {}),
          ...(dayTotals ? { dayTotals } : {}),
        };
      }

      const resp = await fetch("/api/meal-idea", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          error: data.message || data.error || "Couldn’t generate a meal idea right now.",
        };
      }
      if (mode === "describe") return { meal: data.meal };
      return { meals: data.meals || [] };
    } catch (e) {
      console.error("meal-idea failed", e);
      return { error: "Couldn’t reach meal ideas — try the bank or My meals." };
    }
  };

  const onSaveFoodPrefs = async (prefs) => {
    const saved = await db.updateFoodPrefs(prefs);
    setProfile((p) => ({
      ...p,
      ...saved,
    }));
    return saved;
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

  const goalItems = useMemo(() => mergeGoalItems(customGoals), [customGoals]);

  const toggleCheck = async (itemId, day) => {
    if (viewWk !== curWk && !editPast) return;
    if (viewWk === curWk && isFutureDayInWeek(viewWk, day, localDateIso())) return;
    const goalItem = goalItems.find((g) => g.id === itemId);
    if (goalItem && isBeforeGoalCreated(goalItem, viewWk, day)) return;
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

  const addCustomGoal = async (payload) => {
    const row = await db.createCustomGoal(payload);
    setCustomGoals((prev) => [...prev, row]);
    return row;
  };

  const updateCustomGoal = async (id, payload) => {
    const row = await db.updateCustomGoal(id, payload);
    setCustomGoals((prev) => prev.map((g) => (g.id === id ? row : g)));
    return row;
  };

  const archiveCustomGoal = async (id) => {
    await db.archiveCustomGoal(id);
    setCustomGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const adherenceFor = (wk) => adherenceForWeek(checksByWeek, wk, goalItems);

  const wkKeys = useMemo(
    () => weekKeysFromChecks(checksByWeek, curWk),
    [checksByWeek, curWk],
  );
  const earliestWk = wkKeys[0];
  const programStartWeek = useMemo(
    () => resolveProgramStartWeekIso(profile?.cohort_label ?? authProfile?.cohort_label),
    [profile?.cohort_label, authProfile?.cohort_label],
  );
  const progWeekNum = (wk) => programRelativeWeekNum(wk, programStartWeek, earliestWk);

  const trends = useMemo(
    () => buildTrends(checksByWeek, curWk, goalItems),
    [checksByWeek, curWk, goalItems],
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

  const payFunnelPath = (() => {
    const here = canonicalPath(location.pathname);
    return here === PATHS.signin || here === PATHS.join;
  })();
  if (authLoading || (user && !loaded && !payFunnelPath)) {
    return (
      <Shell>
        <div style={{ padding: "40px 8px", textAlign: "center", color: T.inkSoft, fontFamily: FD, fontSize: 18 }}>
          Loading…
        </div>
      </Shell>
    );
  }

  /** Sales CTA: create account (or join/pay / intake if already signed in).
   *  When enrollment is closed, send visitors to the cohort waitlist page. */
  const goJoin = () => {
    if (!CONFIG.ENROLLMENT_OPEN) {
      navigate(PATHS.waitlist);
      return;
    }
    if (!user) {
      setSignInNext("intake");
      navigate(`${PATHS.signin}?auth=create`);
      return;
    }
    navigate(homePathFor({
      isAdmin,
      approved,
      paid,
      macros,
      refunded,
      membershipPaywall,
    }));
  };

  const backToStart = () => {
    setStep(0);
    setProfile({ ...EMPTY_PROFILE });
    setMacros(null);
    setApproved(false);
    goMarketingHome();
  };

  // Clients need approve + pay. Admins with an approved intake can dogfood
  // /dashboard without a Stripe payment on their own account.
  const dashboardUnlocked = canAccessDashboard({
    isAdmin,
    approved,
    paid,
    macros,
    refunded,
    membershipPaywall,
  });

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
      goalItems={goalItems}
      onAddCustomGoal={addCustomGoal}
      onUpdateCustomGoal={updateCustomGoal}
      onArchiveCustomGoal={archiveCustomGoal}
      adherenceFor={adherenceFor}
      progWeekNum={progWeekNum}
      earliestWk={earliestWk}
      programStartWeek={programStartWeek}
      weighins={weighins}
      logWeighin={logWeighin}
      deleteWeighin={deleteWeighin}
      weeklyRate={weeklyRate}
      trends={trends}
      macroHistory={macroHistory}
      waterHistory={waterHistory}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
      mealPlanMode={mealPlanMode}
      publishedPlan={publishedPlan}
      customMeals={customMeals}
      onSaveCustomMeal={saveCustomMeal}
      onDeleteCustomMeal={deleteCustomMeal}
      onEstimateRefine={estimateMealRefine}
      onEstimateRecipe={estimateRecipe}
      weekPlanDays={weekPlanDays}
      weekPlanSource={weekPlanSource}
      weekPlanWeekStart={weekPlanWeekStart}
      weekPlanSaving={weekPlanSaving}
      weekPlanSuggestBusy={weekPlanSuggestBusy}
      planMealsForLogDate={planMealsForLogDate}
      logFlash={logFlash}
      onWeekPlanChange={onWeekPlanChange}
      onChangeWeekPlanWeek={changeWeekPlanWeek}
      onSuggestAiWeek={onSuggestAiWeek}
      onMealIdea={onMealIdea}
      onSaveFoodPrefs={onSaveFoodPrefs}
      onHomescreenTipDismissed={(at) => {
        setProfile((p) => ({ ...p, homescreenTipDismissedAt: at }));
      }}
      userId={user?.id || null}
      unreadMessages={unreadMessages}
      onUnreadMessagesChange={setUnreadMessages}
    />
  );

  return (
    <AdminEnrollmentRedirect>
      <CanonicalizeTrailingSlash />
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
      {import.meta.env.DEV ? (
        <Route path="/dev/onboarding-banners" element={<OnboardingBannersPreview />} />
      ) : null}

      <Route path={PATHS.terms} element={<TermsPage />} />
      <Route path={PATHS.privacy} element={<PrivacyPage />} />
      <Route path={PATHS.resetPassword} element={<ResetPasswordPage />} />
      <Route path={PATHS.waitlist} element={<WaitlistPage />} />
      <Route
        path={PATHS.support}
        element={
          authLoading
            ? (
              <Shell>
                <div style={{ fontFamily: FD, fontSize: 18, color: T.inkSoft, padding: "24px 0" }}>
                  Loading…
                </div>
              </Shell>
            )
            : !user
              ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.support }} />
              : <SupportPage />
        }
      />

      <Route
        path={PATHS.account}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.account }} />
            : (
              <Suspense fallback={<AccountRouteFallback />}>
                <AccountPage />
              </Suspense>
            )
        }
      />
      <Route
        path={PATHS.accountProfile}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountProfile }} />
            : (
              <Suspense fallback={<AccountRouteFallback />}>
                <ProfilePage
                  onProfileSaved={(saved) => {
                    if (saved) setProfile((prev) => ({ ...prev, ...saved }));
                  }}
                />
              </Suspense>
            )
        }
      />
      <Route
        path={PATHS.accountPayments}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountPayments }} />
            : (
              <Suspense fallback={<AccountRouteFallback />}>
                <PaymentsPage />
              </Suspense>
            )
        }
      />
      <Route
        path={PATHS.membership}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.membership }} />
            : (
              <Suspense fallback={<AccountRouteFallback />}>
                <MembershipGatePage />
              </Suspense>
            )
        }
      />
      <Route
        path={PATHS.accountShare}
        element={
          !user
            ? <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountShare }} />
            : membershipPaywall
              ? <Navigate to={PATHS.membership} replace />
              : (
                <Suspense fallback={<AccountRouteFallback />}>
                  <SharePage />
                </Suspense>
              )
        }
      />

      <Route
        path={PATHS.signin}
        element={
          <SignInGate
            authMode={authMode}
            onSwitchMode={switchAuthMode}
            onBack={goMarketingHome}
            isAdmin={isAdmin}
            approved={approved}
            paid={paid}
            macros={macros}
            refunded={refunded}
            membershipPaywall={membershipPaywall}
          />
        }
      />

      <Route
        path={PATHS.join}
        element={(
          <JoinGate
            refunded={refunded}
            paid={paid}
            isAdmin={isAdmin}
            approved={approved}
            macros={macros}
            membershipPaywall={membershipPaywall}
            profileCreatedAt={profile?.createdAt || null}
          />
        )}
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
              : (
                <Navigate
                  to={homePathFor({
                    isAdmin,
                    approved,
                    paid,
                    macros,
                    refunded,
                    membershipPaywall,
                  })}
                  replace
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
                mode={signupLocked ? "signin" : "create"}
                onSwitchMode={signupLocked ? undefined : switchAuthMode}
                onBack={goMarketingHome}
                signupLocked={signupLocked}
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
                      setProfile={setProfile}
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
              : membershipPaywall
                ? <Navigate to={PATHS.membership} replace />
                : dashboardUnlocked
                  ? clientApp
                  : (
                    <Navigate
                      to={homePathFor({
                        isAdmin,
                        approved,
                        paid,
                        macros,
                        refunded,
                        membershipPaywall,
                      })}
                      replace
                    />
                  )
        }
      />

      <Route
        path={PATHS.admin}
        element={
          !ADMIN_SURFACE_ENABLED
            ? <AdminSurfaceRedirect />
            : !user
            ? <Navigate to={PATHS.signin} replace />
            : !isAdmin
              ? <Navigate to={dashboardUnlocked ? PATHS.dashboard : PATHS.home} replace />
              : (
                <ErrorBoundary
                  name="AdminPortal"
                  title="Admin couldn’t load"
                  message="The coach portal hit an error. Clients are unaffected — refresh or open My dashboard."
                >
                  <Suspense
                    fallback={(
                      <Shell>
                        <div style={{ fontFamily: FD, fontSize: 18, color: T.inkSoft, padding: "24px 0" }}>
                          Loading admin…
                        </div>
                      </Shell>
                    )}
                  >
                    <AdminPortal
                      roster={roster}
                      setRoster={setRoster}
                      stats={adminStats}
                      adminSel={adminSel}
                      setAdminSel={setAdminSel}
                    />
                  </Suspense>
                </ErrorBoundary>
              )
        }
      />

      <Route path="*" element={<Navigate to={PATHS.home} replace />} />
      </Routes>
    </AdminEnrollmentRedirect>
  );
}
