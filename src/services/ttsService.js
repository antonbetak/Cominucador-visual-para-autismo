const TTS_ENDPOINT = "/api/generate-speech";
export const NUNU_TTS_STYLE = "child";
export const NUNU_TTS_VOICE = "Leda";
const VERSION = "gemini-3.1-flash-tts-preview:es-MX:child:Leda:v1";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 160;
const MAX_AGE = 30 * 86400000;
const memory = new Map();
const pending = new Map();
const failures = new Map();
const revisions = new Map();
let database;
let sequence = 0;
let backgroundGenerations = 0;
let backgroundQueue = Promise.resolve();
let activeAudio;
let reusableAudio;
let foregroundRequests = 0;
const diskReads = new Map();
let activeUrl;
const metrics = [];

function measure(stage, started, extra = {}) {
  const entry = { stage, ms: +(performance.now() - started).toFixed(1), ...extra };
  metrics.push(entry);
  if (metrics.length > 100) metrics.shift();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nunu:tts-metric", { detail: entry }));
}
export const getSpeechMetrics = () => metrics.slice();
const normalize = (text) => String(text || "").trim();
const storedSize = (entry) => entry.blob?.size || entry.audio?.byteLength || 0;
const keyFor = (text) => `${VERSION}|${normalize(text)}`;

function openDatabase() {
  if (!database) database = new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null);
    const request = indexedDB.open("nunu-speech", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("audio", { keyPath: "key" });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
    request.onerror = () => { database = null; resolve(null); };
    request.onblocked = () => resolve(null);
  });
  return database;
}
async function storeOperation(mode, operation) {
  try {
    const db = await openDatabase();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction("audio", mode);
      const request = operation(tx.objectStore("audio"));
      tx.oncomplete = () => resolve(request?.result ?? true);
      tx.onerror = tx.onabort = () => resolve(null);
    });
  } catch { return null; } // Private mode, quota and eviction must never prevent speech.
}
function remember(key, blob) {
  memory.delete(key);
  memory.set(key, blob);
  let bytes = [...memory.values()].reduce((sum, item) => sum + item.size, 0);
  while (memory.size > 48 || bytes > 12 * 1024 * 1024) {
    const first = memory.keys().next().value;
    bytes -= memory.get(first).size;
    memory.delete(first);
  }
}
// Prune and write in the same transaction so concurrent downloads respect the budget.
async function persist(key, blob, revision) {
  const db = await openDatabase();
  if (!db || blob.size > MAX_BYTES || revisions.get(key) !== revision) return;
  try {
    const audio = await blob.arrayBuffer();
    await new Promise((resolve) => {
      const tx = db.transaction("audio", "readwrite");
      const store = tx.objectStore("audio");
      const request = store.getAll();
      request.onsuccess = () => {
        if (revisions.get(key) !== revision) return;
        const now = Date.now();
        const entries = request.result.filter((item) => {
          if (item.key === key || now - item.createdAt > MAX_AGE) { store.delete(item.key); return false; }
          return true;
        }).sort((a, b) => a.usedAt - b.usedAt);
        let bytes = entries.reduce((sum, item) => sum + storedSize(item), blob.size);
        while (entries.length >= MAX_ENTRIES || bytes > MAX_BYTES) {
          const oldest = entries.shift();
          if (!oldest) break;
          bytes -= storedSize(oldest);
          store.delete(oldest.key);
        }
        store.put({ key, audio, mimeType: blob.type, createdAt: now, usedAt: now });
      };
      tx.oncomplete = tx.onabort = tx.onerror = resolve;
    });
  } catch { /* Storage is best effort. */ }
}
async function readCached(text) {
  const key = keyFor(text);
  if (memory.has(key)) return { blob: memory.get(key), source: "memory" };
  if (diskReads.has(key)) return diskReads.get(key);
  const revision = revisions.get(key);
  const task = (async () => {
    const started = performance.now();
    const saved = await storeOperation("readonly", (store) => store.get(key));
    if (revisions.get(key) !== revision) return null;
    if (!saved || !storedSize(saved) || Date.now() - saved.createdAt >= MAX_AGE) return null;
    const blob = saved.blob || new Blob([saved.audio], { type: saved.mimeType || "audio/wav" });
    remember(key, blob);
    void storeOperation("readwrite", (store) => store.put({ ...saved, usedAt: Date.now() }));
    measure("cache", started, { source: "indexeddb" });
    return { blob, source: "indexeddb" };
  })();
  diskReads.set(key, task);
  try { return await task; } finally { diskReads.delete(key); }
}
async function waitForForeground(promoted) {
  while (foregroundRequests && !promoted()) await new Promise((resolve) => setTimeout(resolve, 25));
}
async function requestSpeech(text, background = false, cancelled = () => false) {
  const key = keyFor(text);
  if (memory.has(key)) return { blob: memory.get(key), source: "memory" };
  if (pending.has(key)) {
    const task = pending.get(key);
    if (!background) task.promoted = true;
    return task;
  }
  const revision = revisions.get(key);
  const task = (async () => {
    const saved = await readCached(text);
    if (revisions.get(key) !== revision) throw new Error("Invalidated speech");
    if (saved) return saved;
    if (background) {
      await waitForForeground(() => pending.get(key)?.promoted);
      if (cancelled() && !pending.get(key)?.promoted) throw new Error("Cancelled preload");
    }
    if ((failures.get(key) || 0) > Date.now()) throw new Error("TTS cooldown");
    const backgroundOnly = background && !pending.get(key)?.promoted;
    if (backgroundOnly && backgroundGenerations >= 24) throw new Error("Background budget exhausted");
    if (backgroundOnly) backgroundGenerations += 1;
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(TTS_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceStyle: NUNU_TTS_STYLE }), signal: controller.signal,
      });
      measure("request", started, { serverTiming: response.headers.get("Server-Timing") });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("audio/")) throw new Error(`TTS ${response.status}`);
      const download = performance.now();
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty TTS audio");
      measure("download", download, { bytes: blob.size });
      let persisted;
      if (revisions.get(key) === revision) {
        remember(key, blob);
        persisted = persist(key, blob, revision);
      }
      if (revisions.get(key) !== revision) throw new Error("Invalidated speech");
      return { blob, source: "generated", persisted };
    } catch (error) {
      failures.set(key, Date.now() + 60000);
      throw error;
    } finally { clearTimeout(timeout); }
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}

