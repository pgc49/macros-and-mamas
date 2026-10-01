/**
 * Last-seen message window, kept on device so Messages can paint the previous
 * page before the network round-trip. Signed attachment URLs are stripped —
 * they expire — and re-signed when the cache is read.
 *
 * Cap: a handful of threads, one page each. Sign-out wipes the store so a
 * shared browser cannot show the previous mama's bubbles.
 */

import { MESSAGE_PAGE_SIZE } from "./messageChannels";

export const MESSAGE_WINDOW_DB = "mm_message_windows";
export const MESSAGE_WINDOW_STORE = "windows";
export const MESSAGE_WINDOW_THREAD_CAP = 12;
export const MESSAGE_WINDOW_ROW_CAP = MESSAGE_PAGE_SIZE;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(MESSAGE_WINDOW_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MESSAGE_WINDOW_STORE)) {
        db.createObjectStore(MESSAGE_WINDOW_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("message window cache open failed"));
  });
}

function isLocalPreviewUrl(url) {
  const value = String(url || "");
  return value.startsWith("blob:") || value.startsWith("data:");
}

export function serializeMessageWindow(messages, { limit = MESSAGE_WINDOW_ROW_CAP } = {}) {
  const rows = [];
  for (const row of messages || []) {
    if (!row || !(row.id || row.client_message_id)) continue;
    const status = String(row.send_status || "");
    if (status === "pending" || status === "failed") continue;
    const { attachmentUrl, ...rest } = row;
    void attachmentUrl;
    if (isLocalPreviewUrl(rest.attachmentUrl)) {
      delete rest.attachmentUrl;
    }
    rows.push({
      ...rest,
      // Never persist a signed URL — they die, and a stale `src` collapses the bubble.
      attachmentUrl: undefined,
    });
  }
  const cap = Math.max(1, Number(limit) || MESSAGE_WINDOW_ROW_CAP);
  return rows.slice(-cap);
}

export function evictWindowKeys(entries, { cap = MESSAGE_WINDOW_THREAD_CAP, keepKey = "" } = {}) {
  const list = [...(entries || [])].filter((row) => row?.key);
  const limit = Math.max(1, Number(cap) || MESSAGE_WINDOW_THREAD_CAP);
  list.sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0));
  const kept = [];
  for (const row of list) {
    if (kept.length < limit || row.key === keepKey) kept.push(row.key);
  }
  return new Set(kept);
}

export async function readMessageWindow(threadKey) {
  const key = String(threadKey || "");
  if (!key) return [];
  let db;
  try {
    db = await openDb();
    if (!db) return [];
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGE_WINDOW_STORE, "readonly");
      const req = tx.objectStore(MESSAGE_WINDOW_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("message window read failed"));
    });
    return Array.isArray(row?.messages) ? row.messages : [];
  } catch (e) {
    console.warn("message window cache read failed", e);
    return [];
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

export async function writeMessageWindow(threadKey, messages) {
  const key = String(threadKey || "");
  if (!key) return;
  const serialized = serializeMessageWindow(messages);
  if (!serialized.length) return;
  let db;
  try {
    db = await openDb();
    if (!db) return;
    const storeRows = await new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGE_WINDOW_STORE, "readonly");
      const req = tx.objectStore(MESSAGE_WINDOW_STORE).openCursor();
      const collected = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(collected);
          return;
        }
        collected.push({ key: cursor.key, savedAt: cursor.value?.savedAt || 0 });
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error("message window inventory failed"));
    });
    const next = { messages: serialized, savedAt: Date.now() };
    const keep = evictWindowKeys(
      [...storeRows.filter((row) => row.key !== key), { key, savedAt: next.savedAt }],
      { keepKey: key },
    );
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGE_WINDOW_STORE, "readwrite");
      const store = tx.objectStore(MESSAGE_WINDOW_STORE);
      store.put(next, key);
      for (const row of storeRows) {
        if (!keep.has(row.key) && row.key !== key) store.delete(row.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("message window write failed"));
    });
  } catch (e) {
    console.warn("message window cache write failed", e);
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

export async function restoreAndResignMessageWindow(threadKey, hydrateRow) {
  const cached = await readMessageWindow(threadKey);
  if (!cached.length) return [];
  if (typeof hydrateRow !== "function") return cached;
  const signed = [];
  for (const row of cached) {
    try {
      signed.push((await hydrateRow(row)) || row);
    } catch {
      signed.push(row);
    }
  }
  return signed;
}

export async function clearMessageWindows() {
  let db;
  try {
    db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGE_WINDOW_STORE, "readwrite");
      tx.objectStore(MESSAGE_WINDOW_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("message window clear failed"));
    });
  } catch (e) {
    console.warn("message window cache clear failed", e);
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}
