import { useMemo, useState } from "react";
import { T, F } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { AdminClientRoster, CohortFilterBar } from "./AdminClientRoster";
import { AdminLeads } from "./AdminLeads";
import { leftoverInPlayCount } from "./homeQueue";
import { personMatchesQuery } from "./personModel";
import { personStageColor, personStageLabel } from "./personStage";
import { ErrorBoundary } from "../components/ErrorBoundary";

const SEGMENTS = [
  ["needs_action", "Needs action"],
  ["leads", "Leads"],
  ["clients", "Clients"],
  ["all", "All"],
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

function PersonRow({ person, onOpen, onSnooze }) {
  const tone = personStageColor(person.stage, T);
  const tags = [...(person.nurtureTags || []), ...(person.lead?.needs_review ? ["Needs review"] : [])];
  return (
    <div
      style={{
        padding: "12px 0",
        borderBottom: `1px solid ${T.border}`,
        opacity: person.snoozed ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(person)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: F,
          padding: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{person.name}</span>
          <span style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 99,
            background: tone.bg,
            color: tone.color,
          }}
          >
            {person.stage === "cold"
              ? `Cold`
              : personStageLabel(person.stage)}
          </span>
        </div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 3 }}>
          {tags.join(" · ") || person.email}
          {person.snoozed ? " · snoozed" : ""}
        </div>
      </button>
      {person.kind === "lead" && !person.snoozed && (
        <Btn small ghost style={{ marginTop: 8 }} onClick={() => onSnooze(person)}>
          Snooze 2 days
        </Btn>
      )}
    </div>
  );
}

export function AdminPeople({
  segment,
  setSegment,
  people = [],
  queue = [],
  roster = [],
  filter,
  setFilter,
  cohortFilter,
  setCohortFilter,
  leadsFilter,
  selectedLeadEmail,
  onOpenPerson,
  onOpenClient,
  onMessageClient,
  onSnooze,
  onAdminTouch,
}) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sheet, setSheet] = useState({ source: "all", segment: "all", needsReview: "all" });
  const leftover = leftoverInPlayCount(people);

  const filtered = useMemo(() => {
    let list = people.filter((p) => personMatchesQuery(p, query));
    if (segment === "needs_action") {
      const keys = new Set(queue.map((r) => r.person.emailLower));
      list = list.filter((p) => keys.has(p.emailLower) && !p.snoozed);
    }
    if (sheet.source !== "all") {
      list = list.filter((p) => {
        const kind = String(p.lead?.sourceKind || p.sourceLabel || "");
        if (sheet.source === "referral") return kind.includes("referral");
        if (sheet.source === "meta_ad") return kind.startsWith("meta_ad");
        if (sheet.source === "meta_click") return kind.startsWith("meta_click");
        return kind === sheet.source;
      });
    }
    if (sheet.segment !== "all") {
      list = list.filter((p) => String(p.lead?.segment || "") === sheet.segment);
    }
    if (sheet.needsReview === "yes") {
      list = list.filter((p) => p.lead?.needs_review);
    }
    if (cohortFilter && cohortFilter !== "all") {
      list = list.filter((p) => (p.cohort_label || "unassigned") === cohortFilter);
    }
    return list;
  }, [people, query, segment, queue, sheet, cohortFilter]);

  return (
    <>
      <SegmentBar segment={segment} setSegment={setSegment} />
      {segment === "leads" && (
        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, margin: "-4px 0 10px" }}>
          {leftover} still in play
        </div>
      )}

      {segment !== "leads" && segment !== "clients" && (
        <>
          <input
            style={{ ...inputStyle, marginBottom: 10 }}
            placeholder="Search name, email, phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: T.accent,
              fontWeight: 700,
              fontFamily: F,
              fontSize: 13,
              cursor: "pointer",
              padding: "0 0 10px",
            }}
          >
            {showFilters ? "Hide filters" : "Filters"}
          </button>
          {showFilters && (
            <Card style={{ marginBottom: 12 }}>
              <CohortFilterBar roster={roster} cohort={cohortFilter} setCohort={setCohortFilter} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {[
                  ["all", "Any source"],
                  ["meta_ad", "Meta ad"],
                  ["meta_click", "Meta link"],
                  ["referral", "Referral"],
                  ["organic", "Organic"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSheet((s) => ({ ...s, source: id }))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1.5px solid ${sheet.source === id ? T.accent : T.border}`,
                      background: sheet.source === id ? T.accentSoft : "#fff",
                      color: sheet.source === id ? T.accentDeep : T.inkSoft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: F,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {[
                  ["all", "Any segment"],
                  ["main", "Main"],
                  ["pregnancy_nurture", "Pregnant"],
                  ["early_pp_nurture", "Early PP"],
                  ["waitlist_plantbased", "Plant-based"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSheet((s) => ({ ...s, segment: id }))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1.5px solid ${sheet.segment === id ? T.accent : T.border}`,
                      background: sheet.segment === id ? T.accentSoft : "#fff",
                      color: sheet.segment === id ? T.accentDeep : T.inkSoft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: F,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSheet((s) => ({
                  ...s,
                  needsReview: s.needsReview === "yes" ? "all" : "yes",
                }))}
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1.5px solid ${sheet.needsReview === "yes" ? T.accent : T.border}`,
                  background: sheet.needsReview === "yes" ? T.accentSoft : "#fff",
                  color: sheet.needsReview === "yes" ? T.accentDeep : T.inkSoft,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: F,
                }}
              >
                Needs review
              </button>
            </Card>
          )}
          <Card>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 14, color: T.inkSoft }}>No one in this list.</div>
            ) : (
              filtered.map((person) => (
                <PersonRow
                  key={person.key}
                  person={person}
                  onOpen={onOpenPerson}
                  onSnooze={onSnooze}
                />
              ))
            )}
          </Card>
        </>
      )}

      {segment === "leads" && (
        <ErrorBoundary message="Leads admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminLeads
            onOpenMama={onOpenClient}
            initialFilter={leadsFilter}
            initialSelectedEmail={selectedLeadEmail}
            onAdminTouch={onAdminTouch}
          />
        </ErrorBoundary>
      )}

      {segment === "clients" && (
        <AdminClientRoster
          roster={roster}
          filter={filter}
          setFilter={setFilter}
          cohort={cohortFilter}
          setCohort={setCohortFilter}
          onOpenClient={onOpenClient}
          onMessageClient={onMessageClient}
        />
      )}
    </>
  );
}
