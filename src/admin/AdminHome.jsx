import { Link } from "react-router-dom";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { PATHS } from "../routing";
import { AdminVoiceDropCard } from "./AdminVoiceDropCard";
import { newLeftoverLastHours } from "./homeQueue";
import { clientHealthByCohort } from "./clientHealth";
import { localDateIso } from "../utils/dates";

const BANDS = [
  ["needs_help", "Needs help", "needs_help"],
  ["steady", "Steady", "steady"],
  ["doing_well", "Doing well", "doing_well"],
];

function LeadRow({ person, onOpen }) {
  const name = person?.name || person?.email;
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
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
      <div style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{name}</div>
      <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3 }}>
        {person.email}
        {person.nurtureTags?.length ? ` · ${person.nurtureTags.join(" · ")}` : ""}
      </div>
    </button>
  );
}

export function AdminHome({
  people = [],
  roster = [],
  cohortFilter,
  onOpenLead,
  onOpenLeads,
  onOpenClients,
}) {
  const freshLeads = newLeftoverLastHours(people);
  const health = clientHealthByCohort(roster, localDateIso());
  const activeCount = (roster || []).filter((c) => c.role !== "admin" && (c.stage === "active" || c.status === "active")).length;

  return (
    <>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>New leftover · 24h</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 8 }}>
          Quiz complete, not paid.
        </div>
        {freshLeads.length === 0 ? (
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
            No new leftover leads in the last 24 hours.
          </div>
        ) : (
          freshLeads.map((person) => (
            <LeadRow key={person.key} person={person} onOpen={onOpenLead} />
          ))
        )}
        <button
          type="button"
          onClick={onOpenLeads}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: T.accent,
            fontWeight: 700,
            fontFamily: F,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Open leftover leads
        </button>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 4 }}>Client health</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>
          Needs help is unread, waiting on approval, or no logs in 3+ days.
          Logged is meals / water / weigh-ins.
        </div>
        {health.length === 0 ? (
          <div style={{ fontSize: 14, color: T.inkSoft }}>No paid clients to score yet.</div>
        ) : (
          health.map((row) => (
            <div key={row.cohort} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 8 }}>
                {row.label}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {BANDS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenClients(id, row.cohort)}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${T.border}`,
                      background: id === "needs_help" ? T.amberSoft : "#fff",
                      borderRadius: 12,
                      padding: "10px 6px",
                      cursor: "pointer",
                      fontFamily: F,
                    }}
                  >
                    <div style={{
                      fontFamily: FD,
                      fontSize: 22,
                      color: id === "needs_help" ? T.amber : T.ink,
                    }}
                    >
                      {row[id]}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginTop: 2 }}>
                      {label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>

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
