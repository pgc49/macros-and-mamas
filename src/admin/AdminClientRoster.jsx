import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { localDateIso } from "../utils/dates";
import { MealSearchInput } from "../components/ui";
import { adminCohortName } from "../lib/cohorts";
import {
  filterRoster,
  formatLastMessaged,
  listRosterCohorts,
  ROSTER_SORTS,
  rosterFilterCounts,
  adminPersonTitle,
} from "./clientRoster";
import { formatLastLogged } from "./clientHealth";
import { boardReason, canPassToday, listPassedToday } from "./dailySkip";
import { smsHref } from "./phoneSms";
import { formatReferredByHint } from "./referredBy";

/** Opens iPhone Messages (iMessage when that number can). Not the in-app thread. */
export function TextSmsButton({ phone, compact = false, name = "" }) {
  const href = smsHref(phone);
  if (!href) {
    return compact ? null : (
      <span style={{ fontSize: 12.5, color: T.inkSoft }}>—</span>
    );
  }
  const label = name ? `Text ${name}` : "Text";
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={label}
      aria-label={name ? `Text ${name} in Messages` : "Text in Messages"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 44,
        minWidth: 44,
        padding: compact ? "0 12px" : "0 14px",
        borderRadius: 12,
        border: `1.5px solid ${T.border}`,
        background: "#fff",
        color: T.ink,
        fontFamily: F,
        fontWeight: 800,
        fontSize: 13,
        textDecoration: "none",
        cursor: "pointer",
        lineHeight: 1.2,
      }}
    >
      Text
    </a>
  );
}

function stageShort(c) {
  const stage = c.stage || "signed_up";
  if (stage === "active" || c.status === "active") return `W${c.week ?? "—"}`;
  if (stage === "awaiting_approval" || (c.status === "pending" && c.hasIntake && c.paid)) return "Approve";
  if (stage === "paid_awaiting_intake") return "Intake";
  if (stage === "refunded" || c.refunded) return "Refunded";
  if (stage === "signed_up") return "Unpaid";
  return stage;
}

const FILTERS = [
  ["needs_help", "Needs help"],
  ["needs_note", "Needs a note"],
  ["unread", "Unread"],
  ["quiet", "Quiet 3d"],
  ["doing_well", "Doing well"],
  ["steady", "Steady"],
  ["active", "Active"],
  ["awaiting_approval", "Approve"],
  ["awaiting_intake", "Need intake"],
  ["paid", "Paid"],
  ["unpaid", "Unpaid"],
  ["refunded", "Refunded"],
  ["all", "All"],
];

function rosterSortHint(filter, sort = "board", dir = "asc") {
  if (sort === "last_messaged") {
    return dir === "desc"
      ? "You messaged most recently first. "
      : "Never / oldest note first — weekly touch-base. ";
  }
  if (sort === "last_logged") {
    return dir === "desc"
      ? "Most recent meal / water / weigh-in first. "
      : "Longest since a log first. ";
  }
  if (sort === "name") return dir === "desc" ? "Z–A. " : "A–Z. ";
  if (sort === "signed_up") {
    return dir === "desc" ? "Newest signups first. " : "Oldest signups first. ";
  }
  if (filter === "unpaid") return "Newest signups first. ";
  if (filter === "needs_note") return "No personal note in 7 days. Never / oldest first. ";
  if (filter === "active" || filter === "doing_well" || filter === "steady") return "Alphabetical. ";
  if (filter === "needs_help" || filter === "quiet") {
    return "Unread and approvals stay until you handle them. Quiet: message or Not today. A reply after you pass brings her back. ";
  }
  return "Waiting on you first, then oldest message. ";
}

function defaultDirForSort(sort) {
  if (sort === "signed_up") return "desc";
  return "asc";
}

const REASON_LABEL = {
  unread: "Unread",
  approve: "Approve",
  quiet: "Quiet",
};

