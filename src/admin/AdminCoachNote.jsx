import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
import { db } from "../db/db";

/**
 * Admin: private note to one mama — shows on her Today until she dismisses.
 */
export function AdminCoachNote({ client, onSaved }) {
  const [text, setText] = useState(client?.coachNote || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setText(client?.coachNote || "");
    setMsg("");
    setErr("");
  }, [client?.id, client?.coachNote]);

  const dirty = (text || "") !== (client?.coachNote || "");

  const save = async () => {
    if (!client?.id || busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const saved = await db.saveCoachNote(client.id, text);
      onSaved?.(client.id, saved);
      setMsg(saved.coachNote ? "Saved — she’ll see it on Today." : "Cleared.");
      window.setTimeout(() => setMsg(""), 3500);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Couldn’t save note.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!client?.id || busy) return;
    setText("");
    setBusy(true);
    setErr("");
    try {
      const saved = await db.saveCoachNote(client.id, "");
      onSaved?.(client.id, saved);
      setMsg("Cleared.");
      window.setTimeout(() => setMsg(""), 3500);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Couldn’t clear note.");
      setText(client?.coachNote || "");
    } finally {
      setBusy(false);
    }
  };

  const first = (client?.name || "her").split(" ")[0];

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Note for {first}</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>
        Private — she sees it at the top of Today until she taps ×. Saving a new note brings it back.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        rows={4}
        placeholder={`e.g. Love how consistent your protein has been — keep aiming for the top of your range this week…`}
        style={{
          ...inputStyle,
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          minHeight: 96,
          fontFamily: F,
          marginBottom: 10,
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Btn small onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save note"}
        </Btn>
        {(client?.coachNote || text) && (
          <Btn small ghost onClick={clear} disabled={busy}>
            Clear
          </Btn>
        )}
        {msg && <span style={{ fontSize: 12.5, color: "#3E5A46" }}>{msg}</span>}
        {dirty && !msg && (
          <span style={{ fontSize: 12.5, color: T.inkSoft }}>Unsaved</span>
        )}
      </div>
      {err && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{err}</div>}
      {client?.coachNoteAt && (
        <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
          Last saved {new Date(client.coachNoteAt).toLocaleString()}
          {client.coachNoteDismissedAt
            && new Date(client.coachNoteDismissedAt) >= new Date(client.coachNoteAt)
            ? " · she dismissed it"
            : client.coachNote
              ? " · showing on her Today"
              : ""}
        </div>
      )}
    </Card>
  );
}
