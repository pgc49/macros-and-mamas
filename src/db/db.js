import { supabase } from "../lib/supabase";
import { DEFAULT_ITEMS, DAYS } from "../content/data";
import { wkStartOf } from "../utils/dates";

/* ------------------------------------------------------------------ */
/*  DATA LAYER — per-event Supabase writes (not blob persistence)      */
/*  Tables (RLS on all):                                               */
/*    profiles, macros, checkins, weighins, meal_logs                  */
/* ------------------------------------------------------------------ */

function profileToRow(p) {
  return {
    name: p.name || null,
    age: p.age === "" || p.age == null ? null : Number(p.age),
    phone: p.phone || null,
    current_weight: p.currentWeight === "" || p.currentWeight == null ? null : Number(p.currentWeight),
    goal_weight: p.goalWeight === "" || p.goalWeight == null ? null : Number(p.goalWeight),
    months_pp: p.monthsPP === "" || p.monthsPP == null ? null : Number(p.monthsPP),
    breastfeeding: p.breastfeeding,
    pregnant: p.pregnant,
    goal: p.goal || null,
    activity: p.activity || null,
    stress: p.stress || null,
    insulin_resistance: !!p.insulinResistance,
    diet: p.diet || null,
    pref_b: p.prefB || null,
    pref_l: p.prefL || null,
    pref_d: p.prefD || null,
    season_note: p.seasonNote?.trim() ? p.seasonNote.trim() : null,
  };
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    name: row.name || "",
    age: row.age != null ? String(row.age) : "",
    phone: row.phone || "",
    currentWeight: row.current_weight != null ? String(row.current_weight) : "",
    goalWeight: row.goal_weight != null ? String(row.goal_weight) : "",
    monthsPP: row.months_pp != null ? String(row.months_pp) : "",
    breastfeeding: row.breastfeeding,
    pregnant: row.pregnant,
    goal: row.goal || "lose",
    activity: row.activity || "moderate",
    stress: row.stress || "medium",
    insulinResistance: !!row.insulin_resistance,
    diet: row.diet || "none",
    prefB: row.pref_b || "",
    prefL: row.pref_l || "",
    prefD: row.pref_d || "",
    seasonNote: row.season_note || "",
    status: row.status,
    paid: !!row.paid,
    week: row.week ?? 0,
    role: row.role,
  };
}

function adherenceFromChecks(checkRows, weekStart) {
  const ch = {};
  (checkRows || []).forEach((r) => {
    if (r.week_start === weekStart) ch[`${r.item_id}|${r.day}`] = true;
  });
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
}

/** Approved = macros.approved, or profiles.status already flipped to active
 *  (admin Approve button / manual SQL both set status=active). */
function isApproved({ profileRow, macrosRow }) {
  return !!(macrosRow?.approved || profileRow?.status === "active");
}

function viewFromState({ profileRow, macrosRow }) {
  if (!profileRow) return "onboarding";
  const hasIntake = !!(macrosRow || profileRow.name || profileRow.phone);
  if (!hasIntake) return "onboarding";
  const approved = isApproved({ profileRow, macrosRow });
  const paid = !!profileRow.paid;
  if (approved && paid) return "dashboard";
  // pending covers: awaiting Callie, and approved-but-unpaid (pay screen)
  return "pending";
}

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not signed in");
  return user.id;
}

async function loadTodayMealLogs(uid, today) {
  const withSource = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source")
    .eq("profile_id", uid)
    .eq("date", today)
    .order("id", { ascending: true });

  if (!withSource.error) return withSource.data || [];

  // Column missing or other meal_logs issue — retry without source, then empty.
  console.warn("meal_logs select (with source) failed; retrying", withSource.error);
  const withoutSource = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f")
    .eq("profile_id", uid)
    .eq("date", today)
    .order("id", { ascending: true });

  if (!withoutSource.error) return withoutSource.data || [];
  console.warn("meal_logs select failed; continuing without today's log", withoutSource.error);
  return [];
}

