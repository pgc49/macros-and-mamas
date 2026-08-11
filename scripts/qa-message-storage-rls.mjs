#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("Local Supabase URL/keys are required");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Rls-${suffix}-Aa1!`;
const createdIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createUser(label, role) {
  const email = `${label}-${suffix}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  createdIds.push(id);
  const { error: profileError } = await service.from("profiles").insert({
    id,
    email,
    name: label,
    role,
    status: "active",
  });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id, client };
}

async function objectNames(folder) {
  const { data, error } = await service.storage
    .from("message-attachments")
    .list(folder, { limit: 100 });
  if (error) throw error;
  return (data || []).map((item) => item.name);
}

try {
  const admin = await createUser("Admin", "admin");
  const mama = await createUser("Mama", "client");
  const adminName = `admin-${suffix}.pdf`;
  const mamaName = `mama-${suffix}.pdf`;
  const adminPath = `${mama.id}/${adminName}`;
  const mamaPath = `${mama.id}/${mamaName}`;

  const { error: adminUploadError } = await admin.client.storage
    .from("message-attachments")
    .upload(adminPath, new Blob(["admin"], { type: "application/pdf" }));
  if (adminUploadError) throw adminUploadError;

  const { error: mamaUploadError } = await mama.client.storage
    .from("message-attachments")
    .upload(mamaPath, new Blob(["mama"], { type: "application/pdf" }));
  if (mamaUploadError) throw mamaUploadError;

  await mama.client.storage.from("message-attachments").remove([adminPath]);
  assert(
    (await objectNames(mama.id)).includes(adminName),
    "same-thread mama deleted an admin-owned attachment",
  );

  const { error: ownDeleteError } = await mama.client.storage
    .from("message-attachments")
    .remove([mamaPath]);
  if (ownDeleteError) throw ownDeleteError;
  assert(
    !(await objectNames(mama.id)).includes(mamaName),
    "mama could not delete her own attachment",
  );

  const { error: adminDeleteError } = await admin.client.storage
    .from("message-attachments")
    .remove([adminPath]);
  if (adminDeleteError) throw adminDeleteError;
  assert(
    !(await objectNames(mama.id)).includes(adminName),
    "admin could not moderate an attachment",
  );

  console.log("qa:message-storage-rls OK");
} finally {
  for (const id of createdIds.reverse()) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
}

