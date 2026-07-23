import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, RangeBand, rangeState } from "../components/ui";
import { db } from "../db/db";
import {
  addDaysIso,
  formatLongDay,
  fmtRange,
  isTodayIso,
  localDateIso,
  rateOf,
  wkStartOf,
} from "../utils/dates";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const VIA_LABEL = {
  photo: "AI estimate from photo",
  describe: "AI estimate from description",
  recipe: "from her plan · exact",
  custom: "from My meals",
  manual: "entered by her",
  adjusted: "adjusted by her",
  plan: "from her plan · exact",
};

const WATER = "#4F7F97";
const WATER_SOFT = "#E4F0F5";

const navBtn = (disabled) => ({
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: `1.5px solid ${disabled ? T.track : T.border}`,
  background: "#fff",
  color: disabled ? "#D8CCD1" : T.ink,
  fontSize: 15,
  cursor: disabled ? "default" : "pointer",
});

/**
 * Self-contained read-only day mirror for admin.
 * Does NOT reuse MealLogCard / WaterLogCard / WeighInCard — those stay client-only.
 */
export function AdminClientTracking({ client }) {
  const today = localDateIso();
  const curWk = wkStartOf();
  const earliestWeek = addDaysIso(curWk, -7 * 52);

  const [weekStart, setWeekStart] = useState(curWk);
  const [date, setDate] = useState(today);
  const [mealByDate, setMealByDate] = useState({});
  const [waterByDate, setWaterByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const macros = client?.macros || null;
  const goalOz = client?.goalWeight != null ? Math.round(Number(client.goalWeight) / 2) : 0;
  const bottleOz = Math.max(1, Number(client?.bottleOz) || 24);
  const firstName = String(client?.name || "her").split(" ")[0];

  useEffect(() => {
    setWeekStart(wkStartOf());
    setDate(localDateIso());
    setMealByDate({});
    setWaterByDate({});
    setError(null);
  }, [client?.id]);

  useEffect(() => {
    if (!client?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    db.loadClientLogsWeek(client.id, weekStart)
      .then((payload) => {
        if (cancelled) return;
        setMealByDate(payload.mealByDate || {});
        setWaterByDate(payload.waterByDate || {});
      })
      .catch((e) => {
        console.error("loadClientLogsWeek failed", e);
        if (!cancelled) {
          setMealByDate({});
          setWaterByDate({});
          setError("Could not load her day logs.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [client?.id, weekStart]);

  const entries = useMemo(() => mealByDate[date] || [], [mealByDate, date]);
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

  const waterEntries = waterByDate[date] || [];
  const waterTotal = waterEntries.reduce((s, e) => s + (Number(e.oz) || 0), 0);
  const waterHit = goalOz > 0 && waterTotal >= goalOz;
  const waterPct = goalOz > 0 ? Math.min((waterTotal / goalOz) * 100, 100) : 0;

  const weighByDate = useMemo(() => {
    const map = {};
    (client?.weighins || []).forEach((w) => { map[w.date] = w; });
    return map;
  }, [client?.weighins]);
  const dayWeight = weighByDate[date];
  const weeklyRate = rateOf(client?.weighins || []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );
  const canPrevWeek = weekStart > earliestWeek;
  const canNextWeek = weekStart < curWk;
  const onToday = isTodayIso(date);

  if (!macros) return null;

  const pLo = Number(macros.protein) || 0;
  const pHi = pLo + 10;
  const cLo = Number(macros.carbs) || 0;
  const cHi = cLo + 10;
  const fLo = Number(macros.fat) || 0;
  const fHi = fLo + 10;
  const calLo = Number(macros.cal) || 0;
  const calHi = calLo + 150;
  const calSt = rangeState(totals.cal, calLo, calHi);

  const changeWeek = (dir) => {
    const next = addDaysIso(weekStart, 7 * dir);
    if (dir < 0 && next < earliestWeek) return;
    if (dir > 0 && next > curWk) return;
    setWeekStart(next);
    const end = addDaysIso(next, 6);
    const prefer = today >= next && today <= end ? today : next;
    setDate(prefer > today ? today : prefer);
  };

  const selectDay = (d) => {
    if (!d || d > today) return;
    setDate(d);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>
          Her day · read-only
        </div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
          Browse what {firstName} logged — meals vs ranges, water, and weigh-ins.
          You cannot log or edit for her.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontFamily: FD, fontSize: 20 }}>
            {formatLongDay(date)}
            {onToday && (
              <span style={{ fontFamily: F, fontSize: 13, color: T.accentDeep, fontWeight: 700 }}> · Today</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={!canPrevWeek} onClick={() => changeWeek(-1)} style={navBtn(!canPrevWeek)} aria-label="Previous week">‹</button>
            <button type="button" disabled={!canNextWeek} onClick={() => changeWeek(1)} style={navBtn(!canNextWeek)} aria-label="Next week">›</button>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>
          {fmtRange(weekStart)}
          {weekStart === curWk ? " · this week" : ""}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {weekDays.map((d, i) => {
            const isFuture = d > today;
            const sel = d === date;
            const hasMeal = (mealByDate[d] || []).length > 0;
            const hasWeigh = !!weighByDate[d];
            return (
              <div key={d} style={{ flex: 1, textAlign: "center" }}>
                <button
                  type="button"
                  disabled={isFuture}
                  onClick={() => selectDay(d)}
                  aria-current={sel ? "date" : undefined}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isFuture ? "default" : "pointer",
                    position: "relative",
                    border: `1.5px solid ${sel ? T.accent : T.border}`,
                    background: sel ? T.accent : "#fff",
                    color: isFuture ? "#D8CCD1" : sel ? "#fff" : T.ink,
                  }}
                >
                  {DAY_LABELS[i]}
                  {(hasMeal || hasWeigh) && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: 5,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: sel ? "#fff" : T.accent,
                      }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: T.amber, marginBottom: 10 }}>{error}</div>
        )}
        {loading && (
          <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 10 }}>Loading her logs…</div>
        )}

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
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 8 }}>
          {onToday ? "Today's log" : `${formatLongDay(date)} log`}
        </div>
        {entries.length === 0 ? (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
            Nothing logged this day.
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id || `${e.name}-${e.cal}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 2px",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{e.name}</div>
                <div style={{
                  fontSize: 11.5,
                  color: e.via === "photo" || e.via === "describe" ? T.accentDeep : T.inkSoft,
                }}
                >
                  {VIA_LABEL[e.via] || "logged"}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, whiteSpace: "nowrap" }}>
                {Math.round(e.cal)} cal · P{Math.round(e.p)} C{Math.round(e.c)} F{Math.round(e.f)}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontFamily: F, fontSize: 13, fontWeight: 700, letterSpacing: 0.06, textTransform: "uppercase" }}>
            Water
          </span>
          <span style={{ fontFamily: FD, fontSize: 20 }}>
            {Math.round(waterTotal)} of {goalOz || "—"} oz
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 99, background: waterHit ? T.sageSoft : WATER_SOFT, overflow: "hidden", marginBottom: 8 }}>
          <div style={{
            height: "100%",
            width: `${waterPct}%`,
            background: waterHit ? T.sage : WATER,
            borderRadius: 99,
          }}
          />
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft }}>
          Bottle size {bottleOz} oz · read-only
          {waterHit ? " · goal hit" : ""}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 6 }}>Weigh-in</div>
        {dayWeight ? (
          <div style={{
            background: T.sageSoft,
            borderRadius: 12,
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
          >
            <span style={{ fontSize: 13.5, color: "#3E5A46" }}>Logged for this day</span>
            <span style={{ fontFamily: FD, fontSize: 22, color: "#3E5A46" }}>{dayWeight.w} lb</span>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: T.inkSoft }}>No weigh-in on this day.</div>
        )}
        {weeklyRate != null && (
          <div style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            background: weeklyRate > 1.5 ? T.amberSoft : T.sageSoft,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: weeklyRate > 1.5 ? T.amber : "#3E5A46",
          }}
          >
            Trending {Math.abs(weeklyRate).toFixed(1)} lb/week {weeklyRate < 0 ? "up" : "down"}
            {weeklyRate > 1.5
              ? " — faster than 1.5 lb/wk; nudge her to eat the top of her ranges."
              : " — healthy pace."}
          </div>
        )}
      </Card>
    </div>
  );
}
