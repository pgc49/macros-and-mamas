#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase URL/keys required");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const aId = "00000000-0000-0000-0000-000000000051";
const bId = "00000000-0000-0000-0000-000000000052";
const cEmail = "storage-admin-c@example.com";
const password = "Admin-Dm-Storage-Aa1!";
let cId = null;
const cleanupPaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email) {
  const client = createClient(url, anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function canDownload(client, path) {
  const { data, error } = await client.storage.from("message-attachments").download(path);
  return !error && !!data;
}

try {
  const updatedA = await service.auth.admin.updateUserById(aId, { password });
  if (updatedA.error) throw updatedA.error;
  const updatedB = await service.auth.admin.updateUserById(bId, { password });
  if (updatedB.error) throw updatedB.error;
  const adminA = await login("legacy-admin-a@example.com");
  const adminB = await login("legacy-admin-b@example.com");
  const { data: conversations, error: conversationError } = await service
    .from("admin_dm_conversations")
    .select("id, participant_low, participant_high");
  if (conversationError) throw conversationError;
  const conversation = conversations?.[0];
  assert(conversation, "backfilled admin conversation missing");

  const legacyPaths = [
    `${aId}/legacy-a.pdf`,
    `${bId}/legacy-b-1.pdf`,
    `${bId}/legacy-b-2.pdf`,
  ];
  for (const path of legacyPaths) {
    const upload = await service.storage
      .from("message-attachments")
      .upload(path, new Blob(["legacy"], { type: "application/pdf" }), { upsert: true });
    if (upload.error) throw upload.error;
    cleanupPaths.push(path);
    assert(await canDownload(adminA, path), `Admin A cannot read legacy ${path}`);
    assert(await canDownload(adminB, path), `Admin B cannot read legacy ${path}`);
  }

  const newPath = `admin-dm/${conversation.id}/${aId}/new-admin.pdf`;
  const upload = await adminA.storage
    .from("message-attachments")
    .upload(newPath, new Blob(["new"], { type: "application/pdf" }));
  if (upload.error) throw upload.error;
  cleanupPaths.push(newPath);
  const insert = await adminA.from("messages").insert({
    client_id: conversation.participant_low,
    sender_id: aId,
    recipient_id: bId,
    admin_dm_conversation_id: conversation.id,
    body: "",
    kind: "chat",
    attachment_path: newPath,
    attachment_name: "new-admin.pdf",
    attachment_mime: "application/pdf",
    attachment_bytes: 3,
  });
  if (insert.error) throw insert.error;
  assert(await canDownload(adminB, newPath), "pair recipient cannot read new attachment");

  await adminB.storage.from("message-attachments").remove([newPath]);
  assert(await canDownload(adminA, newPath), "peer deleted another sender's attachment");

  await service
    .from("admin_dm_migration_state")
    .update({ admin_provisioning_frozen: false, compatibility_enabled: false })
    .eq("singleton", true);
  const createdC = await service.auth.admin.createUser({
    email: cEmail,
    password,
    email_confirm: true,
  });
  if (createdC.error) throw createdC.error;
  cId = createdC.data.user.id;
  const profileC = await service.from("profiles").insert({
    id: cId,
    email: cEmail,
    name: "Admin C",
    role: "admin",
    status: "active",
  });
  if (profileC.error) throw profileC.error;
  const adminC = await login(cEmail);
  assert(!(await canDownload(adminC, newPath)), "nonparticipant read pair attachment");

  await service.from("profiles").update({ role: "client" }).eq("id", bId);
  assert(!(await canDownload(adminB, newPath)), "demoted admin retained attachment access");

  const ownerDelete = await adminA.storage.from("message-attachments").remove([newPath]);
  if (ownerDelete.error) throw ownerDelete.error;
  assert(!(await canDownload(adminA, newPath)), "sender could not delete own attachment");

  console.log("qa:admin-dm-storage OK");
} finally {
  if (cleanupPaths.length) {
    await service.storage.from("message-attachments").remove(cleanupPaths);
  }
  if (cId) await service.auth.admin.deleteUser(cId).catch(() => {});
}