export function CohortFilterBar({ roster = [], cohort = "all", setCohort, options: optionsProp }) {
  const computed = useMemo(() => listRosterCohorts(roster), [roster]);
  const options = optionsProp || computed;
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
          aria-pressed={cohort === opt.id}
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
  onPassToday,
  onUndoPass,
  nowMs = Date.now(),
  todayIso = localDateIso(),
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("board");
  const [dir, setDir] = useState("asc");
  const counts = useMemo(
    () => rosterFilterCounts(roster, todayIso, cohort, nowMs),
    [roster, todayIso, cohort, nowMs],
  );
  const filtered = useMemo(
    () => filterRoster(roster, filter, { query, todayIso, cohort, nowMs, sort, dir }),
    [roster, filter, query, todayIso, cohort, nowMs, sort, dir],
  );
  const showPass = filter === "needs_help" || filter === "quiet";
  const passed = useMemo(
    () => (showPass ? listPassedToday(roster, { query, cohort, nowMs }) : []),
    [showPass, roster, query, cohort, nowMs],
  );

  const countFor = (id) => {
    if (id === "needs_help") return counts.needsHelp;
    if (id === "needs_note") return counts.needsNote;
    if (id === "unread") return counts.unread;
    if (id === "quiet") return counts.quiet;
    if (id === "doing_well") return counts.doingWell;
    if (id === "steady") return counts.steady;
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
              onClick={() => {
                setFilter(id);
                if (id === "needs_note") {
                  setSort("last_messaged");
                  setDir("asc");
                }
              }}
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
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "nowrap",
          overflowX: "auto",
          marginBottom: 8,
          paddingBottom: 2,
          WebkitOverflowScrolling: "touch",
          alignItems: "center",
        }}
      >
        <span style={{ flex: "0 0 auto", fontSize: 12, fontWeight: 800, color: T.inkSoft }}>
          Sort
        </span>
        {ROSTER_SORTS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            onClick={() => {
              if (id === sort && id !== "board") {
                setDir((prev) => (prev === "asc" ? "desc" : "asc"));
                return;
              }
              setSort(id);
              setDir(defaultDirForSort(id));
            }}
            style={{
              flex: "0 0 auto",
              minHeight: 36,
              padding: "6px 12px",
              borderRadius: 999,
              border: `1.5px solid ${sort === id ? T.ink : T.border}`,
              background: sort === id ? T.ink : "#fff",
              color: sort === id ? "#fff" : T.inkSoft,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: F,
            }}
          >
            {label}
          </button>
        ))}
        {sort !== "board" ? (
          <>
            <button
              type="button"
              aria-pressed={dir === "asc"}
              onClick={() => setDir("asc")}
              style={{
                flex: "0 0 auto",
                minHeight: 36,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1.5px solid ${dir === "asc" ? T.ink : T.border}`,
                background: dir === "asc" ? T.track : "#fff",
                color: T.ink,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              {sort === "name" ? "A–Z" : "Oldest first"}
            </button>
            <button
              type="button"
              aria-pressed={dir === "desc"}
              onClick={() => setDir("desc")}
              style={{
                flex: "0 0 auto",
                minHeight: 36,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1.5px solid ${dir === "desc" ? T.ink : T.border}`,
                background: dir === "desc" ? T.track : "#fff",
                color: T.ink,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              {sort === "name" ? "Z–A" : "Newest first"}
            </button>
          </>
        ) : null}
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.4 }}>
        {rosterSortHint(filter, sort, dir)}
        Tap a card to engage.
      </p>
      {!filtered.length && !passed.length ? (
        <div style={{ fontSize: 14, color: T.inkSoft, padding: "18px 4px" }}>
          {query.trim()
            ? "No one matches that search."
            : showPass
              ? "Queue is clear. New replies and approvals will show up here."
              : "Nobody in this filter right now."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!filtered.length && showPass ? (
            <div style={{ fontSize: 14, color: T.inkSoft, padding: "8px 4px 4px" }}>
              Queue is clear. New replies and approvals will show up here.
            </div>
          ) : null}
          {filtered.map((c) => {
            const title = adminPersonTitle(c);
            const short = stageShort(c);
            const messaged = formatLastMessaged(c.lastAdminAt, nowMs);
            const logged = formatLastLogged(c, todayIso);
            const unread = Number(c.unreadFromMama) || 0;
            const referredHint = formatReferredByHint(c.referredBy);
            const reason = boardReason(c, todayIso);
            const passable = showPass && canPassToday(c, todayIso, nowMs);
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
                    {reason === "quiet" && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          fontFamily: F,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: T.amberSoft,
                          color: T.amber,
                        }}
                      >
                        {REASON_LABEL.quiet}
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
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: logged.stale ? T.amber : T.inkSoft,
                      marginTop: 2,
                    }}
                  >
                    {logged.label === "Never logged"
                      ? "Never logged"
                      : `Last logged · ${logged.label}`}
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                    <TextSmsButton phone={c.phone} name={title} compact />
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
                    {passable ? (
                      <button
                        type="button"
                        onClick={() => onPassToday?.(c)}
                        aria-label={`Not today for ${title}`}
                        style={{
                          minHeight: 44,
                          padding: "0 12px",
                          borderRadius: 12,
                          border: `1.5px solid ${T.border}`,
                          background: "#fff",
                          color: T.inkSoft,
                          fontFamily: F,
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Not today
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {passed.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: T.inkSoft, margin: "8px 4px 8px" }}>
                Passed until tonight · {passed.length}
              </div>
              {passed.map((c) => {
                const title = adminPersonTitle(c);
                return (
                  <div
                    key={`passed-${c.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: `1px dashed ${T.border}`,
                      background: T.track,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: FD, fontSize: 16, color: T.inkSoft }}>{title}</div>
                      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                        Back on the board if she replies
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUndoPass?.(c)}
                      aria-label={`Put ${title} back on the board`}
                      style={{
                        minHeight: 44,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: `1.5px solid ${T.border}`,
                        background: "#fff",
                        color: T.ink,
                        fontFamily: F,
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                        flex: "0 0 auto",
                      }}
                    >
                      Undo
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
