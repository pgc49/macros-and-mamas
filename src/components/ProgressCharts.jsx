import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { Card } from "./ui";

function MacroBarChart({ title, data, dataKey, lo, hi, unit = "g" }) {
  const maxVal = Math.max(hi * 1.25, ...data.map((d) => Number(d[dataKey]) || 0), lo);
  const inBand = data.filter((d) => {
    const v = Number(d[dataKey]) || 0;
    return v >= lo && v <= hi;
  }).length;
  const caption =
    data.length === 0
      ? null
      : inBand === data.length
        ? "Every logged day landed inside this range. That's the win."
        : inBand > data.length / 2
          ? "Most logged days sit in the band — the ones under are fine when the day's still open."
          : "Some days land below or above — the picture over weeks matters more than any single day.";

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: T.inkSoft }}>
          range {lo}–{hi}
          {unit}
        </div>
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -22 }}>
            <CartesianGrid stroke={T.track} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.inkSoft }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, Math.ceil(maxVal)]} tick={{ fontSize: 10, fill: T.inkSoft }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontFamily: F, fontSize: 12, borderRadius: 10, border: `1px solid ${T.border}` }}
              formatter={(v) => [`${Math.round(v)}${unit}`, title]}
              labelFormatter={(l, payload) => payload?.[0]?.payload?.date || l}
            />
            <ReferenceArea y1={lo} y2={hi} fill={T.sageSoft} strokeOpacity={0} />
            <ReferenceLine y={lo} stroke={T.sage} strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={hi} stroke={T.sage} strokeDasharray="3 3" strokeWidth={1} />
            <Bar dataKey={dataKey} fill={T.accent} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {caption && (
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, marginTop: 4 }}>{caption}</div>
      )}
    </div>
  );
}

/**
 * Progress-tab charts: macros vs Callie's ranges + weekly habit adherence.
 */
export function ProgressCharts({ macros, macroHistory = [], habitHistory = [] }) {
  const hi = (n, d = 10) => n + d;
  const hasMacros = macros && macroHistory.length > 0;
  const hasHabits = habitHistory.some((h) => h.pct > 0) || habitHistory.length > 1;

  return (
    <>
      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Macros vs your ranges</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
          Days you logged food over the last few weeks. The sage band is your range — under mid-day is normal; we care about the pattern.
        </p>

        {!hasMacros ? (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
            Log a few meals on the Today tab and this fills in — protein, carbs, fat, and calories against your bands.
          </div>
        ) : (
          <>
            <MacroBarChart
              title="Protein"
              data={macroHistory}
              dataKey="p"
              lo={macros.protein}
              hi={hi(macros.protein)}
            />
            <MacroBarChart
              title="Carbs"
              data={macroHistory}
              dataKey="c"
              lo={macros.carbs}
              hi={hi(macros.carbs)}
            />
            <MacroBarChart
              title="Fat"
              data={macroHistory}
              dataKey="f"
              lo={macros.fat}
              hi={hi(macros.fat)}
            />
            <MacroBarChart
              title="Calories"
              data={macroHistory}
              dataKey="cal"
              lo={macros.cal}
              hi={macros.cal + 150}
              unit=""
            />
            <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>
              {macroHistory.length} logged {macroHistory.length === 1 ? "day" : "days"} shown. Empty days stay off the chart on purpose.
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Habit tracker rhythm</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
          Weekly check-in consistency. Progress, not perfection — 70% weeks are strong weeks.
        </p>

        {!hasHabits ? (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
            Tap the day circles on Today as you go. After a week or two, your rhythm shows up here.
          </div>
        ) : (
          <>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={habitHistory} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={T.track} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ fontFamily: F, fontSize: 12, borderRadius: 10, border: `1px solid ${T.border}` }}
                    formatter={(v) => [`${v}%`, "Adherence"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel || ""}
                  />
                  <ReferenceLine y={70} stroke={T.sage} strokeDasharray="5 4" label={{ value: "70%", fontSize: 10, fill: T.sage, position: "right" }} />
                  <Line type="monotone" dataKey="pct" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
              {habitHistory.map((h) => (
                <div
                  key={h.week}
                  style={{
                    flex: "0 0 auto",
                    minWidth: 56,
                    textAlign: "center",
                    padding: "8px 6px",
                    borderRadius: 10,
                    background: h.pct >= 70 ? T.sageSoft : T.accentSoft,
                  }}
                >
                  <div style={{ fontFamily: FD, fontSize: 16, color: h.pct >= 70 ? "#3E5A46" : T.accentDeep }}>{h.pct}%</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{h.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
