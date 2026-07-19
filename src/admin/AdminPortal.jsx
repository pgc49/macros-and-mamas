import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { T, F, FD } from "../theme/tokens";
import { rateOf } from "../utils/dates";
import { db } from "../db/db";
import { PATHS } from "../routing";
import { Shell, Card, Btn, inputStyle } from "../components/ui";

export function AdminPortal({ roster, setRoster, adminSel, setAdminSel }) {
  const all = roster;
  const pendings = all.filter((c) => c.status === "pending");
  const actives = all.filter((c) => c.status === "active");
  const debounceRef = useRef({});
  const needsAttention = (c) => {
    const r = rateOf(c.weighins);
    const flags = [];
    if (r !== null && r > 1.5) flags.push("losing too fast");
    if (c.status === "active" && c.adherence < 60) flags.push("low adherence");
    return flags;
  };
  const attentionCount = actives.filter((c) => needsAttention(c).length > 0).length;

  const patchMacros = (c, k, v) => {
    const next = { ...c.macros, [k]: Number(v) || 0 };
    setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, macros: next } : x)));
    clearTimeout(debounceRef.current[c.id]);
    debounceRef.current[c.id] = setTimeout(() => {
      db.updateClientMacros(c.id, next).catch((e) => console.error("updateClientMacros failed", e));
    }, 400);
  };
  const approveClient = async (c) => {
    setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, status: "active", week: 1 } : x)));
    try {
      await db.approveClient(c.id); // sets macros.approved=true, status=active, week=1
    } catch (e) {
      console.error("approveClient failed", e);
    }
  };

  const sel = all.find((c) => c.id === adminSel);

  /* ---- client detail ---- */
  if (sel) {
    const r = rateOf(sel.weighins);
    const flags = needsAttention(sel);
    return (
      <Shell>
        <button onClick={() => setAdminSel(null)} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "4px 0 10px" }}>← All clients</button>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: FD, fontSize: 22 }}>{sel.name}</div>
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
                {sel.age} yrs · {sel.currentWeight} → {sel.goalWeight} lbs · {sel.monthsPP} mo postpartum
                {sel.breastfeeding ? " · breastfeeding" : ""}
                {sel.phone ? <><br />📱 {sel.phone}{sel.status === "pending" ? " — send WhatsApp invite on approval" : ""}</> : null}
                {(sel.prefB || sel.prefL || sel.prefD) ? <><br />🍽 Loves: {[sel.prefB, sel.prefL, sel.prefD].filter(Boolean).join(" · ")}</> : null}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: sel.status === "active" ? T.sageSoft : T.amberSoft, color: sel.status === "active" ? T.sage : T.amber, whiteSpace: "nowrap" }}>
              {sel.status === "active" ? `Week ${sel.week}` : "Pending"}
            </span>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "6px 0 8px" }}>Ranges — edit any number</div>
          {["cal", "protein", "fat", "carbs"].map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 74, fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "capitalize" }}>{k === "cal" ? "Calories" : k}</div>
              <input style={{ ...inputStyle, width: 110, padding: "8px 10px" }} inputMode="numeric" value={sel.macros[k]}
                onChange={(e) => patchMacros(sel, k, e.target.value)} />
              <span style={{ fontSize: 13, color: T.inkSoft }}>→ {sel.macros[k]}–{sel.macros[k] + (k === "cal" ? 150 : 10)}{k === "cal" ? "" : "g"}</span>
            </div>
          ))}
          {sel.macros.notes?.length > 0 && (
            <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", margin: "10px 0" }}>
              {sel.macros.notes.map((n, i) => <div key={i} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>• {n}</div>)}
            </div>
          )}
          {sel.status === "pending"
            ? <Btn style={{ width: "100%", marginTop: 6 }} onClick={() => approveClient(sel)}>Approve + release to {sel.name.split(" ")[0]}</Btn>
            : <div style={{ fontSize: 13, color: T.sage, fontWeight: 700, marginTop: 4 }}>✓ Live. Edits reach her dashboard instantly.</div>}
        </Card>

        {sel.status === "active" && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Progress</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 8 }}>
              Checklist this week: <b style={{ color: sel.adherence < 60 ? T.amber : T.ink }}>{sel.adherence}%</b>
              {r !== null && <> · trending <b style={{ color: r > 1.5 ? T.amber : T.sage }}>{Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</b></>}
            </div>
            {flags.length > 0 && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
                {flags.map((f) => (
                  <div key={f} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>
                    ⚠ {f === "losing too fast" ? "Losing faster than 1.5 lb/wk — voice-note her to eat the top of her ranges." : "Adherence under 60% — a personal check-in usually turns this around."}
                  </div>
                ))}
              </div>
            )}
            {sel.weighins.length > 1 && (
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sel.weighins.map((x) => ({ ...x, label: x.date.slice(5) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={T.track} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontFamily: F, fontSize: 13, borderRadius: 10, border: `1px solid ${T.border}` }} />
                    {sel.goalWeight && <ReferenceLine y={Number(sel.goalWeight)} stroke={T.sage} strokeDasharray="5 4" label={{ value: "goal", fontSize: 11, fill: T.sage, position: "right" }} />}
                    <Line type="monotone" dataKey="w" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        )}
      </Shell>
    );
  }

  /* ---- roster ---- */
  const Row = ({ c }) => {
    const r = rateOf(c.weighins);
    const flags = needsAttention(c);
    return (
      <button onClick={() => setAdminSel(c.id)} style={{ display: "block", width: "100%", textAlign: "left", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 16px", marginBottom: 8, cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontFamily: FD, fontSize: 16, color: T.ink }}>{c.name}</span>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
              {c.status === "pending"
                ? `${c.currentWeight} → ${c.goalWeight} lbs${c.breastfeeding ? " · breastfeeding" : ""} · awaiting your review`
                : <>Week {c.week} · adherence {c.adherence}%{r !== null && <> · {Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</>}</>}
            </div>
            {flags.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginTop: 3 }}>⚠ {flags.join(" · ")}</div>
            )}
          </div>
          <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
        </div>
      </button>
    );
  };

  return (
    <Shell>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 4px" }}>Your mamas</h2>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 4px", lineHeight: 1.45 }}>
        Admin roster. To use the program yourself, open{" "}
        <Link to={PATHS.dashboard} style={{ color: T.accent, fontWeight: 700 }}>your dashboard</Link>.
      </p>
      <div style={{ display: "flex", gap: 8, margin: "8px 0 18px" }}>
        {[["Active", actives.length, T.sageSoft, T.sage], ["Pending", pendings.length, T.amberSoft, T.amber], ["Need you", attentionCount, T.accentSoft, T.accentDeep]].map(([l, n, bg, col]) => (
          <div key={l} style={{ flex: 1, background: bg, borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
            <div style={{ fontFamily: FD, fontSize: 22, color: col }}>{n}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{l}</div>
          </div>
        ))}
      </div>

      {pendings.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Waiting on your approval</div>
          {pendings.map((c) => <Row key={c.id} c={c} />)}
        </>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 8px" }}>Active</div>
      {actives.length ? actives.map((c) => <Row key={c.id} c={c} />) : <div style={{ fontSize: 13.5, color: T.inkSoft }}>No active clients yet — approve your pending mamas to start their 8 weeks.</div>}
    </Shell>
  );
}
