import { T, F } from "../theme/tokens";

const ITEMS = [
  ["home", "Home"],
  ["people", "People"],
  ["messages", "Messages"],
  ["more", "More"],
];

/**
 * Same chrome as the mama tab bar. Safe-area / home-indicator padding lives
 * on `.mam-tabbar` — do not add it here or the bar doubles in height.
 */
export function AdminBottomNav({ tab, setTab, unreadMessages = 0 }) {
  return (
    <nav
      aria-label="Admin"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
        padding: "12px 12px 4px",
        maxWidth: 560,
        margin: "0 auto",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      {ITEMS.map(([id, label]) => {
        const active = tab === id;
        const badge = id === "messages" && unreadMessages > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={active ? "page" : undefined}
            style={{
              fontFamily: F,
              fontSize: 13.5,
              fontWeight: 700,
              padding: "14px 14px",
              minHeight: 48,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: active ? T.accentSoft : "transparent",
              color: active || badge ? T.accentDeep : T.inkSoft,
              position: "relative",
            }}
          >
            {label}
            {badge ? (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: T.accent,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "18px",
                  padding: "0 5px",
                  boxSizing: "border-box",
                }}
              >
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