export const db = {
  async loadClientState() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const uid = user.id;
    const today = new Date().toISOString().slice(0, 10);

    const [
      { data: profileRow, error: pErr },
      { data: macrosRow, error: mErr },
      { data: checkRows, error: cErr },
      { data: weighRows, error: wErr },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("macros").select("*").eq("profile_id", uid).maybeSingle(),
      supabase.from("checkins").select("week_start, item_id, day").eq("profile_id", uid),
      supabase.from("weighins").select("date, weight").eq("profile_id", uid).order("date", { ascending: true }),
    ]);

    if (pErr) throw pErr;
    if (mErr) throw mErr;
    if (cErr) throw cErr;
    if (wErr) throw wErr;

    // Meal logs are non-fatal: a missing `source` column (migration not applied)
    // must not block the whole dashboard / enrollment state.
    const mealRows = await loadTodayMealLogs(uid, today);

    const checksByWeek = {};
    (checkRows || []).forEach((r) => {
      const wk = r.week_start;
      if (!checksByWeek[wk]) checksByWeek[wk] = {};
      checksByWeek[wk][`${r.item_id}|${r.day}`] = true;
    });

    const profile = rowToProfile(profileRow) || undefined;
    const macros = macrosRow
      ? {
          cal: macrosRow.cal,
          protein: macrosRow.protein,
          fat: macrosRow.fat,
          carbs: macrosRow.carbs,
          notes: macrosRow.notes || [],
        }
      : null;

    return {
      profile,
      macros,
      approved: isApproved({ profileRow, macrosRow }),
      paid: !!profileRow?.paid,
      status: profileRow?.status || "pending",
      view: viewFromState({ profileRow, macrosRow }),
      checksByWeek,
      weighins: (weighRows || []).map((r) => ({ date: r.date, w: Number(r.weight) })),
      todayLog: {
        date: today,
        entries: (mealRows || []).map((r) => ({
          id: r.id,
          name: r.name,
          cal: r.cal,
          p: r.p,
          c: r.c,
          f: r.f,
          source: r.source || null,
        })),
      },
    };
  },

  async joinWaitlist({ email, reason, monthsPp = null }) {
    const { data: { user } } = await supabase.auth.getUser();
    let eligibleOn = null;
    if (reason === "early_nursing" && monthsPp != null && !Number.isNaN(Number(monthsPp))) {
      const monthsUntil = Math.max(0, 3 - Number(monthsPp));
      const d = new Date();
      d.setMonth(d.getMonth() + Math.ceil(monthsUntil));
      eligibleOn = d.toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("waitlist").insert({
      email: email.trim().toLowerCase(),
      reason,
      months_pp: monthsPp,
      eligible_on: eligibleOn,
      profile_id: user?.id || null,
    });
    if (error) throw error;
  },

  async submitIntake(profile, macros) {
    const uid = await requireUserId();
    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        ...profileToRow(profile),
        status: "pending",
        week: 0,
      })
      .eq("id", uid);
    if (pErr) throw pErr;

    const { error: mErr } = await supabase.from("macros").upsert({
      profile_id: uid,
      cal: macros.cal,
      protein: macros.protein,
      fat: macros.fat,
      carbs: macros.carbs,
      notes: macros.notes || [],
      approved: false,
    });
    if (mErr) throw mErr;
  },

  async toggleCheckin(weekStart, itemId, day, checked) {
    const uid = await requireUserId();
    if (checked) {
      const { error } = await supabase.from("checkins").upsert(
        { profile_id: uid, week_start: weekStart, item_id: itemId, day },
        { onConflict: "profile_id,week_start,item_id,day" }
      );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("checkins")
        .delete()
        .eq("profile_id", uid)
        .eq("week_start", weekStart)
        .eq("item_id", itemId)
        .eq("day", day);
      if (error) throw error;
    }
  },

  async addWeighin(weight, date = new Date().toISOString().slice(0, 10)) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("weighins")
      .insert({ profile_id: uid, date, weight: Number(weight) })
      .select("date, weight")
      .single();
    if (error) throw error;
    return { date: data.date, w: Number(data.weight) };
  },

  async addMealLog(entry, date = new Date().toISOString().slice(0, 10)) {
    const uid = await requireUserId();
    const base = {
      profile_id: uid,
      date,
      name: entry.name,
      cal: entry.cal,
      p: entry.p,
      c: entry.c,
      f: entry.f,
    };
    // Prefer writing source; fall back if the column isn't migrated yet.
    let { data, error } = await supabase
      .from("meal_logs")
      .insert({ ...base, source: entry.source || null })
      .select("id, date, name, cal, p, c, f, source")
      .single();
    if (error && /source/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert(base)
        .select("id, date, name, cal, p, c, f")
        .single());
    }
    if (error) throw error;
    return { ...data, source: data.source || entry.source || null };
  },

  async deleteMealLog(id) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("meal_logs")
      .delete()
      .eq("profile_id", uid)
      .eq("id", id);
    if (error) throw error;
  },

  async clearTodayMeals(date = new Date().toISOString().slice(0, 10)) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("meal_logs")
      .delete()
      .eq("profile_id", uid)
      .eq("date", date);
    if (error) throw error;
  },

  async loadRoster() {
    // Include admins who submitted a test intake — previously .neq("role","admin")
    // hid Callie/you from the pending queue during testing.
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;

    const ids = (profiles || []).map((p) => p.id);
    if (!ids.length) return [];

    const curWk = wkStartOf();
    const [
      { data: macrosRows, error: mErr },
      { data: weighRows, error: wErr },
      { data: checkRows, error: cErr },
    ] = await Promise.all([
      supabase.from("macros").select("*").in("profile_id", ids),
      supabase.from("weighins").select("profile_id, date, weight").in("profile_id", ids).order("date", { ascending: true }),
      supabase.from("checkins").select("profile_id, week_start, item_id, day").in("profile_id", ids).eq("week_start", curWk),
    ]);
    if (mErr) throw mErr;
    if (wErr) throw wErr;
    if (cErr) throw cErr;

    const macrosBy = Object.fromEntries((macrosRows || []).map((m) => [m.profile_id, m]));
    const weighBy = {};
    (weighRows || []).forEach((w) => {
      if (!weighBy[w.profile_id]) weighBy[w.profile_id] = [];
      weighBy[w.profile_id].push({ date: w.date, w: Number(w.weight) });
    });
    const checksBy = {};
    (checkRows || []).forEach((c) => {
      if (!checksBy[c.profile_id]) checksBy[c.profile_id] = [];
      checksBy[c.profile_id].push(c);
    });

    // Only show people who completed intake (have a macros row). Empty admin
    // accounts with no intake stay off the roster.
    return (profiles || [])
      .filter((p) => !!macrosBy[p.id])
      .map((p) => {
        const m = macrosBy[p.id];
        return {
          id: p.id,
          name: p.name || "Mama",
          age: p.age,
          currentWeight: p.current_weight,
          goalWeight: p.goal_weight,
          monthsPP: p.months_pp,
          breastfeeding: p.breastfeeding,
          phone: p.phone,
          prefB: p.pref_b,
          prefL: p.pref_l,
          prefD: p.pref_d,
          seasonNote: p.season_note || "",
          status: p.status,
          week: p.week,
          paid: p.paid,
          role: p.role,
          macros: {
            cal: m.cal,
            protein: m.protein,
            fat: m.fat,
            carbs: m.carbs,
            notes: m.notes || [],
            approved: m.approved,
          },
          weighins: weighBy[p.id] || [],
          adherence: adherenceFromChecks(checksBy[p.id] || [], curWk),
        };
      });
  },

  async updateClientMacros(clientId, macros) {
    const { error } = await supabase
      .from("macros")
      .update({
        cal: macros.cal,
        protein: macros.protein,
        fat: macros.fat,
        carbs: macros.carbs,
        notes: macros.notes || [],
      })
      .eq("profile_id", clientId);
    if (error) throw error;
  },

  async approveClient(clientId) {
    const { error: mErr } = await supabase
      .from("macros")
      .update({ approved: true })
      .eq("profile_id", clientId);
    if (mErr) throw mErr;

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ status: "active", week: 1 })
      .eq("id", clientId);
    if (pErr) throw pErr;
  },
};
