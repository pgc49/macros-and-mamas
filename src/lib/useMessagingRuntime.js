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
  const mutationGeneration = useRef(0);
  const mutationInFlight = useRef(false);

  const refreshRuntime = useCallback(async () => {
    if (mutationInFlight.current) return null;
    const sequence = ++requestSequence.current;
    const mutationAtStart = mutationGeneration.current;
    try {
      const next = await db.loadMessagingRuntime();
      if (
        sequence !== requestSequence.current
        || mutationInFlight.current
        || mutationAtStart !== mutationGeneration.current
      ) return null;
      setRuntime(next);
      setRuntimeError("");
      setRuntimeLoaded(true);
      return next;
    } catch (error) {
      if (
        sequence !== requestSequence.current
        || mutationInFlight.current
        || mutationAtStart !== mutationGeneration.current
      ) return null;
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
    const generation = ++mutationGeneration.current;
    mutationInFlight.current = true;
    ++requestSequence.current; // invalidate any refresh that started pre-mutation
    try {
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
        if (response.status === 409) {
          mutationInFlight.current = false;
          await refreshRuntime();
        }
        throw new Error(payload.error || "Runtime update failed");
      }
      if (generation !== mutationGeneration.current) return null;
      if (
        !["normal", "read_only", "off"].includes(payload.runtime?.mode)
        || typeof payload.runtime?.attachments_enabled !== "boolean"
        || typeof payload.runtime?.notifications_enabled !== "boolean"
        || !payload.runtime?.updated_at
      ) {
        throw new Error("Runtime update returned invalid status");
      }
      const updated = {
        mode: payload.runtime.mode,
        attachmentsEnabled: payload.runtime.attachments_enabled,
        notificationsEnabled: payload.runtime.notifications_enabled,
        reason: String(payload.runtime?.reason || ""),
        updatedAt: payload.runtime.updated_at,
      };
      setRuntime(updated);
      setRuntimeError("");
      setRuntimeLoaded(true);
      return updated;
    } finally {
      if (generation === mutationGeneration.current) {
        mutationInFlight.current = false;
      }
    }
  }, [refreshRuntime, runtime.updatedAt, runtimeLoaded]);

  return {
    runtime,
    runtimeLoaded,
    runtimeError,
    refreshRuntime,
    updateRuntime,
  };
}

