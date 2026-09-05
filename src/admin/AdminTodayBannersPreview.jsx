import { Fonts } from "../theme/Fonts";
import { T, F } from "../theme/tokens";
import { AdminTodayBanners } from "./AdminTodayBanners";

/** Local-only catalog preview — same cards as admin More → Today banners. */
export function AdminTodayBannersPreview() {
  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      padding: "24px 16px 48px",
      background: T.bg,
      minHeight: "100vh",
      boxSizing: "border-box",
      fontFamily: F,
    }}
    >
      <Fonts />
      <p style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: T.inkSoft,
        margin: "0 0 6px",
      }}
      >
        Local preview
      </p>
      <AdminTodayBanners />
    </div>
  );
}
