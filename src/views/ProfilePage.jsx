import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn, Field, Chip, inputStyle } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { db, ageFromDateOfBirth, fullName } from "../db/db";
import { FoodPrefsEditor } from "../components/WeekPlanner";

/**
 * Generic account profile — name, photo, DOB, password, intake prefs.
 * Macros are NOT recalculated here; Callie still owns number changes.
 */
export function ProfilePage({ onProfileSaved }) {
  const { user, loading: authLoading, isAdmin, updatePassword, refreshProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading || !user) {
        if (!authLoading) setLoading(false);
        return;
      }
      try {
        const s = await db.loadClientState();
        if (!cancelled) setProfile(s?.profile || null);
      } catch (e) {
        console.error("profile load failed", e);
        if (!cancelled) setErr("Couldn't load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <Shell>
        <Card style={{ marginTop: 24 }}>
          <div style={{ fontFamily: FD, fontSize: 20, color: T.inkSoft }}>Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountProfile }} />;
  }

  if (profile?.refunded) return <Navigate to={PATHS.goodbye} replace />;
  if (!profile?.paid && !isAdmin) return <Navigate to={PATHS.join} replace />;

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const derivedAge = ageFromDateOfBirth(profile?.dateOfBirth);

  const saveBasics = async () => {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const saved = await db.updateAccountProfile({
        name: profile.name,
        lastName: profile.lastName,
        phone: profile.phone,
        dateOfBirth: profile.dateOfBirth,
        age: profile.dateOfBirth ? undefined : profile.age,
        currentWeight: profile.currentWeight,
        goalWeight: profile.goalWeight,
        pregnant: profile.pregnant,
        breastfeeding: profile.breastfeeding,
        monthsPP: profile.monthsPP,
        goal: profile.goal,
        activity: profile.activity,
        stress: profile.stress,
        insulinResistance: profile.insulinResistance,
      });
      if (saved) {
        setProfile((p) => ({ ...p, ...saved }));
        onProfileSaved?.(saved);
        await refreshProfile();
      }
      setMsg("Saved.");
    } catch (e) {
      console.error("save profile failed", e);
      setErr("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    try {
      const saved = await db.uploadAvatar(file);
      setProfile((p) => ({ ...p, ...saved }));
      onProfileSaved?.(saved);
      await refreshProfile();
      setMsg("Photo updated.");
    } catch (ex) {
      console.error("avatar upload failed", ex);
      setErr(ex?.message || "Couldn't upload photo.");
    }
  };

  const removePhoto = async () => {
    setErr("");
    try {
      const saved = await db.removeAvatar();
      setProfile((p) => ({ ...p, ...saved, avatarUrl: null, avatarPath: null }));
      onProfileSaved?.(saved);
      await refreshProfile();
      setMsg("Photo removed.");
    } catch (ex) {
      console.error("avatar remove failed", ex);
      setErr("Couldn't remove photo.");
    }
  };

  const changePassword = async () => {
    setPwErr("");
    setPwMsg("");
    if (pw.next.length < 8) {
      setPwErr("Use at least 8 characters.");
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwErr("Passwords don’t match.");
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await updatePassword(pw.next);
      if (error) throw error;
      setPw({ next: "", confirm: "" });
      setPwMsg("Password updated.");
    } catch (ex) {
      console.error("password update failed", ex);
      setPwErr(ex?.message || "Couldn't update password.");
    } finally {
      setPwBusy(false);
    }
  };

  const initials = (fullName(profile) || user.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <Shell>
      <div style={{ marginTop: 18, marginBottom: 8 }}>
        <Link
          to={PATHS.account}
          style={{ fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
        >
          ← Account
        </Link>
      </div>
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "8px 0 6px" }}>
        Profile
      </h1>
      <p style={{ fontSize: 14.5, color: T.inkSoft, margin: "0 0 18px", lineHeight: 1.5 }}>
        Keep your details current. Changing goals here doesn’t change your macros — message Callie if you need new numbers.
      </p>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload profile photo"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: `1.5px solid ${T.border}`,
              background: T.accentSoft,
              color: T.accentDeep,
              fontFamily: FD,
              fontSize: 22,
              overflow: "hidden",
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {profile.avatarUrl ? (
              <img
                src={`${profile.avatarUrl}?t=${encodeURIComponent(profile.avatarPath || "")}`}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : initials}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Profile photo</div>
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>Optional — JPG or PNG, under 5 MB.</div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: F, fontWeight: 700, fontSize: 13, color: T.accent, textDecoration: "underline",
                }}
              >
                {profile.avatarUrl ? "Change photo" : "Add photo"}
              </button>
              {profile.avatarUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: F, fontWeight: 700, fontSize: 13, color: T.inkSoft, textDecoration: "underline",
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          hidden
          onChange={onPickPhoto}
        />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>About you</h2>
        <Field label="First name">
          <input style={inputStyle} value={profile.name || ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Last name">
          <input style={inputStyle} value={profile.lastName || ""} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={{ ...inputStyle, background: T.bg, color: T.inkSoft }} value={user.email || ""} disabled readOnly />
        </Field>
        <Field label="Date of birth">
          <input
            style={inputStyle}
            type="date"
            value={profile.dateOfBirth || ""}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        {derivedAge != null ? (
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: -6, marginBottom: 12 }}>
            Age {derivedAge}
          </div>
        ) : profile.age ? (
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: -6, marginBottom: 12 }}>
            Age on file: {profile.age} (add birthday so it stays accurate)
          </div>
        ) : null}
        <Field label="Cell number">
          <input style={inputStyle} value={profile.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Current weight (lbs)">
          <input style={inputStyle} inputMode="numeric" value={profile.currentWeight || ""} onChange={(e) => set("currentWeight", e.target.value)} />
        </Field>
        <Field label="Goal weight (lbs)">
          <input style={inputStyle} inputMode="numeric" value={profile.goalWeight || ""} onChange={(e) => set("goalWeight", e.target.value)} />
        </Field>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>You right now</h2>
        <Field label="Currently pregnant?">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active={profile.pregnant === true} onClick={() => set("pregnant", true)}>Yes</Chip>
            <Chip active={profile.pregnant === false} onClick={() => set("pregnant", false)}>No</Chip>
          </div>
        </Field>
        {profile.pregnant !== true && (
          <>
            <Field label="Breastfeeding?">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip active={profile.breastfeeding === true} onClick={() => set("breastfeeding", true)}>Yes</Chip>
                <Chip active={profile.breastfeeding === false} onClick={() => set("breastfeeding", false)}>No</Chip>
              </div>
            </Field>
            {profile.breastfeeding === true && (
              <Field label="Months postpartum">
                <input style={inputStyle} inputMode="numeric" value={profile.monthsPP || ""} onChange={(e) => set("monthsPP", e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Field label="Main goal">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active={profile.goal === "lose"} onClick={() => set("goal", "lose")}>Lose fat</Chip>
            <Chip active={profile.goal === "maintain"} onClick={() => set("goal", "maintain")}>Maintain</Chip>
            <Chip active={profile.goal === "gain"} onClick={() => set("goal", "gain")}>Build strength</Chip>
          </div>
        </Field>
        <Field label="Activity">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active={profile.activity === "low"} onClick={() => set("activity", "low")}>Not much yet</Chip>
            <Chip active={profile.activity === "moderate"} onClick={() => set("activity", "moderate")}>Walks + some workouts</Chip>
            <Chip active={profile.activity === "high"} onClick={() => set("activity", "high")}>Very active</Chip>
          </div>
        </Field>
        <Field label="Stress">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active={profile.stress === "low"} onClick={() => set("stress", "low")}>Low</Chip>
            <Chip active={profile.stress === "medium"} onClick={() => set("stress", "medium")}>Medium</Chip>
            <Chip active={profile.stress === "high"} onClick={() => set("stress", "high")}>High</Chip>
          </div>
        </Field>
        <Field label="Insulin resistance / PCOS?">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active={!!profile.insulinResistance} onClick={() => set("insulinResistance", true)}>Yes</Chip>
            <Chip active={!profile.insulinResistance} onClick={() => set("insulinResistance", false)}>No</Chip>
          </div>
        </Field>
        <Btn style={{ width: "100%" }} disabled={saving} onClick={saveBasics}>
          {saving ? "Saving…" : "Save profile"}
        </Btn>
        {msg && <div style={{ marginTop: 10, fontSize: 13.5, color: T.sage, fontWeight: 700 }}>{msg}</div>}
        {err && <div style={{ marginTop: 10, fontSize: 13.5, color: T.amber }}>{err}</div>}
      </Card>

      <div style={{ marginBottom: 14 }}>
        <FoodPrefsEditor
          profile={profile}
          onSave={async (prefs) => {
            const saved = await db.updateFoodPrefs(prefs);
            setProfile((p) => ({ ...p, ...saved }));
            onProfileSaved?.({ ...profile, ...saved });
            return saved;
          }}
        />
      </div>

      <Card style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: "0 0 14px" }}>Password</h2>
        <Field label="New password">
          <input
            style={inputStyle}
            type="password"
            autoComplete="new-password"
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            style={inputStyle}
            type="password"
            autoComplete="new-password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
          />
        </Field>
        <Btn style={{ width: "100%" }} disabled={pwBusy} onClick={changePassword}>
          {pwBusy ? "Updating…" : "Update password"}
        </Btn>
        {pwMsg && <div style={{ marginTop: 10, fontSize: 13.5, color: T.sage, fontWeight: 700 }}>{pwMsg}</div>}
        {pwErr && <div style={{ marginTop: 10, fontSize: 13.5, color: T.amber }}>{pwErr}</div>}
      </Card>
    </Shell>
  );
}
