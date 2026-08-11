import { useCallback, useEffect, useState } from "react";
import { db } from "../db/db";
import { supabase } from "./supabase";

const DEFAULT_RUNTIME = {
  mode: "normal",
  attachmentsEnabled: true,
  notificationsEnabled: true,
  reason: "",
  updatedAt: null,
};

export function useMessagingRuntime() {
  const [runtime, setRuntime] = useState(DEFAULT_RUNTIME);
  const [runtimeError, setRuntimeError] = useState("");

  const refreshRuntime = useCallback(async () => {
    try {
      const next = await db.loadMessagingRuntime();
      setRuntime(next);
      setRuntimeError("");
      return next;
    } catch (error) {
      console.warn("messaging runtime load failed", error);
      setRuntimeError("Couldn’t check messaging status.");
      return null;
    }
  }, []);

  useEffect(() => {
    refreshRuntime();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRuntime();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(refreshRuntime, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refreshRuntime]);

  const updateRuntime = useCallback(async (next) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const response = await fetch("/api/admin-messaging-runtime", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: next.mode,
        attachmentsEnabled: next.attachmentsEnabled,
        notificationsEnabled: next.notificationsEnabled,
        reason: next.reason || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Runtime update failed");
    const updated = {
      mode: payload.runtime?.mode || "normal",
      attachmentsEnabled: payload.runtime?.attachments_enabled !== false,
      notificationsEnabled: payload.runtime?.notifications_enabled !== false,
      reason: String(payload.runtime?.reason || ""),
      updatedAt: payload.runtime?.updated_at || null,
    };
    setRuntime(updated);
    setRuntimeError("");
    return updated;
  }, []);

  return {
    runtime,
    runtimeError,
    refreshRuntime,
    updateRuntime,
  };
}

