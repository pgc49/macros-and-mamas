import { T, F, FD } from "../theme/tokens";
import { COACH_COPY, askForSlotCopy } from "../content/coachVoice";
import { coachEntryHint } from "../utils/coachLines";
import { loggedSlotsFromEntries } from "../utils/coachBudget";

/**
 * The way into the coach from Today. Says something true about her day rather
 * than advertising itself, so it reads as the next step and not as a banner.
 */
export function CoachEntry({ answer, entries = [], plannedMeals = [], onOpen }) {
  if (!answer?.budget) return null;
  const logged = loggedSlotsFromEntries(entries);
  const hint = coachEntryHint({ loggedSlots: logged, plannedMeals, read: answer.read });

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${T.accent}`,
        borderRadius: 14,
        padding: "13px 15px",
        marginBottom: 10,
        cursor: "pointer",
        fontFamily: F,
      }}
    >
      <div style={{ fontFamily: FD, fontSize: 17, color: T.ink, marginBottom: 3 }}>
        {logged.size === 0 ? COACH_COPY.entryTitle : askForSlotCopy(answer.slot)}
      </div>
      <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>{hint}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep, marginTop: 8 }}>
        {COACH_COPY.entryCta} →
      </div>
    </button>
  );
}
