/** Persist Monday voice-drop drafts in IndexedDB so a failed publish doesn’t lose the take. */

const DB_NAME = "mm_voice_drop_drafts";
const STORE = "drafts";
const KEY = "pending";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

/**
 * @param {{ blob: Blob, mime: string, durationMs: number, caption?: string, fileName?: string }} draft
 */
export async function saveVoiceDropDraft(draft) {
  if (!draft?.blob) return;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("draft save failed"));
      tx.objectStore(STORE).put({
        blob: draft.blob,
        mime: String(draft.mime || draft.blob.type || "audio/mp4"),
        durationMs: Number(draft.durationMs) || 0,
        caption: String(draft.caption || "").slice(0, 500),
        fileName: String(draft.fileName || "monday-voice.m4a"),
        savedAt: Date.now(),
      }, KEY);
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<null | { file: File, url: string, durationMs: number, caption: string }>} */
export async function loadVoiceDropDraft() {
  const db = await openDb();
  try {
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("draft load failed"));
    });
    if (!row?.blob) return null;
    const mime = String(row.mime || row.blob.type || "audio/mp4");
    const file = new File(
      [row.blob],
      row.fileName || "monday-voice.m4a",
      { type: mime },
    );
    return {
      file,
      url: URL.createObjectURL(row.blob),
      durationMs: Number(row.durationMs) || 0,
      caption: String(row.caption || ""),
    };
  } finally {
    db.close();
  }
}

export async function clearVoiceDropDraft() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("draft clear failed"));
      tx.objectStore(STORE).delete(KEY);
    });
  } finally {
    db.close();
  }
}
