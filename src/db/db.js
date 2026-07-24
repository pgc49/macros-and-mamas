import { supabase } from "../lib/supabase";
import { DEFAULT_ITEMS, DAYS } from "../content/data";
import { addDaysIso, localDateIso, wkStartOf } from "../utils/dates";

/* ------------------------------------------------------------------ */
/*  DATA LAYER — per-event Supabase writes (not blob persistence)      */
/*  Tables (RLS on all):                                               */
/*    profiles, macros, checkins, weighins, meal_logs, water_logs      */
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
    pref_s: p.prefS || null,
    season_note: p.seasonNote?.trim() ? p.seasonNote.trim() : null,
    bottle_oz: p.bottleOz != null && p.bottleOz !== "" ? Math.round(Number(p.bottleOz)) : 24,
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
    prefS: row.pref_s || "",
    seasonNote: row.season_note || "",
    bottleOz: row.bottle_oz != null ? Number(row.bottle_oz) : 24,
    status: row.status,
    paid: !!row.paid,
    refunded: !!row.refunded,
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
  if (!profileRow) return "join";
  if (profileRow.refunded) return "goodbye";
  const paid = !!profileRow.paid;
  if (!paid) return "join";
  const hasIntake = !!(macrosRow || profileRow.name || profileRow.phone);
  if (!hasIntake) return "onboarding";
  const approved = isApproved({ profileRow, macrosRow });
  if (approved) return "dashboard";
  return "pending";
}

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not signed in");
  return user.id;
}

function emptyAdminStats() {
  return {
    signups: 0,
    paid: 0,
    unpaid: 0,
    awaitingIntake: 0,
    awaitingApproval: 0,
    active: 0,
    refunded: 0,
  };
}

/** Normalize legacy `source` into `via` (photo | describe | recipe | manual | adjusted). */
export function normalizeVia(row) {
  if (row?.via) return row.via;
  if (row?.source === "text") return "describe";
  if (row?.source === "photo" || row?.source === "recipe" || row?.source === "manual" || row?.source === "adjusted") {
    return row.source;
  }
  return "manual";
}

function viaToLegacySource(via) {
  if (via === "describe") return "text";
  return via || "manual";
}

async function loadMealLogsRange(uid, startDate, endDate) {
  const withVia = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source, via")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!withVia.error) return withVia.data || [];

  console.warn("meal_logs select (with via) failed; retrying", withVia.error);
  const withSource = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f, source")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!withSource.error) return withSource.data || [];

  console.warn("meal_logs select (with source) failed; retrying", withSource.error);
  const bare = await supabase
    .from("meal_logs")
    .select("id, date, name, cal, p, c, f")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("id", { ascending: true });

  if (!bare.error) return bare.data || [];
  console.warn("meal_logs select failed; continuing without logs", bare.error);
  return [];
}

async function loadMealLogsForDate(uid, date) {
  return loadMealLogsRange(uid, date, date);
}

/** Water logs for any profile_id in a date range → { [iso]: [{id,oz,created_at}] }. */
async function loadWaterLogsRange(uid, startDate, endDate) {
  const { data, error } = await supabase
    .from("water_logs")
    .select("id, date, oz, created_at")
    .eq("profile_id", uid)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("loadWaterLogsRange failed", error);
    return {};
  }
  const byDate = {};
  (data || []).forEach((r) => {
    const d = r.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push({
      id: r.id,
      oz: Number(r.oz),
      created_at: r.created_at,
    });
  });
  return byDate;
}

function mapMealRows(mealRows) {
  return (mealRows || []).map((r) => {
    const via = normalizeVia(r);
    return {
      id: r.id,
      date: r.date,
      name: r.name,
      cal: r.cal,
      p: r.p,
      c: r.c,
      f: r.f,
      via,
      source: r.source || viaToLegacySource(via),
    };
  });
}

function groupMealRowsByDate(mealRows) {
  const byDate = {};
  mapMealRows(mealRows).forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  return byDate;
}

