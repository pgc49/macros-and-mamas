/**
 * Admin Emails tab — Log (sends) vs Templates (lifecycle journey).
 * Catalog is read-only; this does not send, blast, or change cron timing.
 */
import { useEffect, useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, inputStyle } from "../components/ui";
import { db } from "../db/db";
import { CONFIG } from "../config";
import { catalogByJourney, catalogNumberLabel } from "../content/emailCatalog";
import { emailRecipient, emailTypeLabel, filterEmailEvents } from "./emailLog";

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

function EmptyLine({ children }) {
  return <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.45 }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>{children}</div>;
}

const VIEWS = [
  ["log", "Log"],
  ["templates", "Templates"],
];

function ViewBar({ view, setView }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 16px", flexWrap: "wrap" }}>
      {VIEWS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1.5px solid ${view === id ? T.accent : T.border}`,
            background: view === id ? T.accentSoft : "#fff",
            color: view === id ? T.accentDeep : T.inkSoft,
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

function statusCopy(status) {
  if (status === "ready" || status === "scheduled") return "Ready (manual send)";
  if (status === "retired") return "Retired";
  if (status === "manual") return "Manual";
  if (status === "paused") return "Paused";
  return "Live";
}

export function AdminEmails({ roster = [], onOpenMama }) {
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return "log";
    return new URLSearchParams(window.location.search).get("emails") === "templates"
      ? "templates"
      : "log";
  });
  const [events, setEvents] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (view !== "log") return;
    let cancelled = false;
    db.loadRecentEmailEvents(200).then((rows) => {
      if (!cancelled) setEvents(rows || []);
    });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== "templates") return;
    let cancelled = false;
    db.loadCohortWaitlist(CONFIG.WAITLIST_COHORT, 200).then((rows) => {
      if (!cancelled) setWaitlist(rows || []);
    });
    return () => { cancelled = true; };
  }, [view]);

  const journeys = useMemo(() => catalogByJourney(), []);
  const matches = useMemo(() => filterEmailEvents(events || [], query), [events, query]);

  return (
    <div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 12px" }}>
        {view === "log"
          ? "Emails we actually sent. Tap a mama to open her profile."
          : "The path a mama walks — subject and full copy, grouped by journey. Nothing here sends."}
      </p>
      <ViewBar view={view} setView={setView} />

      {view === "log" ? (
        <LogView
          events={events}
          matches={matches}
          query={query}
          setQuery={setQuery}
          roster={roster}
          onOpenMama={onOpenMama}
        />
      ) : (
        <TemplatesView
          journeys={journeys}
          waitlist={waitlist}
        />
      )}
    </div>
  );
}

function LogView({ events, matches, query, setQuery, roster, onOpenMama }) {
  return (
    <>
      <Card style={{ marginBottom: 14 }}>
        <SectionTitle>Sent emails</SectionTitle>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 10px" }}>
          Search by name, email, or type. Templates live on the other view.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, or type"
          aria-label="Search sent emails"
          style={{ ...inputStyle, width: "100%" }}
        />
        {events == null ? (
          <div style={{ marginTop: 12 }}>
            <EmptyLine>Loading sends…</EmptyLine>
          </div>
        ) : events.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyLine>No sends logged yet.</EmptyLine>
          </div>
        ) : matches.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyLine>No sends match that search.</EmptyLine>
          </div>
        ) : (
          matches.map((e, i) => {
            const who = emailRecipient(e);
            const client = e.profile_id ? (roster || []).find((c) => c.id === e.profile_id) : null;
            const canOpen = !!client && typeof onOpenMama === "function";
            return (
              <button
                key={e.id}
                type="button"
                disabled={!canOpen}
                onClick={canOpen ? () => onOpenMama(e.profile_id) : undefined}
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
                <div style={{ fontWeight: 700, fontSize: 15 }}>{who.name}</div>
                {who.email ? (
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{who.email}</div>
                ) : null}
                <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                  {emailTypeLabel(e)}
                  {e.subject ? ` · ${e.subject}` : ""}
                  {" · "}
                  {formatWhen(e.created_at)}
                  {e.status === "failed" ? " · Failed" : ""}
                </div>
              </button>
            );
          })
        )}
      </Card>
    </>
  );
}

function TemplatesView({ journeys, waitlist }) {
  return (
    <>
      {journeys.map((journey) => (
        <Card
          key={journey.id}
          style={{
            marginBottom: 14,
            background: journey.id === "callie" ? T.bg : T.card,
          }}
        >
          <SectionTitle>
            {journey.title}
            {journey.track ? ` · ${journey.track}` : ""}
          </SectionTitle>
          {journey.note ? (
            <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 10px" }}>
              {journey.note}
            </p>
          ) : null}
          {journey.templates.map((em, i) => (
            <TemplateCard key={em.id} email={em} first={i === 0} />
          ))}
        </Card>
      ))}

      <WaitlistCard waitlist={waitlist} />
    </>
  );
}

function TemplateCard({ email, first }) {
  return (
    <div
      style={{
        padding: "14px 0",
        borderTop: first ? "none" : `1px solid ${T.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.3 }}>
        {catalogNumberLabel(email)} · {email.audience} · {statusCopy(email.status)}
      </div>
      <div style={{ fontFamily: FD, fontSize: 20, marginTop: 4 }}>{email.name}</div>
      <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}>
        {email.trigger}
      </div>
      <EmailPreview email={email} />
    </div>
  );
}

function EmailPreview({ email }) {
  return (
    <div
      style={{
        marginTop: 10,
        background: T.bg,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 8 }}>
        From Callie
        {email.audience === "Callie" ? " · to Callie" : email.audience === "Waitlist" ? " · to waitlist" : " · to mama"}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, lineHeight: 1.4, marginBottom: 10 }}>
        {email.subject}
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          fontFamily: F,
          fontSize: 14,
          lineHeight: 1.55,
          color: T.ink,
        }}
      >
        {email.bodyPreview}
      </pre>
      {email.cta ? (
        <div
          style={{
            marginTop: 14,
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 999,
            background: T.accent,
            color: "#fff",
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {email.cta}
        </div>
      ) : null}
    </div>
  );
}

function WaitlistCard({ waitlist }) {
  const rows = waitlist || [];
  const stillOpen = rows.filter((r) => !r.paid_at && !r.converted_at).length;
  const label = CONFIG.WAITLIST_COHORT.replace("_", " ");

  return (
    <Card style={{ marginBottom: 28 }}>
      <SectionTitle>Waitlist roster · {label}</SectionTitle>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 10px" }}>
        People who asked to hear when spots open. The blast itself is template W above.
        Patrick runs a dry-run, then the real send. This list is not the send log.
      </p>
      {waitlist == null ? (
        <EmptyLine>Loading waitlist…</EmptyLine>
      ) : rows.length === 0 ? (
        <EmptyLine>No waitlist signups yet.</EmptyLine>
      ) : (
        <>
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, marginBottom: 4 }}>
            <b style={{ color: T.ink }}>{rows.length}</b> on the list
            {stillOpen !== rows.length ? ` · ${stillOpen} still unpaid / unconverted` : ""}
          </div>
          {rows.slice(0, 12).map((r, i) => (
            <div
              key={r.id}
              style={{
                padding: "12px 0",
                borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
              </div>
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{r.email}</div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>{formatWhen(r.created_at)}</div>
            </div>
          ))}
          {rows.length > 12 ? (
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8 }}>
              +{rows.length - 12} more in Supabase
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
