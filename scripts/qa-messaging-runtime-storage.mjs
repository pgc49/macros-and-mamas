#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase URL/keys required");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const suffix = Date.now();
const email = `runtime-storage-${suffix}@example.com`;
const password = `Runtime-${suffix}-Aa1!`;
let userId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setRuntime(patch) {
  const { data: rows, error: loadError } = await service
    .from("messaging_runtime_config")
    .select("updated_at")
    .eq("singleton", true)
    .limit(1);
  if (loadError) throw loadError;
  const { error } = await service.rpc("update_messaging_runtime", {
    p_actor_id: userId,
    p_request_id: crypto.randomUUID(),
    p_expected_updated_at: rows?.[0]?.updated_at,
    p_mode: patch.mode ?? null,
    p_attachments_enabled: patch.attachments_enabled ?? null,
    p_notifications_enabled: patch.notifications_enabled ?? null,
    p_reason: patch.reason ?? null,
  });
  if (error) throw error;
}

try {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    email,
    name: "Runtime Storage",
    role: "client",
    status: "active",
  });
  if (profileError) throw profileError;

  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const file = () => new Blob(["test"], { type: "application/pdf" });
  const conversationId = "30000000-0000-4000-8000-000000000031";

  await setRuntime({ mode: "normal", attachments_enabled: false });
  const paused = await client.storage
    .from("message-attachments")
    .upload(`${userId}/paused-${suffix}.pdf`, file());
  assert(paused.error, "attachment upload succeeded while switch was paused");
  const pausedChannel = await client.storage
    .from("channel-attachments")
    .upload(`${conversationId}/${userId}/paused-${suffix}.pdf`, file());
  assert(pausedChannel.error, "channel attachment succeeded while switch was paused");

  await setRuntime({ mode: "read_only", attachments_enabled: true });
  const readOnly = await client.storage
    .from("message-attachments")
    .upload(`${userId}/readonly-${suffix}.pdf`, file());
  assert(readOnly.error, "attachment upload succeeded while messaging was read-only");
  const readOnlyChannel = await client.storage
    .from("channel-attachments")
    .upload(`${conversationId}/${userId}/readonly-${suffix}.pdf`, file());
  assert(readOnlyChannel.error, "channel attachment succeeded while messaging was read-only");

  await setRuntime({ mode: "normal", attachments_enabled: true });
  const allowedPath = `${userId}/allowed-${suffix}.pdf`;
  const allowed = await client.storage
    .from("message-attachments")
    .upload(allowedPath, file());
  if (allowed.error) throw allowed.error;
  const allowedChannelPath = `${conversationId}/${userId}/allowed-${suffix}.pdf`;
  const allowedChannel = await client.storage
    .from("channel-attachments")
    .upload(allowedChannelPath, file());
  if (allowedChannel.error) throw allowedChannel.error;

  console.log("qa:messaging-runtime-storage OK");
  await service.storage.from("message-attachments").remove([allowedPath]);
  await service.storage.from("channel-attachments").remove([allowedChannelPath]);
} finally {
  await setRuntime({
    mode: "normal",
    attachments_enabled: true,
    notifications_enabled: true,
    reason: "",
  }).catch(() => {});
  if (userId) await service.auth.admin.deleteUser(userId).catch(() => {});
}