function releaseAudio() {
  if (activeAudio) { activeAudio.onplaying = activeAudio.onended = activeAudio.onerror = null; activeAudio.pause(); activeAudio.removeAttribute("src"); activeAudio.load(); activeAudio = null; }
  if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
}
export function stopGeneratedSpeech() {
  sequence += 1;
  globalThis.speechSynthesis?.cancel();
  releaseAudio();
}
function speakFallback(text, options, token, started) {
  if (token !== sequence || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-MX";
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === "es-mx") || voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) || null;
  utterance.onstart = () => {
    if (token !== sequence) return;
    measure("playback", started, { source: "speechSynthesis" });
  };
  speechSynthesis.speak(utterance);
  return true;
}
async function playBlob(source, token, started, sourceName) {
  if (token !== sequence) return false;
  const audio = reusableAudio ||= new Audio();
  activeAudio = audio;
  if (typeof source === "string") audio.src = source;
  else { activeUrl = URL.createObjectURL(source); audio.src = activeUrl; }
  audio.onplaying = () => {
    if (token !== sequence) { audio.pause(); return; }
    measure("playback", started, { source: sourceName });
  };
  const release = () => { if (activeAudio === audio) releaseAudio(); };
  audio.onended = release;
  audio.onerror = release;
  try { await audio.play(); return token === sequence; }
  catch (error) { if (token !== sequence) return false; releaseAudio(); throw error; }
}
export async function playRecordedSpeech(source) {
  stopGeneratedSpeech();
  return playBlob(source, sequence, performance.now(), "recording");
}
// Reuse an element activated by the tap so asynchronous WAV playback can work on iOS.
// This PCM WAV contains silence, not an audible waiting effect.
function prepareAudio(token) {
  const audio = reusableAudio ||= new Audio();
  const silent = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQIAAAAAAA==";
  activeAudio = audio;
  audio.src = silent;
  try {
    void audio.play().then(() => {
      if (token === sequence && audio.src === silent) audio.pause();
    }).catch(() => {});
  } catch { /* The eventual play reports any playback restriction to the caregiver. */ }
}
export async function playGeneratedSpeech(text, options = {}) {
  text = normalize(text);
  if (!text) return false;
  stopGeneratedSpeech();
  const token = sequence;
  const started = performance.now();
  if (options.retry === true) failures.delete(keyFor(text));
  const cached = memory.get(keyFor(text));
  try {
    if (cached) {
      remember(keyFor(text), cached);
      return await playBlob(cached, token, started, "memory");
    }
    prepareAudio(token);
    foregroundRequests += 1;
    let result;
    try { result = await requestSpeech(text); }
    finally { foregroundRequests -= 1; }
    if (token !== sequence) return false;
    const played = await playBlob(result.blob, token, started, result.source);
    // Begin sound immediately, but resolve this operation only once storage settles.
    await result.persisted;
    return played && token === sequence;
  } catch (error) {
    if (token !== sequence) return false;
    // Recheck the cache: another tab or a finishing request may have stored Leda.
    // A rejected play must not retry automatically (Safari may require another tap).
    if (error?.name !== "NotAllowedError") {
      const recovered = await readCached(text);
      if (token !== sequence) return false;
      if (recovered) {
        try { return await playBlob(recovered.blob, token, started, recovered.source); }
        catch { /* Report a controlled failure below. */ }
      }
    }
    if (token !== sequence) return false;
    releaseAudio();
    measure("error", started, { source: "gemini", reason: error?.name || "Error" });
    if (options.emergencyVoice === true && speakFallback(text, options, token, started)) return true;
    options.onError?.();
    return false;
  }
}
export function prefetchGeneratedSpeech(texts) {
  let cancelled = false;
  const all = [...new Set(texts.map(normalize))].filter((text) => text && text.length <= 300);
  const isCancelled = () => cancelled || document.visibilityState === "hidden";
  // Restore visible saved phrases immediately within the 48-entry memory budget.
  const restored = Promise.all(all.slice(0, 48).map((text) => readCached(text)));
  void restored.then(() => {
    backgroundQueue = backgroundQueue.then(async () => {
      const missing = all.filter((text) => !memory.has(keyFor(text))).slice(0, 12);
      for (const text of missing) {
        if (isCancelled()) break;
        try { await requestSpeech(text, true, isCancelled); } catch { break; }
      }
    });
  });
  return () => { cancelled = true; };
}
export async function invalidateGeneratedSpeech(text) {
  const key = keyFor(text);
  revisions.set(key, (revisions.get(key) || 0) + 1);
  memory.delete(key);
  failures.delete(key);
  await storeOperation("readwrite", (store) => store.delete(key));
}
export async function clearGeneratedSpeechCache() {
  for (const key of new Set([...memory.keys(), ...pending.keys()])) revisions.set(key, (revisions.get(key) || 0) + 1);
  memory.clear();
  failures.clear();
  await storeOperation("readwrite", (store) => store.clear());
}
if (typeof window !== "undefined") window.addEventListener("pagehide", stopGeneratedSpeech);
