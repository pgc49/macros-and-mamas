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

export const RangeBand = ({ label, lo, hi, unit = "g", color = T.accent, soft = T.accentSoft, eaten }) => {
  const start = 22, width = 56;
  let dot = null;
  if (typeof eaten === "number" && eaten > 0) {
    const pos = eaten <= lo ? (eaten / lo) * start : start + Math.min((eaten - lo) / (hi - lo), 1.35) * width;
    dot = Math.min(pos, 96);
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: FD, fontSize: 26, color: T.ink }}>
          {lo}<span style={{ color: T.inkSoft, fontSize: 20 }}>–</span>{hi}<span style={{ fontSize: 15, color: T.inkSoft }}> {unit}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: T.track, borderRadius: 999, marginTop: 6 }}>
        <div style={{ position: "absolute", left: `${start}%`, width: `${width}%`, top: 0, bottom: 0, background: soft, border: `1.5px solid ${color}`, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: `${start}%`, top: -3, width: 3, height: 16, background: color, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `${start + width}%`, top: -3, width: 3, height: 16, background: color, borderRadius: 2 }} />
        {dot !== null && (
          <div style={{ position: "absolute", left: `${dot}%`, top: -5, width: 14, height: 20, background: T.ink, borderRadius: 6, border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", transform: "translateX(-50%)" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkSoft, marginTop: 4 }}>
        <span>slower day → aim low</span>
        {typeof eaten === "number" && eaten > 0 ? <span style={{ fontWeight: 700, color: T.ink }}>logged: {Math.round(eaten)}{unit}</span> : <span>active day → aim high</span>}
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
