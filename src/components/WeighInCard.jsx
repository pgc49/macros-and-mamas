import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { Btn, Card, inputStyle } from "./ui";
import {
  addDaysIso,
  formatLongDay,
  fmtRange,
  isTodayIso,
  localDateIso,
  wkStartOf,
} from "../utils/dates";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

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
 * Day-strip weigh-ins — same interaction model as meal logging.
 * Pick a day, log or edit that day's weight, remove if needed.
 */
export function WeighInCard({
  weighins = [],
  goalWeight,
  weeklyRate,
  onSave,
  onDelete,
  earliestWeekStart,
}) {
  const today = localDateIso();
  const curWk = wkStartOf();
  const earliest = earliestWeekStart || addDaysIso(curWk, -7 * 52);

  const [weekStart, setWeekStart] = useState(curWk);
  const [selected, setSelected] = useState(today);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const byDate = useMemo(() => {
    const map = {};
    weighins.forEach((w) => {
      map[w.date] = w;
    });
    return map;
  }, [weighins]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );

  const onToday = isTodayIso(selected);
  const existing = byDate[selected];
  const canPrevWeek = weekStart > earliest;
  const canNextWeek = weekStart < curWk;

  useEffect(() => {
    setInput(existing ? String(existing.w) : "");
  }, [selected, existing?.w]);

  const changeWeek = (dir) => {
    const next = addDaysIso(weekStart, 7 * dir);
    if (dir < 0 && next < earliest) return;
    if (dir > 0 && next > curWk) return;
    setWeekStart(next);
    const todayInWeek = today >= next && today <= addDaysIso(next, 6);
    setSelected(todayInWeek ? today : next > today ? today : next);
  };

  const selectDay = (d) => {
    if (d > today) return;
    setSelected(d);
  };

  const save = async () => {
    const w = parseFloat(input);
    if (!w || w <= 0) return;
    setBusy(true);
    try {
      await onSave?.(w, selected);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await onDelete?.(selected);
      setInput("");
    } finally {
      setBusy(false);
    }
  };

  // Chart: one point per date, sorted; need 2+ points spanning 5+ days for rate card (parent).
  const chartData = useMemo(() => {
    const seen = new Map();
    weighins.forEach((x) => seen.set(x.date, x.w));
    return [...seen.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, w]) => ({ date, w, label: date.slice(5) }));
  }, [weighins]);

  const showChart = chartData.length >= 2;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 4px" }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: 0 }}>
          {formatLongDay(selected)}
          {onToday && (
            <span style={{ fontFamily: F, fontSize: 13, color: T.accentDeep, fontWeight: 700 }}> · Today</span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={!canPrevWeek} onClick={() => changeWeek(-1)} style={navBtn(!canPrevWeek)} aria-label="Previous week">
            ‹
          </button>
          <button type="button" disabled={!canNextWeek} onClick={() => changeWeek(1)} style={navBtn(!canNextWeek)} aria-label="Next week">
            ›
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>
        {fmtRange(weekStart)}
        {weekStart === curWk ? " · this week" : ""}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {weekDays.map((d, i) => {
          const isFuture = d > today;
          const sel = d === selected;
          const has = !!byDate[d];
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
                {has && (
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
              {d === today && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: T.accentDeep,
                    margin: "4px auto 0",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 2 }}>Weigh-in</div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
          {onToday ? (
            <>Logging for today. Morning, before coffee is ideal — the trend matters more than any one number.</>
          ) : (
            <>
              Logging for <b style={{ color: T.accentDeep }}>{formatLongDay(selected)}</b>. Catch up anytime.
            </>
          )}
        </div>

        {existing && (
          <div
            style={{
              background: T.sageSoft,
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span style={{ fontSize: 13.5, color: "#3E5A46" }}>Logged for this day</span>
            <span style={{ fontFamily: FD, fontSize: 22, color: "#3E5A46" }}>{existing.w} lb</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            inputMode="decimal"
            placeholder={existing ? "Update weight (lbs)" : "Weight (lbs)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <Btn small disabled={busy || !parseFloat(input)} onClick={save}>
            {busy ? "…" : existing ? "Save" : "Log it"}
          </Btn>
        </div>

        {existing && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            style={{
              marginTop: 10,
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: F,
              fontSize: 12.5,
              color: T.inkSoft,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Remove this weigh-in
          </button>
        )}

        {showChart ? (
          <div style={{ height: 190, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={T.track} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontFamily: F, fontSize: 13, borderRadius: 10, border: `1px solid ${T.border}` }}
                  formatter={(v) => [`${v} lb`, "Weight"]}
                  labelFormatter={(l, payload) => payload?.[0]?.payload?.date || l}
                />
                {goalWeight && (
                  <ReferenceLine
                    y={Number(goalWeight)}
                    stroke={T.sage}
                    strokeDasharray="5 4"
                    label={{ value: "goal", fontSize: 11, fill: T.sage, position: "right" }}
                  />
                )}
                <Line type="monotone" dataKey="w" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
            {chartData.length === 0
              ? "Pick a day and log your first weigh-in. A few points on different days and your trend line shows up here."
              : "One weigh-in logged — add another on a different day and the trend chart appears."}
          </div>
        )}

        {weeklyRate !== null && (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: weeklyRate > 1.5 ? T.amberSoft : T.sageSoft }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: weeklyRate > 1.5 ? T.amber : "#3E5A46" }}>
              Trending {Math.abs(weeklyRate).toFixed(1)} lb/week {weeklyRate < 0 ? "up" : "down"}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: weeklyRate > 1.5 ? T.amber : "#3E5A46" }}>
              {weeklyRate > 1.5
                ? "That's faster than 1.5 lbs a week, which means you're likely losing muscle, not just fat. Eat the top of your ranges this week — more food, not less. This is the rule of the whole program."
                : "Right in the healthy zone. Fat is leaving, muscle is staying. Keep doing exactly this."}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
