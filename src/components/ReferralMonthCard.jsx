import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { T, FD, F } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { PATHS } from "../lib/appPaths";
import { referralNudgeCopy } from "../lib/referralMembership";
import { supabase } from "../lib/supabase";
import { copyText } from "../utils/clipboard";

/**
 * Today nudge: refer women to the 8-week program.
 * Two paid referrals cover one month of the $49 membership. Credits stack.
 * The code sits on this card so a paywalled mama can copy it without leaving Today.
 * `previewCode` is for local /dev previews and tests; signed-in mamas load theirs.
 */
export function ReferralMonthCard({ previewCode = "" } = {}) {
  const copy = referralNudgeCopy();
  const [code, setCode] = useState(previewCode);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState("");
  const resetTimer = useRef(null);

  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    if (previewCode) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token || cancelled) return;
        const resp = await fetch("/api/referrals", {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await resp.json().catch(() => ({}));
        if (cancelled || !resp.ok || !json?.code) return;
        setCode(String(json.code));
      } catch {
        // The share link stays. A failed load must not blank the nudge.
      }
    })();
    return () => { cancelled = true; };
  }, [previewCode]);

  const onCopy = async () => {
    if (!code) return;
    setCopyErr("");
    setCopied(true);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 4000);
    try {
      await copyText(code);
    } catch (err) {
      console.error("clipboard write failed", err);
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
      setCopied(false);
      setCopyErr("Couldn't copy. Select the code and copy it.");
    }
  };

  return (
    <div data-referral-month="true">
    <Card
      style={{
        margin: "0 0 14px",
        background: T.amberSoft,
        border: "1px solid #E7D3AE",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7A5416" }}>
        {copy.eyebrow}
      </div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "8px 0 8px", color: T.ink }}>
        {copy.title}
      </h2>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 10px" }}>
        {copy.lead}
      </p>
      <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.55, margin: "0 0 14px" }}>
        {copy.stack}
      </p>
      {code ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7A5416" }}>
            Your code
          </div>
          <input
            readOnly
            value={code}
            aria-label="Your referral code"
            data-referral-code="true"
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              fontFamily: FD,
              fontSize: 32,
              letterSpacing: 1,
              marginTop: 4,
              color: T.ink,
              background: "#fff",
              border: "1px solid #E7D3AE",
              borderRadius: 12,
              padding: "8px 12px",
              userSelect: "all",
              WebkitUserSelect: "all",
            }}
          />
          <Btn
            style={{
              width: "100%",
              marginTop: 12,
              ...(copied ? { background: T.sage } : null),
            }}
            onClick={onCopy}
          >
            {copied ? "Copied" : "Copy code"}
          </Btn>
          {copyErr ? (
            <div style={{ fontSize: 12.5, color: T.accentDeep, lineHeight: 1.45, marginTop: 8 }}>{copyErr}</div>
          ) : null}
        </div>
      ) : null}
      <Link
        to={PATHS.accountShare}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          textAlign: "center",
          textDecoration: "none",
          fontFamily: F,
          fontWeight: 700,
          fontSize: 15,
          padding: "13px 22px",
          borderRadius: 999,
          border: `1.5px solid ${T.accent}`,
          background: "#fff",
          color: T.accent,
        }}
      >
        {copy.action}
      </Link>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, marginTop: 10 }}>
        {copy.fine}
      </div>
    </Card>
    </div>
  );
}
