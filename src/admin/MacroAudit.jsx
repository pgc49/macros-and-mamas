/**
 * Macro check — admin-only, READ-ONLY.
 *
 * Compares every mama's stored macros against Callie's hand rules and lists
 * the drift. It never writes: the "rule says" numbers are a proposal, and
 * changing anything still means opening her row and typing it in.
 */
import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "../components/ui";
import { auditRoster, caloriesFromMacros, MACRO_RULES } from "../engine/auditMacros";

const LEVELS = [
  ["high", "Worth a look first", T.amber, T.amberSoft],
  ["medium", "Smaller drift", T.accentDeep, T.accentSoft],
  ["low", "Barely off", T.inkSoft, T.track],
];

const sign = (n) => (n > 0 ? `+${n}` : String(n));

function MacroLine({ label, cal, protein, carbs, fat, muted }) {
  return (
    <div style={{ fontSize: 13, color: muted ? T.inkSoft : T.ink, lineHeight: 1.6 }}>
      <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5, color: T.inkSoft }}>
        {label}
      </span>{" "}
      {cal} cal · {protein}p / {carbs}c / {fat}f
    </div>
  );
}

function AuditRow({ audit, onOpen }) {
  const { current, suggestion } = audit;
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 0" }}>
      <button
        type="button"
        onClick={() => onOpen?.(audit.id)}
        style={{
          background: "none", border: "none", padding: 0, cursor: onOpen ? "pointer" : "default",
          fontFamily: F, fontSize: 15, fontWeight: 700, color: T.ink, textAlign: "left",
        }}
      >
        {audit.name}
      </button>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>
        goal {audit.goalWeight ?? "?"} lb{audit.breastfeeding ? " · breastfeeding" : ""}
      </div>
      <MacroLine
        label="now"
        cal={current.cal}
        protein={current.protein}
        carbs={current.carbs}
        fat={current.fat}
      />
      {suggestion && (
        <MacroLine
          label="rule"
          cal={suggestion.cal}
          protein={suggestion.protein}
          carbs={suggestion.carbs}
          fat={suggestion.fat}
          muted
        />
      )}
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {audit.issues.map((i, idx) => (
          <li key={idx} style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
            <b style={{ color: T.ink }}>{i.label}</b>
            {i.delta != null ? ` (${sign(i.delta)})` : ""} — {i.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MacroAudit({ roster, onOpenClient }) {
  const [includeAdmins, setIncludeAdmins] = useState(false);

  const { flagged, checked } = useMemo(() => {
    const list = (roster || []).filter((c) => c?.macros && !c.refunded
      && (includeAdmins || String(c.role || "").toLowerCase() !== "admin"));
    return { flagged: auditRoster(roster, { includeAdmins }), checked: list.length };
  }, [roster, includeAdmins]);

  const clean = checked - flagged.length;

  return (
    <>
      <Card>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Macro check</div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
          Calories = goal weight × {MACRO_RULES.calPerLb} (× {MACRO_RULES.calPerLbBreastfeeding} nursing,
          floor {MACRO_RULES.breastfeedingFloor}) · protein {MACRO_RULES.proteinPerLb}g/lb ·
          fat {MACRO_RULES.fatPerLbMin}–{MACRO_RULES.fatPerLbMax}g/lb · carbs fill the rest.
        </div>
        <div style={{ fontSize: 13.5, color: T.ink, marginTop: 10, lineHeight: 1.55 }}>
          <b>{flagged.length}</b> flagged · <b>{clean}</b> match · {checked} checked.
        </div>
        <div style={{ fontSize: 12.5, color: T.sage, fontWeight: 700, marginTop: 8 }}>
          Read-only. Nothing here changes her numbers — tap a name to edit by hand.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: T.inkSoft }}>
          <input
            type="checkbox"
            checked={includeAdmins}
            onChange={(e) => setIncludeAdmins(e.target.checked)}
          />
          Include admin rows (you + Patrick)
        </label>
      </Card>

      {!flagged.length && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13.5, color: T.sage, lineHeight: 1.5 }}>
            Everyone matches the rules right now.
          </div>
        </Card>
      )}

      {LEVELS.map(([level, label, color, bg]) => {
        const group = flagged.filter((a) => a.severity === level);
        if (!group.length) return null;
        return (
          <Card key={level} style={{ marginTop: 12 }}>
            <div style={{
              display: "inline-block", padding: "4px 10px", borderRadius: 999,
              background: bg, color, fontSize: 12, fontWeight: 700, marginBottom: 6,
            }}>
              {label} · {group.length}
            </div>
            {group.map((a) => (
              <AuditRow key={a.id} audit={a} onOpen={onOpenClient} />
            ))}
          </Card>
        );
      })}

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>
          &quot;Numbers don&apos;t add up&quot; means protein × 4 + carbs × 4 + fat × 9 doesn&apos;t equal the
          calorie number she sees. Example: {caloriesFromMacros({ protein: 130, carbs: 175, fat: 60 })} cal
          from 130p / 175c / 60f.
        </div>
      </Card>
    </>
  );
}
