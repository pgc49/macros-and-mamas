import { T, F } from "../theme/tokens";

const ITEMS = [
  ["home", "Home"],
  ["people", "People"],
  ["messages", "Messages"],
  ["more", "More"],
];

export function AdminBottomNav({ tab, setTab, unreadMessages = 0 }) {
  return (
    <nav
      aria-label="Admin"
      style={{
        display: "flex",
        gap: 4,
        padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",
        background: T.card,
        borderTop: `1.5px solid ${T.border}`,
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
              flex: 1,
              minHeight: 44,
              border: "none",
              borderRadius: 12,
              background: active ? T.accentSoft : "transparent",
              color: active || badge ? T.accentDeep : T.inkSoft,
              fontFamily: F,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <span>
              {label}
              {badge ? (
                <span
                  style={{
                    marginLeft: 6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 99,
                    background: T.accent,
                    color: "#fff",
                    fontSize: 10,
                    lineHeight: "16px",
                    padding: "0 4px",
                    display: "inline-block",
                  }}
                >
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
