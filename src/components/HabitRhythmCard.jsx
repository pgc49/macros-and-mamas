import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "./ui";
import {
  bestCompletedWeek,
  buildHabitRhythm,
  goalChipLabel,
} from "../lib/habitRhythm";
import { fmtRange } from "../utils/dates";

/**
 * Stage 5.7 habit rhythm — filter chips + weekly bars (no line / no shame slope).
 */
export function HabitRhythmCard({
  checksByWeek = {},
  goalItems = [],
  curWk,
  earliestWk = null,
  programStartWeek = null,
  audience = "client",
}) {
  const [sel, setSel] = useState("all");
  const admin = audience === "admin";

  const model = useMemo(
    () => buildHabitRhythm({ checksByWeek, goalItems, curWk, earliestWk, programStartWeek }),
    [checksByWeek, goalItems, curWk, earliestWk, programStartWeek],
  );

  const series = sel === "all" ? model.allSeries : (model.byGoalId[sel] || []);
  const selectedGoal = sel === "all" ? null : model.goals.find((g) => g.id === sel);

  const insight = useMemo(() => {
    if (sel === "all") {
      if (!model.steadiest) {
        return admin
          ? "Once she has a finished week on the board, her steadiest habit shows up here."
          : "Finish one full week of taps and your steadiest habit will show up here.";
      }
      return admin
        ? <>Her steadiest habit: <b>{model.steadiest.label}</b>. That&apos;s the rhythm — the rest can borrow from it.</>
        : <>Your steadiest habit: <b>{model.steadiest.label}</b>. That&apos;s the rhythm — the rest can borrow from it.</>;
    }
    const best = bestCompletedWeek(series);
    if (!best || !selectedGoal) {
      return admin
        ? "When she completes a full week on this goal, her best week lands here."
        : "Complete a full week on this goal and your best week will land here.";
    }
    const unit = selectedGoal.daily ? "days" : "sessions";
    return admin
      ? <>Best week: <b>{best.label}</b> · {best.hits} of {best.target} {unit}. One good week means it&apos;s in her.</>
      : <>Best week: <b>{best.label}</b> · {best.hits} of {best.target} {unit}. One good week means it&apos;s in you.</>;
  }, [sel, model.steadiest, series, selectedGoal, admin]);

  const hasAnyCheck = Object.keys(checksByWeek || {}).length > 0
    || (model.allSeries || []).some((w) => (w.pct || 0) > 0);

  if (!hasAnyCheck && model.weeks.length <= 1 && !(model.allSeries[0]?.pct > 0)) {
    return (
      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 22, marginBottom: 6 }}>Habit tracker rhythm</div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: 0 }}>
          {admin
            ? "No habit check-ins yet. After a week or two of day circles, her rhythm shows up here."
            : "Tap the day circles on Today as you go. After a week or two, your rhythm shows up here."}
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 22, marginBottom: 6 }}>Habit tracker rhythm</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
        Weekly consistency. Progress, not perfection — 70% weeks are strong weeks.
      </p>

      <div
        className="mam-h-scroll"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 14,
          marginBottom: 2,
        }}
      >
        <ChipBtn on={sel === "all"} onClick={() => setSel("all")}>All goals</ChipBtn>
        {model.goals.map((g) => (
          <ChipBtn key={g.id} on={sel === g.id} onClick={() => setSel(g.id)}>
            {goalChipLabel(g)}
            {g.source === "custom" ? " · yours" : ""}
          </ChipBtn>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          height: 200,
          margin: "6px 0 4px",
          display: "flex",
          alignItems: "flex-end",
          gap: Math.max(8, Math.min(18, 120 / Math.max(series.length, 1))),
          padding: "0 4px",
          borderBottom: `1.5px solid ${T.border}`,
          boxSizing: "border-box",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "70%",
            borderTop: "2px dashed #a9c4a3",
            zIndex: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              right: 0,
              top: -18,
              fontSize: 10.5,
              fontWeight: 800,
              color: T.sage,
              fontFamily: F,
            }}
          >
            strong week · 70%
          </span>
        </div>

        {series.map((row) => {
          const missing = row.pct == null;
          const h = missing ? 4 : Math.max(3, row.pct) * 1.55;
          return (
            <div
              key={row.week}
              title={`${row.label} · ${fmtRange(row.week)}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                zIndex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: missing ? "#b39cad" : T.accentDeep,
                  marginBottom: 4,
                  fontFamily: F,
                }}
              >
                {missing ? "—" : `${row.pct}%`}
              </div>
              <div
                style={{
                  width: "100%",
                  maxWidth: 54,
                  height: h,
                  borderRadius: "10px 10px 4px 4px",
                  background: missing
                    ? T.track
                    : row.isCurrentWeek
                      ? undefined
                      : `linear-gradient(180deg, #A64A73, ${T.accentDeep})`,
                  ...(row.isCurrentWeek && !missing
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(45deg, #E9C7D5 0 6px, #F6E4EC 6px 12px)",
                        border: "1.5px dashed #C98BA6",
                        boxSizing: "border-box",
                      }
                    : null),
                  ...(missing ? { border: "none" } : null),
                }}
              />
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: T.inkSoft,
                  marginTop: 8,
                  textAlign: "center",
                  lineHeight: 1.25,
                  fontFamily: F,
                }}
              >
                {row.label}
                {row.isCurrentWeek && !missing && (
                  <small style={{ display: "block", fontWeight: 700, color: "#b39cad", fontSize: 10 }}>
                    so far
                  </small>
                )}
                {missing && (
                  <small style={{ display: "block", fontWeight: 700, color: "#b39cad", fontSize: 10 }}>
                    not added yet
                  </small>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          padding: "10px 4px 0",
          fontSize: 11.5,
          color: T.inkSoft,
          fontWeight: 700,
          fontFamily: F,
        }}
      >
        <span>
          <Swatch solid />
          Finished weeks
        </span>
        <span>
          <Swatch hatched />
          This week so far
        </span>
      </div>

      {sel !== "all" && selectedGoal && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          {series.map((row) => {
            if (row.pct == null) {
              return (
                <div key={row.week} style={detailRow}>
                  <span style={{ fontWeight: 800, color: "#6d5560" }}>{row.label}</span>
                  <span style={{ color: T.inkSoft, fontWeight: 700 }}>not added yet</span>
                </div>
              );
            }
            const unit = selectedGoal.daily ? "days" : "sessions";
            return (
              <div key={row.week} style={detailRow}>
                <span style={{ fontWeight: 800, color: "#6d5560" }}>
                  {row.label}
                  {row.isCurrentWeek ? " · so far" : ""}
                </span>
                <span style={{ color: T.inkSoft, fontWeight: 700 }}>
                  {row.hits} of {row.target} {unit}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          background: T.sageSoft,
          color: "#4a6b45",
          borderRadius: 14,
          padding: "11px 14px",
          fontSize: 13.5,
          fontWeight: 700,
          marginTop: 14,
          lineHeight: 1.45,
          fontFamily: F,
        }}
      >
        {insight}
      </div>
    </Card>
  );
}

function ChipBtn({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        border: `1.5px solid ${on ? T.accentSoft : T.border}`,
        background: on ? T.accentSoft : "#fff",
        color: on ? T.accentDeep : "#6d5560",
        borderRadius: 999,
        padding: "7px 13px",
        fontWeight: 800,
        fontSize: 12.5,
        fontFamily: F,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Swatch({ solid, hatched: _hatched }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: 4,
        verticalAlign: -2,
        marginRight: 5,
        ...(solid
          ? { background: T.accentDeep }
          : {
              backgroundImage:
                "repeating-linear-gradient(45deg, #E9C7D5 0 4px, #F6E4EC 4px 8px)",
              border: "1px dashed #C98BA6",
              boxSizing: "border-box",
            }),
      }}
    />
  );
}

const detailRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "7px 2px",
  fontSize: 14,
  fontFamily: F,
};
