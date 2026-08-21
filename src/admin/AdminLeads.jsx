/**
 * Admin Leads tab — every quiz complete (the Meta Lead we fire).
 * Not Meta Ads Manager. Quiz-only emails live here; Clients is profiles.
 * Tap a lead to see her address, mailto, and send history for that email.
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { db } from "../db/db";
import { copyText } from "../utils/clipboard";
import { emailTypeLabel, leadMailtoHref } from "./emailLog";
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

function leadEmail(lead) {
  return String(lead?.email || "").trim();
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const actionBtnBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "8px 16px",
  borderRadius: 999,
  fontFamily: F,
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.2,
  cursor: "pointer",
  textDecoration: "none",
  boxSizing: "border-box",
};

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

function CopyEmailButton({ email }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await copyText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Email copied" : `Copy ${email}`}
      style={{
        ...actionBtnBase,
        border: `1.5px solid ${copied ? T.sage : T.border}`,
        background: copied ? T.sageSoft : "#fff",
        color: copied ? T.sage : T.ink,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LeadDetail({ lead, onBack, onOpenMama }) {
  const [events, setEvents] = useState(null);
  const email = leadEmail(lead);
  const mailto = leadMailtoHref(email);
  const canOpenCard = !!lead.profileId && typeof onOpenMama === "function";

  useEffect(() => {
    let cancelled = false;
    if (!email) {
      setEvents([]);
      return undefined;
    }
    setEvents(null);
    db.loadEmailEventsByEmail(email)
      .then((rows) => {
        if (!cancelled) setEvents(rows || []);
      })
      .catch((e) => {
        console.error("lead email history load failed", e);
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontFamily: F,
          fontSize: 13.5,
          fontWeight: 700,
          color: T.accentDeep,
          background: "none",
          border: "none",
          padding: "0 0 12px",
          cursor: "pointer",
        }}
      >
        ← Quiz leads
      </button>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
        Copy her address or email her from your phone. History is what we actually sent.
      </p>
      <Card style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: FD, fontSize: 22 }}>{leadDisplayName(lead)}</div>
        {email ? (
          <div style={{ fontSize: 16, color: T.ink, fontWeight: 700, marginTop: 8, wordBreak: "break-word" }}>
            {email}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 8 }}>No email on this lead.</div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {mailto ? (
            <>
              <CopyEmailButton email={email} />
              <a href={mailto} style={{ ...actionBtnBase, border: "none", background: T.accent, color: "#fff" }}>
                Email
              </a>
            </>
          ) : null}
          {canOpenCard ? (
            <button
              type="button"
              onClick={() => onOpenMama(lead.profileId)}
              style={{
                ...actionBtnBase,
                border: `1.5px solid ${T.accent}`,
                background: "transparent",
                color: T.accent,
              }}
            >
              Open client card
            </button>
          ) : null}
        </div>

        <div style={{ marginTop: 22 }}>
          <SectionTitle>Emails sent</SectionTitle>
        </div>
        {events == null ? (
          <EmptyLine>Loading emails…</EmptyLine>
        ) : events.length === 0 ? (
          <EmptyLine>No emails sent yet.</EmptyLine>
        ) : (
          events.map((e, i) => (
            <div
              key={e.id}
              style={{
                padding: "14px 0",
                borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>{emailTypeLabel(e)}</div>
              {e.subject ? (
                <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{e.subject}</div>
              ) : null}
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                {formatWhen(e.created_at)}
                {e.status === "failed" ? " · Failed" : ""}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

export function AdminLeads({ onOpenMama }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

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

  if (selected) {
    return (
      <LeadDetail
        lead={selected}
        onBack={() => setSelected(null)}
        onOpenMama={onOpenMama}
      />
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
        Quiz completes — the Meta Lead we fire, not Ads Manager.
        Tap a lead to see her email and what we've sent.
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
              const canOpen = !!leadEmail(row);
              return (
                <button
                  key={row.id}
                  type="button"
                  disabled={!canOpen}
                  onClick={canOpen ? () => setSelected(row) : undefined}
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