export const db = {
  async loadClientState() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const uid = user.id;
    const today = localDateIso();

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

    // Meal logs are non-fatal: missing via/source columns must not block dashboard.
    const weekStart = wkStartOf();
    // Progress charts need ~4 weeks of history; day strip still uses the current week subset.
    const historyStart = addDaysIso(today, -27);
    const mealRows = await loadMealLogsRange(uid, historyStart, today);
    const historyByDate = groupMealRowsByDate(mealRows);
    const byDate = {};
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(weekStart, i);
      if (historyByDate[d]) byDate[d] = historyByDate[d];
    }

    // Water history (same 28-day window) — non-fatal if migration 012 not applied yet
    let waterByDate = {};
    try {
      const { data: waterRows, error: waterErr } = await supabase
        .from("water_logs")
        .select("id, date, oz, created_at")
        .eq("profile_id", uid)
        .gte("date", historyStart)
        .lte("date", today)
        .order("created_at", { ascending: true });
      if (!waterErr && waterRows) {
        waterRows.forEach((r) => {
          if (!waterByDate[r.date]) waterByDate[r.date] = [];
          waterByDate[r.date].push({
            id: r.id,
            oz: Number(r.oz),
            created_at: r.created_at,
          });
        });
      }
    } catch (e) {
      console.warn("water history load failed", e);
    }

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
      refunded: !!profileRow?.refunded,
      status: profileRow?.status || "pending",
      view: viewFromState({ profileRow, macrosRow }),
      checksByWeek,
      weighins: (weighRows || []).map((r) => ({ date: r.date, w: Number(r.weight) })),
      todayLog: {
        date: today,
        entries: historyByDate[today] || [],
      },
      mealLogsByDate: byDate,
      mealLogWeekStart: weekStart,
      mealHistoryByDate: historyByDate,
      waterLogsByDate: waterByDate,
    };
  },

  async loadMealLogs(date = localDateIso()) {
    const uid = await requireUserId();
    const mealRows = await loadMealLogsForDate(uid, date);
    return { date, entries: mapMealRows(mealRows) };
  },

  /** Load one Mon–Sun week of meal logs in a single query (for day-strip dots). */
  async loadMealLogsWeek(weekStart = wkStartOf()) {
    const uid = await requireUserId();
    const end = addDaysIso(weekStart, 6);
    const mealRows = await loadMealLogsRange(uid, weekStart, end);
    return {
      weekStart,
      byDate: groupMealRowsByDate(mealRows),
    };
  },

  /** Longer history for Progress charts (defaults to last 28 local days). */
  async loadMealLogsHistory(days = 28) {
    const uid = await requireUserId();
    const today = localDateIso();
    const start = addDaysIso(today, -(Math.max(1, days) - 1));
    const mealRows = await loadMealLogsRange(uid, start, today);
    return { start, end: today, byDate: groupMealRowsByDate(mealRows) };
  },

  /**
   * Admin: progress payload for one client (meals + water + all checkins).
   * Relies on RLS own-or-admin SELECT policies.
   */
  async loadClientProgress(clientId, days = 28) {
    if (!clientId) throw new Error("clientId required");
    const today = localDateIso();
    const start = addDaysIso(today, -(Math.max(1, days) - 1));

    const [{ data: checkRows, error: cErr }, mealRows, waterByDate] = await Promise.all([
      supabase
        .from("checkins")
        .select("week_start, item_id, day")
        .eq("profile_id", clientId),
      loadMealLogsRange(clientId, start, today),
      loadWaterLogsRange(clientId, start, today),
    ]);
    if (cErr) throw cErr;

    const checksByWeek = {};
    (checkRows || []).forEach((r) => {
      const wk = r.week_start;
      if (!checksByWeek[wk]) checksByWeek[wk] = {};
      checksByWeek[wk][`${r.item_id}|${r.day}`] = true;
    });

    return {
      mealHistoryByDate: groupMealRowsByDate(mealRows),
      waterLogsByDate: waterByDate,
      checksByWeek,
      start,
      end: today,
    };
  },

  /**
   * Admin: one Mon–Sun week of meal + water logs for any client (read-only UI).
   * Writes stay client-scoped via requireUserId().
   */
  async loadClientLogsWeek(clientId, weekStart = wkStartOf()) {
    if (!clientId) throw new Error("clientId required");
    const end = addDaysIso(weekStart, 6);
    const [mealRows, waterByDate] = await Promise.all([
      loadMealLogsRange(clientId, weekStart, end),
      loadWaterLogsRange(clientId, weekStart, end),
    ]);
    return {
      weekStart,
      end,
      mealByDate: groupMealRowsByDate(mealRows),
      waterByDate,
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
    const { data: prof, error: gateErr } = await supabase
      .from("profiles")
      .select("paid, refunded, role")
      .eq("id", uid)
      .maybeSingle();
    if (gateErr) throw gateErr;
    const isAdmin = prof?.role === "admin";
    if (prof?.refunded) throw new Error("Enrollment was refunded");
    if (!prof?.paid && !isAdmin) throw new Error("Payment required before intake");

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

  async addWeighin(weight, date = localDateIso()) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("weighins")
      .upsert(
        { profile_id: uid, date, weight: Number(weight) },
        { onConflict: "profile_id,date" },
      )
      .select("date, weight")
      .single();
    if (error) {
      // Fallback when unique index isn't migrated yet: update existing day, else insert.
      const existing = await supabase
        .from("weighins")
        .select("id")
        .eq("profile_id", uid)
        .eq("date", date)
        .maybeSingle();
      if (existing.data?.id) {
        const upd = await supabase
          .from("weighins")
          .update({ weight: Number(weight) })
          .eq("id", existing.data.id)
          .select("date, weight")
          .single();
        if (upd.error) throw upd.error;
        return { date: upd.data.date, w: Number(upd.data.weight) };
      }
      const ins = await supabase
        .from("weighins")
        .insert({ profile_id: uid, date, weight: Number(weight) })
        .select("date, weight")
        .single();
      if (ins.error) throw ins.error;
      return { date: ins.data.date, w: Number(ins.data.weight) };
    }
    return { date: data.date, w: Number(data.weight) };
  },

  async deleteWeighin(date) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("weighins")
      .delete()
      .eq("profile_id", uid)
      .eq("date", date);
    if (error) throw error;
  },

  async addMealLog(entry, date = entry?.logged_date || localDateIso()) {
    const uid = await requireUserId();
    const via = entry.via || normalizeVia({ source: entry.source, via: entry.via });
    const base = {
      profile_id: uid,
      date,
      name: entry.name,
      cal: entry.cal,
      p: entry.p,
      c: entry.c,
      f: entry.f,
    };
    // Prefer via + source; degrade gracefully if columns aren't migrated yet.
    let { data, error } = await supabase
      .from("meal_logs")
      .insert({ ...base, via, source: viaToLegacySource(via) })
      .select("id, date, name, cal, p, c, f, source, via")
      .single();
    if (error && /via/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert({ ...base, source: viaToLegacySource(via) })
        .select("id, date, name, cal, p, c, f, source")
        .single());
    }
    if (error && /source/i.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("meal_logs")
        .insert(base)
        .select("id, date, name, cal, p, c, f")
        .single());
    }
    if (error) throw error;
    const mapped = mapMealRows([data])[0];
    return mapped;
  },

  async updateMealLog(id, patch) {
    const uid = await requireUserId();
    const via = patch.via != null ? patch.via : undefined;
    const fields = {
      name: patch.name,
      cal: patch.cal,
      p: patch.p,
      c: patch.c,
      f: patch.f,
    };
    if (via != null) {
      fields.via = via;
      fields.source = viaToLegacySource(via);
    }
    let { data, error } = await supabase
      .from("meal_logs")
      .update(fields)
      .eq("profile_id", uid)
      .eq("id", id)
      .select("id, date, name, cal, p, c, f, source, via")
      .single();
    if (error && /via/i.test(error.message || "")) {
      const { via: _v, ...noVia } = fields;
      ({ data, error } = await supabase
        .from("meal_logs")
        .update(noVia)
        .eq("profile_id", uid)
        .eq("id", id)
        .select("id, date, name, cal, p, c, f, source")
        .single());
    }
    if (error) throw error;
    return mapMealRows([data])[0];
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

  async clearTodayMeals(date = localDateIso()) {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("meal_logs")
      .delete()
      .eq("profile_id", uid)
      .eq("date", date);
    if (error) throw error;
  },

  /** Load water log rows for a Mon–Sun week → { byDate: { [iso]: [{id,oz,created_at}] } }. */
  async loadWaterLogsWeek(weekStart = wkStartOf()) {
    const uid = await requireUserId();
    const end = addDaysIso(weekStart, 6);
    return { byDate: await loadWaterLogsRange(uid, weekStart, end) };
  },

  async addWaterLog(oz, date = localDateIso()) {
    const uid = await requireUserId();
    const amount = Number(oz);
    if (!amount || amount <= 0) throw new Error("invalid oz");
    const { data, error } = await supabase
      .from("water_logs")
      .insert({ profile_id: uid, date, oz: amount })
      .select("id, date, oz, created_at")
      .single();
    if (error) throw error;
    return { id: data.id, oz: Number(data.oz), created_at: data.created_at, date: data.date };
  },

  /** Delete the most recent water_logs row for this date (undo last tap). */
  async undoLastWaterLog(date = localDateIso()) {
    const uid = await requireUserId();
    const { data: latest, error: findErr } = await supabase
      .from("water_logs")
      .select("id")
      .eq("profile_id", uid)
      .eq("date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!latest?.id) return null;
    const { error } = await supabase
      .from("water_logs")
      .delete()
      .eq("id", latest.id)
      .eq("profile_id", uid);
    if (error) throw error;
    return latest.id;
  },

  async updateBottleOz(oz) {
    const uid = await requireUserId();
    const n = Math.round(Number(oz));
    if (!n || n < 4 || n > 64) throw new Error("bottle size must be 4–64 oz");
    const { error } = await supabase
      .from("profiles")
      .update({ bottle_oz: n })
      .eq("id", uid);
    if (error) throw error;
    return n;
  },

  /** Update intake food loves — used by planner + AI suggest. */
  async updateFoodPrefs({ prefB, prefL, prefD, prefS, seasonNote } = {}) {
    const uid = await requireUserId();
    const row = {
      pref_b: String(prefB || "").trim().slice(0, 500) || null,
      pref_l: String(prefL || "").trim().slice(0, 500) || null,
      pref_d: String(prefD || "").trim().slice(0, 500) || null,
      pref_s: String(prefS || "").trim().slice(0, 500) || null,
    };
    if (seasonNote !== undefined) {
      row.season_note = String(seasonNote || "").trim().slice(0, 1000) || null;
    }
    const { error } = await supabase.from("profiles").update(row).eq("id", uid);
    if (error) throw error;
    return {
      prefB: row.pref_b || "",
      prefL: row.pref_l || "",
      prefD: row.pref_d || "",
      prefS: row.pref_s || "",
      ...(seasonNote !== undefined ? { seasonNote: row.season_note || "" } : {}),
    };
  },

  async loadRoster() {
    // Full admin directory: every profile including admins (so Callie/Patrick
    // can open their own row and test meal plans). Funnel stats still exclude admins.
    // RLS: only admins can select all profiles / email_events.
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;

    const allProfiles = profiles || [];
    const ids = allProfiles.map((p) => p.id);
    if (!ids.length) return { clients: [], stats: emptyAdminStats() };

    const curWk = wkStartOf();
    const today = localDateIso();
    // Enough history to know if she has logged within ~48h (yesterday or today).
    const mealSince = addDaysIso(today, -14);
    const [
      { data: macrosRows, error: mErr },
      { data: weighRows, error: wErr },
      { data: checkRows, error: cErr },
      { data: mealRows, error: mealErr },
    ] = await Promise.all([
      supabase.from("macros").select("*").in("profile_id", ids),
      supabase.from("weighins").select("profile_id, date, weight").in("profile_id", ids).order("date", { ascending: true }),
      supabase.from("checkins").select("profile_id, week_start, item_id, day").in("profile_id", ids).eq("week_start", curWk),
      supabase
        .from("meal_logs")
        .select("profile_id, date")
        .in("profile_id", ids)
        .gte("date", mealSince),
    ]);
    if (mErr) throw mErr;
    if (wErr) throw wErr;
    if (cErr) throw cErr;
    if (mealErr) console.warn("roster meal_logs lookup failed", mealErr);

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
    const lastMealBy = {};
    (mealRows || []).forEach((r) => {
      if (!lastMealBy[r.profile_id] || r.date > lastMealBy[r.profile_id]) {
        lastMealBy[r.profile_id] = r.date;
      }
    });

    const clients = allProfiles.map((p) => {
      const m = macrosBy[p.id] || null;
      const approved = !!(m?.approved || p.status === "active");
      const paid = !!p.paid;
      const refunded = !!p.refunded;
      const hasIntake = !!m;
      const isAdminRow = String(p.role || "").toLowerCase() === "admin";
      let stage = "signed_up";
      if (refunded) stage = "refunded";
      else if (paid && approved) stage = "active";
      else if (paid && hasIntake && !approved) stage = "awaiting_approval";
      else if (paid && !hasIntake) stage = "paid_awaiting_intake";
      else if (!paid) stage = "signed_up";
      // Admins with dashboard access often skip pay — still show as active when they have macros
      if (isAdminRow && hasIntake && approved) stage = "active";

      return {
        id: p.id,
        name: p.name || (hasIntake ? "Mama" : "New signup"),
        email: p.email || "",
        age: p.age,
        currentWeight: p.current_weight,
        goalWeight: p.goal_weight,
        monthsPP: p.months_pp,
        breastfeeding: p.breastfeeding,
        pregnant: !!p.pregnant,
        diet: p.diet || "none",
        phone: p.phone,
        prefB: p.pref_b,
        prefL: p.pref_l,
        prefD: p.pref_d,
        prefS: p.pref_s,
        seasonNote: p.season_note || "",
        bottleOz: p.bottle_oz != null ? Number(p.bottle_oz) : 24,
        status: p.status,
        week: p.week,
        paid,
        refunded,
        paidAt: p.paid_at || null,
        createdAt: p.created_at || null,
        role: p.role,
        stage,
        hasIntake,
        macros: m
          ? {
              cal: m.cal,
              protein: m.protein,
              fat: m.fat,
              carbs: m.carbs,
              notes: m.notes || [],
              approved: !!m.approved,
            }
          : null,
        weighins: weighBy[p.id] || [],
        adherence: adherenceFromChecks(checksBy[p.id] || [], curWk),
        /** YYYY-MM-DD of most recent meal log in the last 14 days, or null. */
        lastMealDate: lastMealBy[p.id] || null,
      };
    });

    const nonAdminClients = clients.filter((c) => String(c.role || "").toLowerCase() !== "admin");
    const stats = {
      signups: nonAdminClients.length,
      paid: nonAdminClients.filter((c) => c.paid && !c.refunded).length,
      unpaid: nonAdminClients.filter((c) => !c.paid && !c.refunded).length,
      awaitingIntake: nonAdminClients.filter((c) => c.stage === "paid_awaiting_intake").length,
      awaitingApproval: nonAdminClients.filter((c) => c.stage === "awaiting_approval").length,
      active: nonAdminClients.filter((c) => c.stage === "active").length,
      refunded: nonAdminClients.filter((c) => c.stage === "refunded").length,
    };

    return { clients, stats };
  },

  async loadEmailEvents(profileId) {
    if (!profileId) return [];
    const { data, error } = await supabase
      .from("email_events")
      .select("id, profile_id, email_type, to_email, subject, status, resend_id, meta, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // Table may not exist until migration 006 is run
      console.warn("loadEmailEvents failed", error);
      return [];
    }
    return data || [];
  },

  async loadRecentEmailEvents(limit = 20) {
    const { data, error } = await supabase
      .from("email_events")
      .select("id, profile_id, email_type, to_email, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("loadRecentEmailEvents failed", error);
      return [];
    }
    return data || [];
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

  /** Load meal-plan row for a client (or self). Missing row = default mode. */
  async loadClientMealPlan(profileId) {
    if (!profileId) return { mode: "default", draft: null, published: null };
    const { data, error } = await supabase
      .from("client_meal_plans")
      .select("profile_id, mode, draft, draft_meta, published, published_at, published_by, updated_at")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) {
      // Table may not exist until migration 011
      console.warn("loadClientMealPlan failed", error);
      return { mode: "default", draft: null, published: null };
    }
    if (!data) return { mode: "default", draft: null, published: null, published_at: null };
    const published = data.published || null;
    const hasWeek = Array.isArray(published?.days) && published.days.length > 0;
    return {
      mode: data.mode === "personalized" && hasWeek ? "personalized" : "default",
      draft: data.draft || null,
      draft_meta: data.draft_meta || null,
      published: hasWeek ? published : null,
      published_at: data.published_at || null,
      published_by: data.published_by || null,
      updated_at: data.updated_at || null,
      rawMode: data.mode,
    };
  },

  /** Admin: save AI draft (does not change what the client sees). */
  async saveMealPlanDraft(clientId, plan) {
    if (!clientId || !plan) throw new Error("missing plan");
    const existing = await this.loadClientMealPlan(clientId);
    const draft_meta = {
      ...(plan.meta || {}),
      savedAt: new Date().toISOString(),
    };
    const { error } = await supabase.from("client_meal_plans").upsert(
      {
        profile_id: clientId,
        mode: existing.rawMode || "default",
        draft: plan,
        draft_meta,
        published: existing.published,
        published_at: existing.published_at,
        published_by: existing.published_by,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
    if (error) throw error;
  },

  /**
   * Admin: publish a plan to the client (usually the current draft).
   * Copies plan → published and sets mode=personalized.
   */
  async publishMealPlan(clientId, adminId, planOverride = null) {
    if (!clientId) throw new Error("missing client");
    const existing = await this.loadClientMealPlan(clientId);
    const plan = planOverride || existing.draft;
    if (!plan?.days?.length) throw new Error("Generate a draft before publishing");
    const payload = {
      profile_id: clientId,
      mode: "personalized",
      draft: plan,
      draft_meta: existing.draft_meta || plan.meta || null,
      published: plan,
      published_at: new Date().toISOString(),
      published_by: adminId || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("client_meal_plans").upsert(payload, { onConflict: "profile_id" });
    if (error) throw error;

    // Confirm the write — surfaces RLS / schema issues instead of a silent miss
    const verify = await this.loadClientMealPlan(clientId);
    if (verify.mode !== "personalized" || !verify.published?.days?.length) {
      throw new Error("Publish didn’t stick — check client_meal_plans table / RLS (migration 011)");
    }
  },

  /**
   * Admin: switch client back to the shared default recipe bank.
   * Keeps draft + last published for easy re-publish later.
   */
  async revertMealPlanToDefault(clientId) {
    if (!clientId) throw new Error("missing client");
    const { error } = await supabase
      .from("client_meal_plans")
      .update({
        mode: "default",
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", clientId);
    if (error) throw error;
  },

  /** Saved My meals (name + macros) for one-tap re-logging. */
  async loadCustomMeals() {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("custom_meals")
      .select("id, name, cal, p, c, f, updated_at")
      .eq("profile_id", uid)
      .order("updated_at", { ascending: false });
    if (error) {
      console.warn("loadCustomMeals failed", error);
      return [];
    }
    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      cal: Number(r.cal) || 0,
      p: Number(r.p) || 0,
      c: Number(r.c) || 0,
      f: Number(r.f) || 0,
      updated_at: r.updated_at,
    }));
  },

  /** Upsert by name for this user (re-saving the same lunch updates macros). */
  async saveCustomMeal({ name, cal, p, c, f }) {
    const uid = await requireUserId();
    const trimmed = String(name || "").trim().slice(0, 80);
    if (!trimmed) throw new Error("Meal needs a name");
    const row = {
      profile_id: uid,
      name: trimmed,
      cal: Number(cal) || 0,
      p: Number(p) || 0,
      c: Number(c) || 0,
      f: Number(f) || 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("custom_meals")
      .upsert(row, { onConflict: "profile_id,name" })
      .select("id, name, cal, p, c, f, updated_at")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      cal: Number(data.cal) || 0,
      p: Number(data.p) || 0,
      c: Number(data.c) || 0,
      f: Number(data.f) || 0,
      updated_at: data.updated_at,
    };
  },

  async deleteCustomMeal(id) {
    const uid = await requireUserId();
    if (!id) return;
    const { error } = await supabase
      .from("custom_meals")
      .delete()
      .eq("profile_id", uid)
      .eq("id", id);
    if (error) throw error;
  },

  /**
   * Client week planner — one plan per Mon–Sun (week_start).
   * localStorage fallback until migrations 014 + 016 land.
   */
  async loadWeekPlan(weekStart = null) {
    const uid = await requireUserId();
    const ws = weekStart || wkStartOf();
    const lsKey = weekPlanLocalKey(uid, ws);
    try {
      const { data, error } = await supabase
        .from("client_week_plans")
        .select("days, source, updated_at, week_start")
        .eq("profile_id", uid)
        .eq("week_start", ws)
        .maybeSingle();
      if (error) {
        console.warn("loadWeekPlan failed (migration 014/016?)", error);
        return migrateLegacyWeekPlanLocal(uid, ws) || readWeekPlanLocal(lsKey, ws);
      }
      if (!data) {
        // First load after 016: try legacy unscoped local key once for current week
        const legacy = ws === wkStartOf() ? migrateLegacyWeekPlanLocal(uid, ws) : null;
        return legacy || { days: [], source: "manual", week_start: ws, updated_at: null };
      }
      const days = Array.isArray(data.days) ? data.days : [];
      return {
        days,
        source: data.source || "manual",
        week_start: data.week_start || ws,
        updated_at: data.updated_at || null,
      };
    } catch (e) {
      console.warn("loadWeekPlan exception", e);
      return migrateLegacyWeekPlanLocal(uid, ws) || readWeekPlanLocal(lsKey, ws);
    }
  },

  async saveWeekPlan(days, source = "manual", weekStart = null) {
    const uid = await requireUserId();
    const ws = weekStart || wkStartOf();
    const lsKey = weekPlanLocalKey(uid, ws);
    const payload = {
      days: Array.isArray(days) ? days : [],
      source: ["manual", "ai", "coach_seed"].includes(source) ? source : "manual",
      week_start: ws,
      updated_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(lsKey, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
    const { error } = await supabase.from("client_week_plans").upsert(
      {
        profile_id: uid,
        week_start: ws,
        days: payload.days,
        source: payload.source,
        updated_at: payload.updated_at,
      },
      { onConflict: "profile_id,week_start" },
    );
    if (error) {
      console.warn("saveWeekPlan supabase failed — kept local copy", error);
      return payload;
    }
    return payload;
  },
};

function weekPlanLocalKey(uid, weekStart) {
  return `mm_week_plan_${uid}_${weekStart}`;
}

/** Move pre-016 single local plan onto the current week once. */
function migrateLegacyWeekPlanLocal(uid, weekStart) {
  if (weekStart !== wkStartOf()) return null;
  const legacyKey = `mm_week_plan_${uid}`;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    if (!days.length) {
      localStorage.removeItem(legacyKey);
      return null;
    }
    const payload = {
      days,
      source: parsed?.source || "manual",
      week_start: weekStart,
      updated_at: parsed?.updated_at || null,
    };
    localStorage.setItem(weekPlanLocalKey(uid, weekStart), JSON.stringify(payload));
    localStorage.removeItem(legacyKey);
    return payload;
  } catch {
    return null;
  }
}

function readWeekPlanLocal(lsKey, weekStart) {
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return { days: [], source: "manual", week_start: weekStart, updated_at: null };
    const parsed = JSON.parse(raw);
    return {
      days: Array.isArray(parsed?.days) ? parsed.days : [],
      source: parsed?.source || "manual",
      week_start: parsed?.week_start || weekStart,
      updated_at: parsed?.updated_at || null,
    };
  } catch {
    return { days: [], source: "manual", week_start: weekStart, updated_at: null };
  }
}
