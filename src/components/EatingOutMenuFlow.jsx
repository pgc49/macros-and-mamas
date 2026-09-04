import { useEffect, useRef, useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";
import { AiMealPreview } from "./AiMealPreview";
import { eatingOutDayImpact, rankEatingOutPicks } from "../utils/eatingOutImpact";
import { logSaveSucceeded } from "../utils/logSave";

export const MAX_MENU_PHOTOS = 3;

/**
 * Restaurant menu → up to 5 range-aware picks.
 * Used from Today (log) and Meals → Plan (plan day).
 */
export function EatingOutMenuFlow({
  slot,
  macros,
  remaining = null,
  dayTotals = null,
  bands = null,
  onMealIdea,
  onPick,
  addLabel = "Add to plan",
  roomCaption = "planned so far",
  intro = null,
  showSaveMine = true,
  defaultSaveMine = false,
  disabled = false,
  afterPickHint = "After you order, open this meal in today’s log and add a plate photo to tighten the portion.",
}) {
  const [menuItems, setMenuItems] = useState([]);
  const [menuCaption, setMenuCaption] = useState("");
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState("");
  const [saveMine, setSaveMine] = useState(defaultSaveMine);
  const camRef = useRef(null);
  const libRef = useRef(null);
  const aliveRef = useRef(true);
  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      menuItemsRef.current.forEach((item) => {
        try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
      });
    };
  }, []);

  const clearMenuPhotos = () => {
    setMenuItems((prev) => {
      prev.forEach((item) => {
        try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
      });
      return [];
    });
  };

  const stageMenuFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f && f.type?.startsWith("image/"));
    if (!incoming.length) return;
    setMenuItems((prev) => {
      const room = Math.max(0, MAX_MENU_PHOTOS - prev.length);
      const take = incoming.slice(0, room).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...take];
    });
  };

  const removeMenuAt = (idx) => {
    setMenuItems((prev) => {
      const next = [...prev];
      const [gone] = next.splice(idx, 1);
      if (gone?.previewUrl) {
        try { URL.revokeObjectURL(gone.previewUrl); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const runPicks = async () => {
    if (!onMealIdea || !slot || !menuItems.length || busy || picking || disabled) return;
    setBusy(true);
    setErr("");
    setPicks([]);
    try {
      const result = await onMealIdea({
        mode: "eating_out",
        slot,
        description: menuCaption.trim(),
        files: menuItems.map((m) => m.file),
        remaining,
        dayTotals,
      });
      if (!aliveRef.current) return;
      if (result?.error) {
        setErr(result.error);
        return;
      }
      const list = Array.isArray(result?.meals) ? result.meals : [];
      if (!list.length) {
        setErr("No dishes came back — try a clearer menu photo or name the dishes in your note.");
        return;
      }
      setPicks(rankEatingOutPicks(list, remaining, dayTotals, bands));
    } catch (e) {
      if (!aliveRef.current) return;
      setErr(e.message || "Couldn't read that menu.");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const handlePick = async (meal) => {
    if (!meal || picking || busy || disabled) return;
    setPicking(true);
    setErr("");
    try {
      const ok = await onPick?.(meal, { saveToMine: saveMine });
      if (!aliveRef.current) return;
      if (!logSaveSucceeded(ok)) {
        setErr("Couldn't log that meal — try again.");
      }
    } catch (e) {
      if (!aliveRef.current) return;
      setErr(e?.message || "Couldn't log that meal — try again.");
    } finally {
      if (aliveRef.current) setPicking(false);
    }
  };

  const locked = busy || picking || disabled;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>
        {intro || (
          <>
            Snap the menu (up to {MAX_MENU_PHOTOS} photos). A note helps a lot (“can’t decide between the salmon or the salad”
            / “appetizer only” / “sharing”). You’ll get up to <b style={{ color: T.ink }}>5 ranked picks</b> for your day range —
            best fit first. Restaurant numbers are rough.
          </>
        )}
      </div>

      {remaining && (
        <div style={{
          fontSize: 12,
          color: T.inkSoft,
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: T.sageSoft,
          lineHeight: 1.4,
        }}
        >
          Room left ~{Math.max(0, Math.round(remaining.cal))} cal
          {" · "}P {Math.round(remaining.p)}g
          {" · "}C {Math.round(remaining.c)}g
          {" · "}F {Math.round(remaining.f)}g
          {dayTotals ? ` · ${roomCaption} ${Math.round(dayTotals.cal)} cal` : ""}
          {remaining.cal < 0 || remaining.p < 0
            ? " — you’re a bit over; we’ll lean lighter."
            : ""}
        </div>
      )}

      {!menuItems.length ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <Btn small onClick={() => camRef.current?.click()} disabled={locked || !macros}>Open camera</Btn>
          <Btn small ghost onClick={() => libRef.current?.click()} disabled={locked || !macros}>Photo library</Btn>
        </div>
      ) : (
        <>
          <div
            className="mam-h-scroll"
            style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            marginBottom: 10,
            WebkitOverflowScrolling: "touch",
          }}
          >
            {menuItems.map((item, idx) => (
              <div
                key={`${item.previewUrl}-${idx}`}
                style={{
                  position: "relative",
                  flex: "0 0 auto",
                  width: menuItems.length === 1 ? "100%" : 112,
                  height: menuItems.length === 1 ? 180 : 112,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${T.border}`,
                  background: "#fff",
                }}
              >
                <img
                  src={item.previewUrl}
                  alt={idx === 0 ? "Menu photo" : `Menu photo ${idx + 1}`}
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => removeMenuAt(idx)}
                  aria-label={`Remove menu photo ${idx + 1}`}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: "none",
                    background: "rgba(51,39,46,0.72)",
                    color: "#fff",
                    fontSize: 16,
                    lineHeight: 1,
                    cursor: locked ? "default" : "pointer",
                    fontFamily: F,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {menuItems.length < MAX_MENU_PHOTOS && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Btn small ghost onClick={() => camRef.current?.click()} disabled={locked}>Add photo</Btn>
              <Btn small ghost onClick={() => libRef.current?.click()} disabled={locked}>From library</Btn>
              <button
                type="button"
                disabled={locked}
                onClick={clearMenuPhotos}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 13,
                  color: T.inkSoft,
                  cursor: locked ? "default" : "pointer",
                  textDecoration: "underline",
                  fontFamily: F,
                }}
              >
                clear
              </button>
            </div>
          )}
        </>
      )}

      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 10 }}>
        Optional note
        <textarea
          value={menuCaption}
          onChange={(e) => setMenuCaption(e.target.value.slice(0, 400))}
          placeholder="e.g. can’t decide between the grilled salmon or the chicken salad — or help pick an appetizer"
          rows={2}
          disabled={locked}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            fontSize: 15,
            fontFamily: F,
            border: `1.5px solid ${T.border}`,
            borderRadius: 12,
            background: "#fff",
            color: T.ink,
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
      </label>

      <Btn
        onClick={runPicks}
        disabled={locked || !menuItems.length || !slot || !macros}
        style={{ width: "100%", marginBottom: 10 }}
      >
        {busy ? "Reading menu…" : picks.length ? "Regenerate 5 picks" : "Get 5 picks"}
      </Btn>

      {showSaveMine && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={saveMine}
            onChange={(e) => setSaveMine(e.target.checked)}
          />
          Save the one I pick to My meals
        </label>
      )}

      {err && <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8 }}>{err}</div>}

      {!macros && (
        <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 8, lineHeight: 1.45 }}>
          Menu picks unlock after Callie approves your macros.
        </div>
      )}

      {picks.map((m, i) => (
        <AiMealPreview
          key={`${m.name}-${i}`}
          meal={m}
          onAdd={() => handlePick(m)}
          eatingOut
          addLabel={picking ? "Logging…" : addLabel}
          rank={m.rank || i + 1}
          rankLabel={m.rankLabel}
          dayImpact={eatingOutDayImpact(m, remaining, dayTotals, bands)}
          addDisabled={locked}
        />
      ))}

      {picks.length > 0 && afterPickHint && (
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, marginTop: 4, marginBottom: 8 }}>
          {afterPickHint}
        </div>
      )}

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={locked}
        style={{ display: "none" }}
        onChange={(e) => {
          stageMenuFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        multiple
        disabled={locked}
        style={{ display: "none" }}
        onChange={(e) => {
          stageMenuFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
