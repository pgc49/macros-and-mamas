import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { DAYS, DAY_LABEL } from "../content/data";
import { Card, Btn } from "./ui";
import {
  CUSTOM_GOAL_CAP,
  CUSTOM_SUBTITLE_MAX,
  CUSTOM_TITLE_MAX,
  formFreqFromItem,
  frequencyFromForm,
  goalChecksThisWeek,
  goalWeekTarget,
  isFutureDayInWeek,
} from "../lib/goals";
import { localDateIso } from "../utils/dates";

const GUARDRAIL =
  "Goals here should add to your life — more water, more walks, more protein. Nothing restrictive. That's not how we do it. 🤍";

function Sheet({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(51,39,46,0.35)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          borderRadius: "26px 26px 0 0",
          padding: "20px 20px 28px",
          maxHeight: "88vh",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: "0 0 12px" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function FreqPills({ value, onChange }) {
  const opts = [
    { key: "daily", label: "Daily" },
    { key: "3", label: "3× a week" },
    { key: "5", label: "5× a week" },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              border: `1.6px solid ${on ? T.accentSoft : T.border}`,
              background: on ? T.accentSoft : "#fff",
              color: on ? T.accentDeep : T.inkSoft,
              borderRadius: 999,
              padding: "10px 6px",
              fontWeight: 800,
              fontSize: 13,
              fontFamily: F,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Weekly goals card — program rows + custom (YOURS) with add/edit sheets.
 */
export function GoalsCard({
  items,
  weekStart,
  isCurrentWeek,
  editable,
  checks,
  waterOz,
  todayWeekday,
  onToggle,
  onAddCustom,
  onUpdateCustom,
  onArchiveCustom,
  busy = false,
}) {
  const [sheet, setSheet] = useState(null); // 'add' | 'edit' | 'cap'
  const [editItem, setEditItem] = useState(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [freq, setFreq] = useState("daily");
  const [error, setError] = useState("");
  const [removeArmed, setRemoveArmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeCustom = (items || []).filter((i) => i.source === "custom").length;
  const today = localDateIso();

  const openAdd = () => {
    if (activeCustom >= CUSTOM_GOAL_CAP) {
      setSheet("cap");
      return;
    }
    setTitle("");
    setSubtitle("");
    setFreq("daily");
    setError("");
    setSheet("add");
  };

  const openEdit = (item) => {
    if (item.source !== "custom") return;
    setEditItem(item);
    setTitle(item.label || "");
    setSubtitle(item.subtitle || "");
    setFreq(formFreqFromItem(item));
    setError("");
    setRemoveArmed(false);
    setSheet("edit");
  };

  const close = () => {
    setSheet(null);
    setEditItem(null);
    setRemoveArmed(false);
    setError("");
  };

  const saveAdd = async () => {
    const name = title.trim();
    if (!name) {
      setError("Give your goal a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { frequency, n_target } = frequencyFromForm(freq);
      await onAddCustom({
        title: name.slice(0, CUSTOM_TITLE_MAX),
        subtitle: subtitle.trim().slice(0, CUSTOM_SUBTITLE_MAX) || null,
        frequency,
        n_target,
      });
      close();
    } catch (e) {
      setError(e?.message?.includes("cap") ? "You already have 3 custom goals. Archive one to add another." : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const name = title.trim();
    if (!name) {
      setError("Give your goal a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { frequency, n_target } = frequencyFromForm(freq);
      await onUpdateCustom(editItem.id, {
        title: name.slice(0, CUSTOM_TITLE_MAX),
        subtitle: subtitle.trim().slice(0, CUSTOM_SUBTITLE_MAX) || null,
        frequency,
        n_target,
      });
      close();
    } catch (e) {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editItem) return;
    if (!removeArmed) {
      setRemoveArmed(true);
      return;
    }
    setSaving(true);
    try {
      await onArchiveCustom(editItem.id);
      close();
    } catch (e) {
      setError("Couldn't remove — try again.");
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        {(items || []).map((it) => {
          const hits = goalChecksThisWeek(checks, it.id);
          const target = goalWeekTarget(it, weekStart);
          const isCustom = it.source === "custom";
          const waterNote = it.id === "water" && waterOz ? ` · ${waterOz} oz` : "";
          const sub = it.subtitle ? (it.subtitle.startsWith("·") ? ` ${it.subtitle}` : ` · ${it.subtitle}`) : "";

          return (
            <div key={it.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  cursor: isCustom ? "pointer" : "default",
                }}
                onClick={() => isCustom && openEdit(it)}
                role={isCustom ? "button" : undefined}
                tabIndex={isCustom ? 0 : undefined}
                onKeyDown={(e) => {
                  if (isCustom && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    openEdit(it);
                  }
                }}
              >
                <span>
                  {it.label}
                  <span style={{ color: T.inkSoft, fontWeight: 600, fontSize: 13.5 }}>
                    {waterNote || sub}
                  </span>
                </span>
                {isCustom && (
                  <span
                    style={{
                      background: "#EFE9F5",
                      color: "#5e4a78",
                      borderRadius: 8,
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                    }}
                  >
                    YOURS ✎
                  </span>
                )}
              </div>
              {!it.daily && (
                <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700, marginBottom: 6 }}>
                  goal {target}× a week · {hits} of {target} this week
                  {hits >= target ? " · ✓ goal hit" : ""}
                </div>
              )}
              {isCustom && it.daily && target < 7 && isCurrentWeek && (
                <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700, marginBottom: 6 }}>
                  Added mid-week · {hits} of {target} days left
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                {DAYS.map((d) => {
                  const done = !!checks[`${it.id}|${d}`];
                  const isTodayDot = isCurrentWeek && d === todayWeekday;
                  const future = isCurrentWeek && isFutureDayInWeek(weekStart, d, today);
                  const canTap = editable && !future;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!canTap}
                      onClick={() => { if (canTap) onToggle(it.id, d); }}
                      title={future ? "Not yet" : isTodayDot ? "Today" : undefined}
                      aria-current={isTodayDot ? "date" : undefined}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: canTap ? "pointer" : "default",
                        border: `1.5px solid ${done ? T.sage : isTodayDot ? T.accent : T.border}`,
                        background: done ? T.sage : "#fff",
                        color: done ? "#fff" : isTodayDot ? T.accentDeep : T.ink,
                        boxShadow: isTodayDot && !done ? `0 0 0 3px ${T.accentSoft}` : "none",
                        opacity: future ? 0.45 : editable ? 1 : 0.85,
                      }}
                    >
                      {DAY_LABEL[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={openAdd}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderTop: `1.5px dashed ${T.border}`,
            padding: "14px 4px 8px",
            marginTop: 4,
            background: "none",
            borderLeft: "none",
            borderRight: "none",
            borderBottom: "none",
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          <span style={{ color: T.accent, fontWeight: 800, fontSize: 14.5 }}>+ Add your own</span>
          <span style={{ color: "#a08fa0", fontSize: 12.5, fontWeight: 700 }}>
            {activeCustom} of {CUSTOM_GOAL_CAP} used
          </span>
        </button>
      </Card>

      <Sheet open={sheet === "add"} title="Add your own goal" onClose={close}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            GOAL NAME
          </label>
          <input
            value={title}
            maxLength={CUSTOM_TITLE_MAX}
            placeholder="10 min stretch before bed"
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            TARGET NOTE · OPTIONAL
          </label>
          <input
            value={subtitle}
            maxLength={CUSTOM_SUBTITLE_MAX}
            placeholder="e.g. · 10 min"
            onChange={(e) => setSubtitle(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            HOW OFTEN
          </label>
          <FreqPills value={freq} onChange={setFreq} />
        </div>
        <div
          style={{
            background: "#FBF6F8",
            border: `1px dashed ${T.border}`,
            borderRadius: 14,
            padding: "11px 13px",
            fontSize: 12.5,
            color: "#7a5a68",
            lineHeight: 1.45,
            margin: "4px 0 14px",
          }}
        >
          {GUARDRAIL}
        </div>
        {error && <div style={{ color: T.amber, fontSize: 13.5, marginBottom: 10 }}>{error}</div>}
        <Btn style={{ width: "100%" }} disabled={saving} onClick={saveAdd}>
          {saving ? "Saving…" : "Add goal"}
        </Btn>
        <Btn ghost style={{ width: "100%", marginTop: 8 }} onClick={close}>Cancel</Btn>
      </Sheet>

      <Sheet open={sheet === "edit"} title="Edit your goal" onClose={close}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            GOAL NAME
          </label>
          <input value={title} maxLength={CUSTOM_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            TARGET NOTE · OPTIONAL
          </label>
          <input value={subtitle} maxLength={CUSTOM_SUBTITLE_MAX} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>
            HOW OFTEN
          </label>
          <FreqPills value={freq} onChange={setFreq} />
        </div>
        {error && <div style={{ color: T.amber, fontSize: 13.5, marginBottom: 10 }}>{error}</div>}
        <Btn style={{ width: "100%" }} disabled={saving} onClick={saveEdit}>
          {saving ? "Saving…" : "Save changes"}
        </Btn>
        <button
          type="button"
          disabled={saving}
          onClick={remove}
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            padding: "13px 22px",
            borderRadius: 999,
            border: "1.6px solid #efd6d6",
            background: "#fff",
            color: "#a34a4a",
            fontWeight: 800,
            fontSize: 15,
            fontFamily: F,
            cursor: "pointer",
          }}
        >
          {removeArmed ? "Tap again to remove — history stays saved." : "Remove goal"}
        </button>
        <Btn ghost style={{ width: "100%", marginTop: 8 }} onClick={close}>Cancel</Btn>
      </Sheet>

      <Sheet open={sheet === "cap"} title="Three custom goals max" onClose={close}>
        <p style={{ fontSize: 14.5, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 16px" }}>
          Archive one of your YOURS goals (tap its name → Remove) to free a slot. Callie&apos;s program goals stay put.
        </p>
        <Btn style={{ width: "100%" }} onClick={close}>Got it</Btn>
      </Sheet>
    </>
  );
}

const inputStyle = {
  width: "100%",
  border: `1.6px solid ${T.border}`,
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 15,
  fontFamily: F,
  color: T.ink,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
