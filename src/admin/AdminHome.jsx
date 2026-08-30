import { Link } from "react-router-dom";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { AdminVoiceDropCard } from "./AdminVoiceDropCard";
import { leftoverInPlayCount, pipelineCounts, todayStripStats } from "./homeQueue";
import { personStageLabel } from "./personStage";
import { rosterTitle } from "./clientRoster";

function QueueRow({ row, onOpen }) {
  const name = row.person?.name || rosterTitle(row.person?.client) || row.person?.email;
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 0",
        border: "none",
        borderBottom: `1px solid ${T.border}`,
        background: "none",
        cursor: "pointer",
        fontFamily: F,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{name}</span>
        <span style={{ fontSize: 12, color: T.inkSoft, whiteSpace: "nowrap" }}>
          {personStageLabel(row.person.stage)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3 }}>{row.reason}</div>
    </button>
  );
}

export function AdminHome({
  people = [],
  queue = [],
  roster = [],
  leftoverCount,
  cohortFilter,
  onOpenQueueRow,
  onOpenPeople,
  onOpenLeads,
  onOpenFunnel,
}) {
  const leftover = leftoverCount ?? leftoverInPlayCount(people);
  const today = todayStripStats(people);
  const pipe = pipelineCounts(people);
  const activeCount = (roster || []).filter((c) => c.role !== "admin" && (c.stage === "active" || c.status === "active")).length;

  return (
    <>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Needs you</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 8 }}>
          {leftover} leftover still in play
        </div>
        {queue.length === 0 ? (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
            Nothing waiting. Check leftover leads if you want to nudge.
          </div>
        ) : (
          queue.map((row) => (
            <QueueRow key={row.key} row={row} onOpen={onOpenQueueRow} />
          ))
        )}
        <Btn ghost small style={{ marginTop: 12 }} onClick={onOpenPeople}>
          Open People
        </Btn>
        <Btn ghost small style={{ marginTop: 8, marginLeft: 8 }} onClick={onOpenLeads}>
          Leftover leads
        </Btn>
      </Card>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Card style={{ flex: 1, margin: 0 }}>
          <div style={{ fontFamily: FD, fontSize: 22, color: T.ink }}>{today.newLeads}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft }}>New leftover today</div>
        </Card>
        <Card style={{ flex: 1, margin: 0 }}>
          <div style={{ fontFamily: FD, fontSize: 22, color: T.ink }}>{today.paidToday}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft }}>Paid today</div>
        </Card>
      </div>

      <button
        type="button"
        onClick={onOpenFunnel}
        style={{
          display: "block",
          width: "100%",
          marginTop: 12,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: F,
        }}
      >
        <Card>
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>Pipeline</div>
          <div style={{ display: "flex", gap: 6, height: 12, borderRadius: 99, overflow: "hidden", background: T.track }}>
            <div style={{ flex: Math.max(pipe.inPlay, 0.2), background: T.accent }} />
            <div style={{ flex: Math.max(pipe.settingUp, 0.2), background: T.amber }} />
            <div style={{ flex: Math.max(pipe.active, 0.2), background: T.sage }} />
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
            {pipe.inPlay} in play · {pipe.settingUp} setting up · {pipe.active} active
          </div>
        </Card>
      </button>

      <div style={{ marginTop: 12 }}>
        <AdminVoiceDropCard
          roster={roster}
          cohortFilter={cohortFilter}
          activeMamaCount={activeCount}
          allMamaCount={(roster || []).filter((c) => c.role !== "admin").length}
        />
      </div>

      <Link
        to={`${PATHS.support}?kind=feedback&from=admin`}
        style={{
          display: "block",
          textDecoration: "none",
          marginTop: 14,
          padding: "14px 16px",
          borderRadius: 14,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
          color: T.ink,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14.5, color: T.accentDeep }}>
          Feedback for Tech Guy
        </div>
      </Link>
    </>
  );
}
