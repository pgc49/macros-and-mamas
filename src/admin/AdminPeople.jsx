import { T, F } from "../theme/tokens";
import { AdminClientRoster } from "./AdminClientRoster";
import { AdminLeads } from "./AdminLeads";
import { ErrorBoundary } from "../components/ErrorBoundary";

const SEGMENTS = [
  ["clients", "Clients"],
  ["leads", "Leads"],
];

function SegmentBar({ segment, setSegment }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 12px", flexWrap: "wrap" }}>
      {SEGMENTS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={segment === id}
          onClick={() => setSegment(id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1.5px solid ${segment === id ? T.accent : T.border}`,
            background: segment === id ? T.accentSoft : "#fff",
            color: segment === id ? T.accentDeep : T.inkSoft,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function AdminPeople({
  segment,
  setSegment,
  roster = [],
  filter,
  setFilter,
  cohortFilter,
  setCohortFilter,
  leadsFilter,
  selectedLeadEmail,
  onOpenClient,
  onMessageClient,
  onPassToday,
  onUndoPass,
  onAdminTouch,
}) {
  const current = segment === "leads" ? "leads" : "clients";
  return (
    <>
      <SegmentBar segment={current} setSegment={setSegment} />

      {current === "leads" && (
        <ErrorBoundary message="Leads admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminLeads
            onOpenMama={onOpenClient}
            initialFilter={leadsFilter}
            initialSelectedEmail={selectedLeadEmail}
            onAdminTouch={onAdminTouch}
          />
        </ErrorBoundary>
      )}

      {current === "clients" && (
        <AdminClientRoster
          roster={roster}
          filter={filter}
          setFilter={setFilter}
          cohort={cohortFilter}
          setCohort={setCohortFilter}
          onOpenClient={onOpenClient}
          onMessageClient={onMessageClient}
          onPassToday={onPassToday}
          onUndoPass={onUndoPass}
        />
      )}
    </>
  );
}
