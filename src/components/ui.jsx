import { Link, useLocation, useNavigate } from "react-router-dom";
import { T, F, FD } from "../theme/tokens";
import { Fonts } from "../theme/Fonts";
import { useAuth } from "../auth/useAuth.jsx";
import { PATHS } from "../routing";

/* ------------------------------------------------------------------ */
/*  Building blocks (defined OUTSIDE the app so inputs keep focus)     */
/* ------------------------------------------------------------------ */
export const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, ...style }}>{children}</div>
);

export const Btn = ({ children, onClick, ghost, small, style, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontFamily: F, fontWeight: 700, fontSize: small ? 13 : 15, cursor: disabled ? "default" : "pointer",
      padding: small ? "8px 14px" : "13px 22px", borderRadius: 999,
      border: ghost ? `1.5px solid ${T.accent}` : "none",
      background: ghost ? "transparent" : disabled ? "#D9C4CE" : T.accent,
      color: ghost ? T.accent : "#fff",
      ...style,
    }}
  >{children}</button>
);

export const Field = ({ label, children }) => (
  <label style={{ display: "block", marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.2 }}>{label}</div>
    {children}
  </label>
);

export const inputStyle = {
  width: "100%", padding: "12px 14px", fontSize: 16, border: `1.5px solid ${T.border}`,
  borderRadius: 12, background: "#fff", color: T.ink,
};

export const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? T.accent : T.border}`,
    background: active ? T.accentSoft : "#fff", color: active ? T.accentDeep : T.inkSoft,
  }}>{children}</button>
);

export const RANGE_START = 22;
export const RANGE_WIDTH = 56;
export const GRACE_G = 5;
export const GRACE_CAL = 75;

const SAGE_DEEP = "#3E5A46";

/** empty | under | in | over — grace past `hi` still counts as in. */
export function rangeState(eaten, lo, hi, grace = GRACE_G) {
  if (typeof eaten !== "number" || eaten <= 0) return "empty";
  if (eaten < lo) return "under";
  if (eaten <= hi + grace) return "in";
  return "over";
}

function rangeDotPos(eaten, lo, hi) {
  if (typeof eaten !== "number" || eaten <= 0) return null;
  const pos = eaten <= lo
    ? (eaten / lo) * RANGE_START
    : RANGE_START + Math.min((eaten - lo) / (hi - lo), 1.35) * RANGE_WIDTH;
  return Math.min(pos, 96);
}

export const RangeBand = ({ label, lo, hi, unit = "g", eaten, grace = GRACE_G }) => {
  const st = rangeState(eaten, lo, hi, grace);
  const dot = rangeDotPos(eaten, lo, hi);
  const fillColor = st === "over" ? T.amber : st === "in" ? T.sage : T.accent;
  const bandBg = st === "in" ? T.sageSoft : T.accentSoft;
  const bandEdge = st === "in" ? T.sage : T.accent;
  const rangeColor = st === "in" ? SAGE_DEEP : T.ink;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: FD, fontSize: 26, color: rangeColor }}>
          {lo}<span style={{ color: T.inkSoft, fontSize: 20 }}>–</span>{hi}<span style={{ fontSize: 15, color: T.inkSoft }}> {unit}</span>
        </span>
      </div>

      <div style={{ position: "relative", height: 10, background: T.track, borderRadius: 999, marginTop: 6 }}>
        {dot !== null && (
          <div style={{ position: "absolute", left: 0, width: `${dot}%`, top: 0, bottom: 0, background: fillColor, opacity: 0.35, borderRadius: 999 }} />
        )}
        <div style={{ position: "absolute", left: `${RANGE_START}%`, width: `${RANGE_WIDTH}%`, top: 0, bottom: 0, background: bandBg, border: `1.5px solid ${bandEdge}`, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: `${RANGE_START}%`, top: -3, width: 3, height: 16, background: bandEdge, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `${RANGE_START + RANGE_WIDTH}%`, top: -3, width: 3, height: 16, background: bandEdge, borderRadius: 2 }} />
        {dot !== null && (
          <div style={{
            position: "absolute", left: `${dot}%`, top: -5, width: 14, height: 20, borderRadius: 6,
            border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", transform: "translateX(-50%)",
            background: fillColor,
          }} />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, marginTop: 5, minHeight: 16 }}>
        {st === "empty" && (
          <>
            <span style={{ color: T.inkSoft }}>slower day → aim low</span>
            <span style={{ color: T.inkSoft }}>active day → aim high</span>
          </>
        )}
        {st === "under" && (
          <>
            <span />
            <span style={{ fontWeight: 700, color: T.ink }}>logged: {Math.round(eaten)}{unit}</span>
          </>
        )}
        {st === "in" && (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: T.sage }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%", background: T.sage, color: "#fff",
                fontSize: 9.5, display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>✓</span>
              in range
            </span>
            <span style={{ fontWeight: 700, color: SAGE_DEEP }}>logged: {Math.round(eaten)}{unit}</span>
          </>
        )}
        {st === "over" && (
          <>
            <span />
            <span style={{ fontWeight: 700, color: T.amber }}>
              logged: {Math.round(eaten)}{unit} · {Math.round(eaten - hi)}{unit} over
            </span>
          </>
        )}
      </div>
    </div>
  );
};

/* Shell — prototype's coach toggle and reset button removed.
   Shows signed-in email + sign-out when a session exists. */
export const Shell = ({ children }) => {
  const { user, isAdmin, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const linkStyle = {
    fontFamily: F, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: "underline",
  };
  return (
    <div style={{ fontFamily: F, background: T.bg, minHeight: "100vh", color: T.ink }}>
      <Fonts />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 90px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 2px 6px", gap: 12 }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 24, letterSpacing: 0.3 }}>Macros and Mamas</div>
            <div style={{ fontSize: 12, color: T.accentDeep, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>ranges, not rules</div>
          </div>
          {user?.email && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11.5, color: T.inkSoft, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
                  {pathname !== PATHS.admin && (
                    <Link to={PATHS.admin} style={linkStyle}>Admin</Link>
                  )}
                  {pathname !== PATHS.dashboard && (
                    <Link to={PATHS.dashboard} style={linkStyle}>My dashboard</Link>
                  )}
                </div>
              )}
              <button
                onClick={async () => {
                  await signOut();
                  navigate(PATHS.home);
                }}
                style={{
                  marginTop: 2, background: "none", border: "none", padding: 0,
                  fontFamily: F, fontSize: 12, fontWeight: 700, color: T.accent, cursor: "pointer", textDecoration: "underline",
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </header>
        {children}
      </div>
    </div>
  );
};
