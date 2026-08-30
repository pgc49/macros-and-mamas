import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AdminAnnouncements } from "./AdminAnnouncements";
import { AdminCredits } from "./AdminCredits";
import { AdminEmails } from "./AdminEmails";
import { AdminQuizFunnelCard } from "./AdminQuizFunnelCard";

const AI_LABELS = {
  estimate_photo: "Snap photo",
  estimate_text: "Describe",
  meal_suggest: "Suggest my week",
  meal_idea: "Meal ideas",
  meal_plan: "Meal plan",
  client_summary: "Client summary",
};

const AI_KINDS = {
  config: "not configured",
  auth: "bad API key",
  credits: "out of credits",
  rate_limited: "rate limited",
  timeout: "timed out",
  network: "network drop",
  upstream: "provider error",
  empty: "empty reply",
  parse: "unreadable reply",
};

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

function Menu({ setView }) {
  const items = [
    ["announcements", "Announcements"],
    ["emails", "Emails"],
    ["credits", "Credits"],
    ["funnel", "Funnel"],
    ["ai", "AI health"],
  ];
  return (
    <Card>
      <div style={{ fontFamily: FD, fontSize: 20, marginBottom: 8 }}>More</div>
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
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
            fontWeight: 700,
            fontSize: 15,
            color: T.ink,
          }}
        >
          {label}
        </button>
      ))}
    </Card>
  );
}

function AiHealth({ aiFailures }) {
  return (
    <Card>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 8 }}>AI health · last 24h</div>
      {!aiFailures.length ? (
        <div style={{ fontSize: 13.5, color: T.sage, lineHeight: 1.5 }}>
          No AI failures logged. Snap, Describe, and Suggest my week are all answering.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13.5, color: T.amber, lineHeight: 1.5, marginBottom: 8 }}>
            <b>{aiFailures.length}</b> failed AI call{aiFailures.length === 1 ? "" : "s"} in the last 24h.
            {aiFailures.some((f) => f.kind === "credits" || f.kind === "auth")
              ? " Check the OpenRouter key + balance."
              : " Clients were told to retry — no data lost."}
          </div>
          {Object.entries(
            aiFailures.reduce((acc, f) => {
              const k = `${AI_LABELS[f.label] || f.label} · ${AI_KINDS[f.kind] || f.kind}`;
              acc[k] = (acc[k] || 0) + 1;
              return acc;
            }, {}),
          ).map(([k, n]) => (
            <div key={k} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
              <b>{n}×</b> {k}
            </div>
          ))}
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
            Most recent: {formatWhen(aiFailures[0].created_at)}
          </div>
        </>
      )}
    </Card>
  );
}

export function AdminMore({
  view,
  setView,
  roster,
  cohortFilter,
  onOpenMama,
  onOpenLeads,
  aiFailures = [],
}) {
  if (view === "menu") return <Menu setView={setView} />;

  const back = (
    <button
      type="button"
      onClick={() => setView("menu")}
      style={{
        background: "none",
        border: "none",
        color: T.accent,
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        padding: "0 0 12px",
        fontFamily: F,
      }}
    >
      ← More
    </button>
  );

  return (
    <>
      {back}
      {view === "announcements" && (
        <AdminAnnouncements roster={roster} cohortFilter={cohortFilter} />
      )}
      {view === "emails" && (
        <ErrorBoundary message="Emails admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminEmails roster={roster} onOpenMama={onOpenMama} />
        </ErrorBoundary>
      )}
      {view === "credits" && (
        <ErrorBoundary message="Credits admin hit an error. Other admin tabs still work — refresh or switch tabs.">
          <AdminCredits roster={roster} />
        </ErrorBoundary>
      )}
      {view === "funnel" && (
        <AdminQuizFunnelCard
          onOpenLeads={(nextFilter) => onOpenLeads(nextFilter || "unpaid")}
        />
      )}
      {view === "ai" && <AiHealth aiFailures={aiFailures} />}
    </>
  );
}
