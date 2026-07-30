/** Preferred MediaRecorder MIME types (Safari → mp4, Chromium → webm). */
const CANDIDATE_TYPES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export const VOICE_MEMO_MAX_MS = 10 * 60 * 1000;
export const VOICE_MEMO_MAX_BYTES = 10 * 1024 * 1024;

export function voiceRecordingSupported() {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

export function pickVoiceMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function voiceFileExtension(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

export function formatVoiceDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isAudioAttachmentMime(mime) {
  return String(mime || "").toLowerCase().startsWith("audio/");
}

/**
 * Record until stop() is called or max duration.
 * Returns { blob, mimeType, durationMs }.
 */
export async function startVoiceRecording({ onTick, maxMs = VOICE_MEMO_MAX_MS } = {}) {
  if (!voiceRecordingSupported()) {
    throw new Error("Voice recording isn’t supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickVoiceMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks = [];
  const startedAt = Date.now();
  let tickTimer = null;
  let maxTimer = null;
  let settled = false;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopTracks = () => {
    stream.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* ignore */ }
    });
  };

  const clearTimers = () => {
    if (tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    if (maxTimer) {
      window.clearTimeout(maxTimer);
      maxTimer = null;
    }
  };

  const resultPromise = new Promise((resolve, reject) => {
    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      stopTracks();
      reject(new Error("Recording failed — try again."));
    };
    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      stopTracks();
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      const durationMs = Math.max(0, Date.now() - startedAt);
      if (!blob.size) {
        reject(new Error("Recording was empty — try again."));
        return;
      }
      resolve({ blob, mimeType: type, durationMs });
    };
  });

  tickTimer = window.setInterval(() => {
    onTick?.(Date.now() - startedAt);
  }, 200);

  maxTimer = window.setTimeout(() => {
    try {
      if (recorder.state === "recording") recorder.stop();
    } catch { /* ignore */ }
  }, maxMs);

  recorder.start(250);

  return {
    stop: () => {
      try {
        if (recorder.state === "recording" || recorder.state === "paused") {
          recorder.stop();
        }
      } catch { /* ignore */ }
    },
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimers();
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch { /* ignore */ }
      stopTracks();
    },
    result: resultPromise,
  };
}
