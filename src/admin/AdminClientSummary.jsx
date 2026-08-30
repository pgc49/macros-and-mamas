import { useEffect, useState } from "react";
import { T, FD } from "../theme/tokens";
import { Card, Btn } from "../components/ui";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import { buildClientSummaryPayload } from "./clientSummaryPayload";
import { programWeekNumber } from "../lib/cohorts";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AdminClientSummary({ client, progress, progressLoading = false, chips = [] }) {
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCached = async (force) => {
    if (!client?.id) return;
    if (!force) {
      const cached = await db.loadClientSummary(client.id, todayIso());
      if (cached) {
        setRow(cached);
        setError("");
        return cached;
      }
    }
    return null;
  };

  const generate = async () => {
    if (!client?.id) return;
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sign in again to generate a summary.");
      const payload = buildClientSummaryPayload({
        client: { ...client, programWeek: programWeekNumber(client.cohort_label) },
        progress,
        weighins: client.weighins || [],
        macros: client.macros,
      });
      const resp = await fetch("/api/client-summary", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clientId: client.id, payload }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || data.error || "Summary unavailable");
      const saved = await db.saveClientSummary({
        profile_id: client.id,
        for_date: todayIso(),
        summary: data.summary,
        suggested_touch: data.suggested_touch,
        model: data.model,
      });
      setRow(saved || {
        summary: data.summary,
        suggested_touch: data.suggested_touch,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message || "Summary unavailable");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setRow(null);
    setError("");
    if (progressLoading) return undefined;
    loadCached(false).then((cached) => {
      if (cancelled || cached) return;
      generate();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate once progress is ready
  }, [client?.id, progressLoading]);

  return (
    <>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 12px" }}>
          {chips.map((chip) => (
            <span
              key={chip.id}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 10px",
                borderRadius: 99,
                background: T.amberSoft,
                color: T.amber,
              }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div style={{ fontFamily: FD, fontSize: 18 }}>Summary</div>
          <Btn small ghost disabled={busy} onClick={generate}>
            {busy ? "Updating…" : "Refresh"}
          </Btn>
        </div>
        {row ? (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.ink, margin: "8px 0 0" }}>
              {row.summary}
            </p>
            {row.suggested_touch && (
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: T.inkSoft, margin: "8px 0 0" }}>
                <b style={{ color: T.ink }}>Suggested touch:</b> {row.suggested_touch}
              </p>
            )}
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
              From her logs and habits · updated {formatWhen(row.created_at)}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13.5, color: error ? T.amber : T.inkSoft, margin: "8px 0 0" }}>
            {error || (busy ? "Writing a summary from her logs…" : "Summary unavailable")}
          </p>
        )}
      </Card>
    </>
  );
}
