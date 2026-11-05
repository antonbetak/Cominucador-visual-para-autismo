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
        let bytes = entries.reduce((sum, item) => sum + item.blob.size, blob.size);
        while (entries.length >= MAX_ENTRIES || bytes > MAX_BYTES) {
          const oldest = entries.shift();
          if (!oldest) break;
          bytes -= oldest.blob.size;
          store.delete(oldest.key);
        }
        store.put({ key, blob, createdAt: now, usedAt: now });
      };
      tx.oncomplete = tx.onabort = tx.onerror = resolve;
    });
  } catch { /* Storage is best effort. */ }
}
async function requestSpeech(text, background = false) {
  const key = keyFor(text);
  if (memory.has(key)) return memory.get(key);
  if (pending.has(key)) return pending.get(key);
  const revision = revisions.get(key);
  const task = (async () => {
    const lookup = performance.now();
    const saved = await storeOperation("readonly", (store) => store.get(key));
    if (revisions.get(key) !== revision) throw new Error("Invalidated speech");
    if (saved && Date.now() - saved.createdAt < MAX_AGE && saved.blob?.size) {
      if (revisions.get(key) === revision) {
        remember(key, saved.blob);
        void storeOperation("readwrite", (store) => store.put({ ...saved, usedAt: Date.now() }));
      }
      measure("cache", lookup, { source: "indexeddb" });
      return saved.blob;
    }
    if ((failures.get(key) || 0) > Date.now()) throw new Error("TTS cooldown");
    if (background && backgroundGenerations >= 24) throw new Error("Background budget exhausted");
    if (background) backgroundGenerations += 1;
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
      if (revisions.get(key) === revision) {
        remember(key, blob);
        void persist(key, blob, revision);
      }
      if (revisions.get(key) !== revision) throw new Error("Invalidated speech");
      return blob;
    } catch (error) {
      failures.set(key, Date.now() + 60000);
      throw error;
    } finally { clearTimeout(timeout); }
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}

function releaseAudio() {
  if (activeAudio) { activeAudio.pause(); activeAudio.removeAttribute("src"); activeAudio.load(); activeAudio = null; }
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
    if (token !== sequence) { speechSynthesis.cancel(); return; }
    measure("playback", started, { source: "speechSynthesis" });
  };
  speechSynthesis.speak(utterance);
  return true;
}
async function playBlob(source, token, started, sourceName) {
  if (token !== sequence) return false;
  const audio = new Audio();
  activeAudio = audio;
  if (typeof source === "string") audio.src = source;
  else { activeUrl = URL.createObjectURL(source); audio.src = activeUrl; }
  audio.addEventListener("playing", () => {
    if (token !== sequence) { audio.pause(); return; }
    measure("playback", started, { source: sourceName });
  }, { once: true });
  const release = () => { if (activeAudio === audio) releaseAudio(); };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  try { await audio.play(); return token === sequence; }
  catch (error) { if (token !== sequence) return false; releaseAudio(); throw error; }
}
export async function playRecordedSpeech(source) {
  stopGeneratedSpeech();
  return playBlob(source, sequence, performance.now(), "recording");
}
export async function playGeneratedSpeech(text, options = {}) {
  text = normalize(text);
  if (!text) return false;
  stopGeneratedSpeech();
  const token = sequence;
  const started = performance.now();
  const blob = memory.get(keyFor(text));
  if (blob) {
    remember(keyFor(text), blob);
    try { return await playBlob(blob, token, started, "memory"); }
    catch { return speakFallback(text, options, token, started); }
  }
  // Invoke native speech inside the tap gesture (particularly important on iOS).
  // Gemini warms the cache only; it never replaces an utterance already speaking.
  const fallback = options.preferSpeed !== false && speakFallback(text, options, token, started);
  try {
    const result = await requestSpeech(text);
    if (fallback || token !== sequence) return Boolean(fallback);
    return await playBlob(result, token, started, "generated");
  } catch { return fallback || speakFallback(text, options, token, started); }
}
export function prefetchGeneratedSpeech(texts) {
  let cancelled = false;
  // One background request, at most 12 phrases per category visit, no whole-board preload.
  const queue = [...new Set(texts.map(normalize))].filter((text) => text && text.length <= 300).slice(0, 12);
  const timer = setTimeout(() => {
    backgroundQueue = backgroundQueue.then(async () => {
      for (const text of queue) {
        if (cancelled || document.visibilityState === "hidden") break;
        try { await requestSpeech(text, true); } catch { break; }
      }
    });
  }, 500);
  return () => { cancelled = true; clearTimeout(timer); };
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
