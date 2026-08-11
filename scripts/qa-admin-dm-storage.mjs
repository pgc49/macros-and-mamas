#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase URL/keys required");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const suffix = Date.now();
const password = `Admin-Dm-${suffix}-Aa1!`;
const createdIds = [];
const cleanupPaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAdmin(label) {
  const email = `${label}-${suffix}@example.com`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  createdIds.push(id);
  const profile = await service.from("profiles").insert({
    id,
    email,
    name: label,
    role: "admin",
    status: "active",
  });
  if (profile.error) throw profile.error;
  const client = createClient(url, anonKey, options);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, client };
}

async function canDownload(client, path) {
  const { data, error } = await client.storage.from("message-attachments").download(path);
  return !error && !!data;
}

try {
  const state = await service
    .from("admin_dm_migration_state")
    .update({ admin_provisioning_frozen: false, compatibility_enabled: false })
    .eq("singleton", true);
  if (state.error) throw state.error;

  const adminC = await createAdmin("Admin C");
  const adminD = await createAdmin("Admin D");
  const adminE = await createAdmin("Admin E");
  const ensured = await adminC.client.rpc("ensure_admin_dm_conversation", {
    peer_id: adminD.id,
  });
  if (ensured.error) throw ensured.error;
  const conversation = Array.isArray(ensured.data) ? ensured.data[0] : ensured.data;
  assert(conversation?.id, "test admin conversation missing");

  const path = `admin-dm/${conversation.id}/${adminC.id}/new-admin.pdf`;
  const upload = await adminC.client.storage
    .from("message-attachments")
    .upload(path, new Blob(["new"], { type: "application/pdf" }));
  if (upload.error) throw upload.error;
  cleanupPaths.push(path);

  const insert = await adminC.client.from("messages").insert({
    client_id: conversation.participant_low,
    sender_id: adminC.id,
    recipient_id: adminD.id,
    admin_dm_conversation_id: conversation.id,
    body: "",
    kind: "chat",
    attachment_path: path,
    attachment_name: "new-admin.pdf",
    attachment_mime: "application/pdf",
    attachment_bytes: 3,
  });
  if (insert.error) throw insert.error;

  assert(await canDownload(adminD.client, path), "pair recipient cannot read attachment");
  assert(!(await canDownload(adminE.client, path)), "nonparticipant read pair attachment");

  await adminD.client.storage.from("message-attachments").remove([path]);
  assert(await canDownload(adminC.client, path), "peer deleted another sender's attachment");

  await service.from("profiles").update({ role: "client" }).eq("id", adminD.id);
  assert(!(await canDownload(adminD.client, path)), "demoted admin retained attachment access");

  const ownerDelete = await adminC.client.storage.from("message-attachments").remove([path]);
  if (ownerDelete.error) throw ownerDelete.error;
  assert(!(await canDownload(adminC.client, path)), "sender could not delete own attachment");

  console.log("qa:admin-dm-storage OK");
} finally {
  if (cleanupPaths.length) {
    await service.storage.from("message-attachments").remove(cleanupPaths);
  }
  for (const id of createdIds.reverse()) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
}

