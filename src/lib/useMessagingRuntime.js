import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../db/db";
import { supabase } from "./supabase";

const DEFAULT_RUNTIME = {
  mode: "read_only",
  attachmentsEnabled: false,
  notificationsEnabled: false,
  reason: "Messaging status is temporarily unavailable.",
  updatedAt: null,
};

export function useMessagingRuntime() {
  const [runtime, setRuntime] = useState(DEFAULT_RUNTIME);
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);
  const requestSequence = useRef(0);

  const refreshRuntime = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const next = await db.loadMessagingRuntime();
      if (sequence !== requestSequence.current) return null;
      setRuntime(next);
      setRuntimeError("");
      setRuntimeLoaded(true);
      return next;
    } catch (error) {
      if (sequence !== requestSequence.current) return null;
      console.warn("messaging runtime load failed", error);
      setRuntimeError("Couldn’t check messaging status.");
      setRuntime(DEFAULT_RUNTIME);
      setRuntimeLoaded(false);
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
    if (!runtimeLoaded || !runtime.updatedAt) {
      throw new Error("Messaging status must load before controls can change.");
    }
    const sequence = ++requestSequence.current;
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
        ...next,
        expectedUpdatedAt: runtime.updatedAt,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) await refreshRuntime();
      throw new Error(payload.error || "Runtime update failed");
    }
    if (sequence !== requestSequence.current) return null;
    const updated = {
      mode: payload.runtime?.mode || "normal",
      attachmentsEnabled: payload.runtime?.attachments_enabled !== false,
      notificationsEnabled: payload.runtime?.notifications_enabled !== false,
      reason: String(payload.runtime?.reason || ""),
      updatedAt: payload.runtime?.updated_at || null,
    };
    setRuntime(updated);
    setRuntimeError("");
    setRuntimeLoaded(true);
    return updated;
  }, [refreshRuntime, runtime.updatedAt, runtimeLoaded]);

  return {
    runtime,
    runtimeLoaded,
    runtimeError,
    refreshRuntime,
    updateRuntime,
  };
}

