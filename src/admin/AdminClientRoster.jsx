import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { localDateIso } from "../utils/dates";
import { MealSearchInput } from "../components/ui";
import { adminCohortName } from "../lib/cohorts";
import {
  filterRoster,
  formatLastMessaged,
  isReadyToApprove,
  listRosterCohorts,
  rosterFilterCounts,
  rosterTitle,
} from "./clientRoster";
import { formatReferredByHint } from "./referredBy";

export function CopyPhoneButton({ phone, compact = false }) {
  const [copied, setCopied] = useState(false);
  if (!phone) {
    return compact ? null : (
      <span style={{ fontSize: 12.5, color: T.inkSoft }}>—</span>
    );
  }
  const onCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(String(phone).trim());
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
      title="Copy phone"
      aria-label={copied ? "Phone copied" : `Copy phone ${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 4 : 6,
        maxWidth: "100%",
        minHeight: 44,
        padding: compact ? "8px 10px" : "8px 12px",
        borderRadius: 10,
        border: `1px solid ${copied ? T.sage : T.border}`,
        background: copied ? T.sageSoft : "#fff",
        color: copied ? T.sage : T.ink,
        fontFamily: F,
        fontSize: compact ? 13 : 14,
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1.2,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {copied ? "Copied" : phone}
      </span>
    </button>
  );
}

function stageShort(c) {
  const stage = c.stage || "signed_up";
  if (stage === "active" || c.status === "active") return `W${c.week ?? "—"}`;
  if (isReadyToApprove(c)) return "Approve";
  if (stage === "paid_awaiting_intake") return "Intake";
  if (stage === "refunded" || c.refunded) return "Refunded";
  if (stage === "signed_up") return "Unpaid";
  return stage;
}

const FILTERS = [
  ["needs_you", "Needs you"],
  ["active", "Active"],
  ["awaiting_approval", "Ready to approve"],
  ["awaiting_intake", "Need intake"],
  ["paid", "Paid"],
  ["unpaid", "Unpaid"],
  ["refunded", "Refunded"],
  ["all", "All"],
];

function rosterSortHint(filter) {
  if (filter === "unpaid") return "Newest signups first. ";
  if (filter === "active") return "Alphabetical. ";
  if (filter === "awaiting_approval") return "Paid, intake in — waiting on your approve tap. ";
  return "Waiting on you first, then oldest message. ";
}

/** Overview / admin-wide interrupt: live paid + intake + not approved count. */
export function ReadyToApproveBanner({ count = 0, onOpen }) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      aria-label={`${n} ready to approve. Open this queue.`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        boxSizing: "border-box",
        marginBottom: 14,
        padding: "16px 18px",
        borderRadius: 14,
        border: `2px solid ${T.amber}`,
        background: T.amberSoft,
        color: T.amber,
        fontFamily: F,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span>
        <span style={{ display: "block", fontFamily: FD, fontSize: 20, color: T.ink, marginBottom: 4 }}>
          {n} ready to approve
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.inkSoft }}>
          Paid and intake in — waiting on your tap.
        </span>
      </span>
      <span
        style={{
          flexShrink: 0,
          fontWeight: 800,
          fontSize: 13,
          padding: "8px 12px",
          borderRadius: 999,
          background: T.amber,
          color: "#fff",
        }}
      >
        Review →
      </span>
    </button>
  );
}

export function CohortFilterBar({ roster = [], cohort = "all", setCohort }) {
  const options = useMemo(() => listRosterCohorts(roster), [roster]);
  if (options.length <= 1) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "nowrap",
        overflowX: "auto",
        marginBottom: 10,
        paddingBottom: 2,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setCohort?.(opt.id)}
          style={{
            flex: "0 0 auto",
            minHeight: 36,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1.5px solid ${cohort === opt.id ? T.ink : T.border}`,
            background: cohort === opt.id ? T.ink : "#fff",
            color: cohort === opt.id ? "#fff" : T.inkSoft,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AdminClientRoster({
  roster = [],
  filter,
  setFilter,
  cohort = "all",
  setCohort,
  onOpenClient,
  onMessageClient,
  nowMs = Date.now(),
  todayIso = localDateIso(),
}) {
  const [query, setQuery] = useState("");
  const counts = useMemo(
    () => rosterFilterCounts(roster, todayIso, cohort),
    [roster, todayIso, cohort],
  );
  const filtered = useMemo(
    () => filterRoster(roster, filter, { query, todayIso, cohort }),
    [roster, filter, query, todayIso, cohort],
  );

  const countFor = (id) => {
    if (id === "needs_you") return counts.needsYou;
    if (id === "active") return counts.active;
    if (id === "awaiting_approval") return counts.awaitingApproval;
    if (id === "awaiting_intake") return counts.awaitingIntake;
    if (id === "unpaid") return counts.unpaid;
    if (id === "paid") return counts.paid;
    if (id === "refunded") return counts.refunded;
    if (id === "all") return counts.all;
    return 0;
  };

  return (
    <>
      <MealSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search name, email, or phone"
        style={{ marginBottom: 10 }}
      />
      <CohortFilterBar roster={roster} cohort={cohort} setCohort={setCohort} />
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "nowrap",
          overflowX: "auto",
          marginBottom: 12,
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {FILTERS.map(([id, label]) => {
          const n = countFor(id);
          const showCount = id === "all" || n > 0 || filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              style={{
                flex: "0 0 auto",
                minHeight: 40,
                padding: "8px 14px",
                borderRadius: 999,
                border: `1.5px solid ${filter === id ? T.accent : T.border}`,
                background: filter === id ? T.accent : "#fff",
                color: filter === id ? "#fff" : T.inkSoft,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              {label}
              {showCount ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.4 }}>
        {rosterSortHint(filter)}
        Tap a row for her profile.
      </p>
      {!filtered.length ? (
        <div style={{ fontSize: 14, color: T.inkSoft, padding: "18px 4px" }}>
          {query.trim() ? "No one matches that search." : "Nobody in this filter right now."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => {
            const title = rosterTitle(c);
            const short = stageShort(c);
            const messaged = formatLastMessaged(c.lastAdminAt, nowMs);
            const unread = Number(c.unreadFromMama) || 0;
            const referredHint = formatReferredByHint(c.referredBy);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenClient?.(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenClient?.(c.id);
                  }
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "14px 14px 14px 16px",
                  borderRadius: 16,
                  border: `1.5px solid ${unread ? T.accent : T.border}`,
                  background: unread ? T.accentSoft : "#fff",
                  cursor: "pointer",
                  minHeight: 72,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: FD,
                        fontSize: 18,
                        color: T.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {title}
                    </span>
                    {c.role === "admin" && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: F,
                          padding: "2px 7px",
                          borderRadius: 99,
                          background: T.accentSoft,
                          color: T.accentDeep,
                        }}
                      >
                        Admin
                      </span>
                    )}
                    {c.comp && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: F,
                          padding: "2px 7px",
                          borderRadius: 99,
                          background: T.sageSoft,
                          color: T.sage,
                        }}
                      >
                        Comp
                      </span>
                    )}
                    {cohort === "all" && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: F,
                          padding: "2px 7px",
                          borderRadius: 99,
                          background: T.track,
                          color: T.inkSoft,
                        }}
                      >
                        {adminCohortName(c.cohort_label)}
                      </span>
                    )}
                    {unread > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          fontFamily: F,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: T.accent,
                          color: "#fff",
                        }}
                      >
                        {unread} waiting
                      </span>
                    )}
                  </div>
                  {c.email ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: T.inkSoft,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.email}
                    </div>
                  ) : null}
                  {referredHint ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: T.inkSoft,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {referredHint}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: messaged.stale ? T.amber : T.inkSoft,
                      marginTop: 4,
                    }}
                  >
                    {messaged.label === "Never messaged"
                      ? "Never messaged"
                      : `You messaged · ${messaged.label}`}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 9px",
                      borderRadius: 99,
                      background:
                        short === "Approve" || short === "Intake"
                          ? T.amberSoft
                          : short.startsWith("W")
                            ? T.sageSoft
                            : T.track,
                      color:
                        short === "Approve" || short === "Intake"
                          ? T.amber
                          : short.startsWith("W")
                            ? T.sage
                            : T.inkSoft,
                    }}
                  >
                    {short}
                  </span>
                  <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <CopyPhoneButton phone={c.phone} compact />
                    <button
                      type="button"
                      onClick={() => onMessageClient?.(c.id)}
                      aria-label={`Message ${title}`}
                      style={{
                        minHeight: 44,
                        minWidth: 44,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: `1.5px solid ${T.accent}`,
                        background: "#fff",
                        color: T.accentDeep,
                        fontFamily: F,
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Msg
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
