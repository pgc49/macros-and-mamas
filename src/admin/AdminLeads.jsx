/**
 * Admin Leads tab — every quiz complete (the Meta Lead we fire).
 * Not Meta Ads Manager. Quiz-only emails live here; Clients is profiles.
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import {
  QUIZ_LEAD_FILTERS,
  filterQuizLeads,
  formatLeadTags,
  formatLeadWhen,
  formatMacroRanges,
  leadDisplayName,
  loadQuizLeads,
  quizLeadFunnelLabel,
  quizLeadSourceLabel,
} from "./quizLeads";

function EmptyLine({ children }) {
  return <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.45 }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>{children}</div>;
}

function FilterBar({ filter, setFilter }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 16px", flexWrap: "wrap" }}>
      {QUIZ_LEAD_FILTERS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setFilter(id)}
          aria-pressed={filter === id}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1.5px solid ${filter === id ? T.accent : T.border}`,
            background: filter === id ? T.accentSoft : "#fff",
            color: filter === id ? T.accentDeep : T.inkSoft,
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

export function AdminLeads({ onOpenMama }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    loadQuizLeads()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setError("");
      })
      .catch((e) => {
        console.error("quiz leads load failed", e);
        if (!cancelled) setError("Couldn't load quiz leads.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => filterQuizLeads(rows || [], filter), [rows, filter]);

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
        Quiz completes — the Meta Lead we fire, not Ads Manager.
        Tap a mama with an account to open her client card.
      </p>
      <FilterBar filter={filter} setFilter={setFilter} />
      <Card style={{ marginBottom: 28 }}>
        <SectionTitle>Quiz leads</SectionTitle>
        {error ? (
          <EmptyLine>{error}</EmptyLine>
        ) : rows == null ? (
          <EmptyLine>Loading quiz leads…</EmptyLine>
        ) : rows.length === 0 ? (
          <EmptyLine>No quiz completes yet.</EmptyLine>
        ) : matches.length === 0 ? (
          <EmptyLine>No quiz leads match this filter.</EmptyLine>
        ) : (
          <>
            <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 4px" }}>
              {filter === "all"
                ? `${matches.length} quiz complete${matches.length === 1 ? "" : "s"}`
                : `${matches.length} of ${rows.length}`}
            </p>
            {matches.map((row, i) => {
              const canOpen = !!row.profileId && typeof onOpenMama === "function";
              return (
                <button
                  key={row.id}
                  type="button"
                  disabled={!canOpen}
                  onClick={canOpen ? () => onOpenMama(row.profileId) : undefined}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 0",
                    border: "none",
                    borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                    background: "transparent",
                    cursor: canOpen ? "pointer" : "default",
                    fontFamily: F,
                    color: T.ink,
                    marginTop: i === 0 ? 8 : 0,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{leadDisplayName(row)}</div>
                  {row.email ? (
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{row.email}</div>
                  ) : null}
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                    {formatLeadWhen(row.created_at)}
                    {" · "}
                    {quizLeadSourceLabel(row)}
                    {" · "}
                    {quizLeadFunnelLabel(row.funnelStatus)}
                  </div>
                  {formatLeadTags(row) ? (
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                      {formatLeadTags(row)}
                    </div>
                  ) : null}
                  {formatMacroRanges(row) ? (
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                      {formatMacroRanges(row)}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </>
        )}
      </Card>
    </div>
  );
}
