import { useEffect, useMemo, useState } from "react";
import { T, FD } from "../theme/tokens";
import { Card, RangeBand, rangeState } from "../components/ui";
import { MealLogCard } from "../components/MealLogCard";
import { WaterLogCard } from "../components/WaterLogCard";
import { WeighInCard } from "../components/WeighInCard";
import { db } from "../db/db";
import {
  addDaysIso,
  formatLongDay,
  isTodayIso,
  localDateIso,
  rateOf,
  wkStartOf,
} from "../utils/dates";

/**
 * Read-only mirror of a client's Today tracking for Callie / admins.
 * Uses the same meal, water, and weigh-in cards with readOnly — no write handlers.
 */
export function AdminClientTracking({ client }) {
  const today = localDateIso();
  const [weekStart, setWeekStart] = useState(wkStartOf());
  const [date, setDate] = useState(today);
  const [mealByDate, setMealByDate] = useState({});
  const [waterByDate, setWaterByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const macros = client?.macros;
  const goalOz = client?.goalWeight != null ? Math.round(Number(client.goalWeight) / 2) : 0;
  const earliestWeek = addDaysIso(wkStartOf(), -7 * 52);

  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    db.loadClientLogsWeek(client.id, weekStart)
      .then((payload) => {
        if (cancelled) return;
        setMealByDate(payload.mealByDate || {});
        setWaterByDate(payload.waterByDate || {});
        setLoading(false);
      })
      .catch((e) => {
        console.error("loadClientLogsWeek failed", e);
        if (!cancelled) {
          setMealByDate({});
          setWaterByDate({});
          setError("Couldn’t load her day logs.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [client?.id, weekStart]);

  // Reset to today when switching clients
  useEffect(() => {
    const t = localDateIso();
    setWeekStart(wkStartOf(t));
    setDate(t);
  }, [client?.id]);

  const entries = mealByDate[date] || [];
  const totals = useMemo(
    () => entries.reduce(
      (a, e) => ({
        cal: a.cal + (Number(e.cal) || 0),
        p: a.p + (Number(e.p) || 0),
        c: a.c + (Number(e.c) || 0),
        f: a.f + (Number(e.f) || 0),
      }),
      { cal: 0, p: 0, c: 0, f: 0 },
    ),
    [entries],
  );

  const daysWithEntries = useMemo(
    () => Object.fromEntries(
      Object.entries(mealByDate).map(([d, list]) => [d, (list || []).length > 0]),
    ),
    [mealByDate],
  );

  if (!macros) return null;

  const pLo = macros.protein ?? 0;
  const pHi = pLo + 10;
  const cLo = macros.carbs ?? 0;
  const cHi = cLo + 10;
  const fLo = macros.fat ?? 0;
  const fHi = fLo + 10;
  const calLo = macros.cal ?? 0;
  const calHi = calLo + 150;
  const calSt = rangeState(totals.cal, calLo, calHi);
  const anyOver = ["p", "c", "f", "cal"].some((k) => {
    const lo = k === "cal" ? calLo : k === "p" ? pLo : k === "c" ? cLo : fLo;
    const hi = k === "cal" ? calHi : k === "p" ? pHi : k === "c" ? cHi : fHi;
    const eaten = k === "cal" ? totals.cal : totals[k];
    return rangeState(eaten, lo, hi) === "over";
  });
  const viewingToday = isTodayIso(date);
  const firstName = (client.name || "her").split(" ")[0];
  const weeklyRate = rateOf(client.weighins || []);

  const selectDate = (d) => {
    if (!d || d > today) return;
    setDate(d);
  };

  const changeWeek = (ws) => {
    if (!ws || ws > wkStartOf()) return;
    if (ws < earliestWeek) return;
    setWeekStart(ws);
    const end = addDaysIso(ws, 6);
    const prefer = today >= ws && today <= end ? today : ws;
    setDate(prefer > today ? today : prefer);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>
          Her day · read-only
        </div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
          Same Today view {firstName} sees — meals vs ranges, water, and weigh-ins.
          You can browse by day; you can&apos;t log or edit for her.
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: T.amber, marginBottom: 10 }}>{error}</div>
        )}
        {loading && (
          <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 10 }}>Loading her logs…</div>
        )}

        <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
          {viewingToday
            ? `Where ${firstName} lands in her bands today.`
            : `Ranges for ${formatLongDay(date)}.`}
        </p>

        <RangeBand label="Protein" lo={pLo} hi={pHi} eaten={totals.p} />
        <RangeBand label="Carbs" lo={cLo} hi={cHi} eaten={totals.c} />
        <RangeBand label="Fat" lo={fLo} hi={fHi} eaten={totals.f} />
        <div style={{
          borderTop: `1px dashed ${T.border}`,
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
        >
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: calSt === "over" ? T.amber : calSt === "in" ? T.sage : T.inkSoft,
          }}
          >
            {calSt === "empty" && "Calories land around"}
            {calSt === "under" && <>Calories · {Math.round(totals.cal)}</>}
            {calSt === "in" && <>Calories · {Math.round(totals.cal)} · ✓</>}
            {calSt === "over" && <>Calories · {Math.round(totals.cal)} · {Math.round(totals.cal - calHi)} over</>}
          </span>
          <span style={{ fontFamily: FD, fontSize: 22, color: calSt === "in" ? "#3E5A46" : T.ink }}>
            {calLo}–{calHi}
          </span>
        </div>
        {anyOver && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.amber, lineHeight: 1.5 }}>
            Over on something this day — useful coaching context, not a failure.
          </div>
        )}
      </Card>

      <MealLogCard
        readOnly
        macros={macros}
        todayLog={{ date, entries }}
        mealLogDate={date}
        mealLogWeekStart={weekStart}
        daysWithEntries={daysWithEntries}
        onSelectMealDate={selectDate}
        onChangeMealWeek={changeWeek}
        earliestWeekStart={earliestWeek}
      />

      <WaterLogCard
        readOnly
        date={date}
        goalOz={goalOz}
        bottleOz={client.bottleOz || 24}
        entries={waterByDate[date] || []}
      />

      <div style={{ marginTop: 16 }}>
        <WeighInCard
          readOnly
          weighins={client.weighins || []}
          goalWeight={client.goalWeight}
          weeklyRate={weeklyRate}
          earliestWeekStart={earliestWeek}
        />
      </div>
    </div>
  );
}
