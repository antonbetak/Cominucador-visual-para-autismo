import 'fake-indexeddb/auto';
import { wavFixture } from './wavFixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const policyStorage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable:true, writable:true, value:{ getItem:key=>policyStorage.get(key), setItem:(key,value)=>policyStorage.set(key,value) } });
let spoken = [];
let utterances = [];
let played = [];
let requests = [];
let rejectPlayback = false;
let rejectDecode = false;
// "start": the utterance starts; "error": onerror fires; "never": the browser drops it without events.
let speechMode = "start";
const cancelledUtterances = new Set();
globalThis.speechSynthesis = {
  cancel() { for (const utterance of utterances) cancelledUtterances.add(utterance); },
  resume() {},
  getVoices: () => [],
  speak: (utterance) => {
    utterances.push(utterance);
    if (speechMode === "never") return;
    setTimeout(() => {
      if (cancelledUtterances.has(utterance)) return;
      if (speechMode === "error") return utterance.onerror?.({ error: "synthesis-failed" });
      spoken.push(utterance.text);
      utterance.onstart?.();
    }, 0);
  },
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.Audio = class {
  addEventListener() {}
  removeAttribute() {}
  load() {}
  pause() {}
  async play() {
    if (this.src?.startsWith("data:")) return;
    if (rejectPlayback) throw new DOMException("Tap required", "NotAllowedError");
    if (rejectDecode) {
      this.error = { code: 4 }; // MEDIA_ERR_SRC_NOT_SUPPORTED
      throw new DOMException("The element has no supported sources", "NotSupportedError");
    }
    this.error = null;
    played.push(this.src);
  }
};
globalThis.fetch = () => new Promise((resolve, reject) => {
  const send = (value) => resolve(value);
  send.reject = reject;
  requests.push(send);
});
const tts = await import('../src/services/ttsService.js');
const finish = (resolve) => resolve(new Response(new Blob([wavFixture()]), { headers: { 'Content-Type': 'audio/wav' } }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitRequests(count = 1) {
  for (let i = 0; i < 500 && requests.length < count; i++) await tick();
  assert.equal(requests.length, count);
}

test('deduplicates requests, waits for Leda without local voice, then uses warm memory', async () => {
  const a = tts.playGeneratedSpeech('agua');
  const b = tts.playGeneratedSpeech('agua');
  await waitRequests();
  assert.equal(requests.length, 1);
  assert.deepEqual(spoken, []);
  assert.equal(played.length, 0);
  finish(requests.shift());
  await Promise.all([a, b]);
  assert.equal(played.length, 1);
  await tts.playGeneratedSpeech('agua');
  assert.equal(played.length, 2);
  assert.equal(requests.length, 0);
});

test('only latest selection plays when requests finish out of order', async () => {
  const a = tts.playGeneratedSpeech('primera');
  const b = tts.playGeneratedSpeech('segunda');
  await waitRequests(2);
  const [first, second] = requests.splice(0);
  finish(second);
  await b;
  const count = played.length;
  finish(first);
  assert.equal(await a, false);
  assert.equal(played.length, count);
});

test('recording cancels pending speech; stale failure cannot speak', async () => {
  const a = tts.playGeneratedSpeech('pendiente');
  await waitRequests();
  await tts.playRecordedSpeech('recording.mp4');
  assert.equal(played.at(-1), 'recording.mp4');
  const count = spoken.length;
  requests.shift()(new Response('', { status: 502 }));
  await a;
  assert.equal(spoken.length, count);
});

test('text invalidation leaves other cached phrases intact', async () => {
  await tts.invalidateGeneratedSpeech('agua');
  await tts.playGeneratedSpeech('segunda');
  assert.equal(requests.length, 0);
  const a = tts.playGeneratedSpeech('agua');
  await waitRequests();
  assert.equal(requests.length, 1);
  finish(requests.shift());
  await a;
});

async function databaseOperation(mode, action) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nunu-speech', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('audio', mode);
      const result = action(tx.objectStore('audio'));
      tx.oncomplete = () => { db.close(); resolve(result?.result); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

test('reload restores persisted Gemini audio without network', async () => {
  await tick();
  const entries = await databaseOperation('readonly', (store) => store.getAll());
  assert.ok(entries.some((entry) => entry.key.endsWith('|agua') && entry.audio instanceof ArrayBuffer));
  const reloaded = await import('../src/services/ttsService.js?reload');
  await reloaded.playGeneratedSpeech('agua');
  assert.equal(requests.length, 0);
  assert.equal(reloaded.getSpeechMetrics().find((entry) => entry.stage === 'cache').source, 'indexeddb');
  await reloaded.playGeneratedSpeech('agua');
  assert.equal(requests.length, 0);
  reloaded.stopGeneratedSpeech();
});

test('persistence removes expired entries and enforces entry and byte limits', async () => {
  const old = Date.now() - 31 * 86400000;
  await databaseOperation('readwrite', (store) => {
    for (let i = 0; i < 165; i++) store.put({ key: `seed-${i}`, blob: new Blob([new Uint8Array(220000)]), createdAt: Date.now(), usedAt: i });
    store.put({ key: 'expired', blob: new Blob(['old']), createdAt: old, usedAt: old });
  });
  const result = tts.playGeneratedSpeech('nueva');
  await waitRequests();
  finish(requests.shift());
  await result;
  await tick();
  const entries = await databaseOperation('readonly', (store) => store.getAll());
  assert.ok(entries.length <= 160);
  assert.ok(entries.reduce((sum, item) => sum + (item.blob?.size || item.audio?.byteLength || 0), 0) <= 32 * 1024 * 1024);
  assert.ok(!entries.some((entry) => entry.key === 'expired'));
});

test('invalidating in-flight generation cannot repopulate its old cache', async () => {
  const result = tts.playGeneratedSpeech('anterior');
  await waitRequests();
  await tts.invalidateGeneratedSpeech('anterior');
  finish(requests.shift());
  await result;
  await tick();
  const entries = await databaseOperation('readonly', (store) => store.getAll());
  assert.ok(!entries.some((entry) => entry.key.endsWith('|anterior')));
});

test('when Gemini is available Leda speaks and the emergency voice stays silent', async () => {
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('gemini disponible');
  await waitRequests();
  assert.equal(spoken.length, before); // never while Leda is being generated
  finish(requests.shift());
  assert.equal(await result, true);
  assert.equal(spoken.length, before); // Leda played, no local voice
});

test('a Gemini failure speaks with the local emergency voice and retry recovers Leda', async () => {
  let errors = 0;
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('sin red', { onError: () => errors++ });
  await waitRequests();
  requests.shift()(new Response('', { status: 502 }));
  assert.equal(await result, true);
  assert.equal(errors, 0); // no error notice when the emergency voice spoke
  assert.equal(spoken.length, before + 1);
  assert.equal(spoken.at(-1), 'sin red');
  const retry = tts.playGeneratedSpeech('sin red', { retry: true });
  await waitRequests();
  finish(requests.shift());
  assert.equal(await retry, true);
  assert.equal(spoken.length, before + 1); // Leda recovered as the main voice
});

test('the emergency voice is automatic and speaks only after a Gemini failure', async () => {
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('emergencia');
  await waitRequests();
  assert.equal(spoken.length, before); // never while waiting for Leda
  requests.shift()(new Response('', { status: 503 }));
  assert.equal(await result, true);
  assert.equal(spoken.length, before + 1);
  assert.equal(spoken.at(-1), 'emergencia');
});

test('without a connection the emergency voice speaks instead of staying silent', async () => {
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('sin conexion');
  await waitRequests();
  requests.shift().reject(new TypeError('Failed to fetch'));
  assert.equal(await result, true);
  assert.equal(spoken.length, before + 1);
  assert.equal(spoken.at(-1), 'sin conexion');
  assert.ok(tts.getSpeechMetrics().some((entry) => entry.stage === 'error' && entry.code === 'network'));
});

test('the emergency voice reports success only when speech actually starts', async () => {
  speechMode = "error";
  try {
    const before = spoken.length;
    let failure;
    const result = tts.playGeneratedSpeech('voz fallida', { onError: (error) => { failure = error; } });
    await waitRequests();
    requests.shift()(new Response('', { status: 503 }));
    assert.equal(await result, false); // never started: not a success
    assert.equal(spoken.length, before);
    assert.equal(failure.status, 503); // the caregiver keeps the retry notice
  } finally { speechMode = "start"; }
});

test('a local voice that never starts reports failure and cancels the utterance', async () => {
  speechMode = "never";
  try {
    const before = spoken.length;
    let failure;
    const result = tts.playGeneratedSpeech('voz muda', { fallbackTimeoutMs: 60, onError: (error) => { failure = error; } });
    await waitRequests();
    requests.shift()(new Response('', { status: 503 }));
    assert.equal(await result, false); // never started: not a success
    assert.equal(spoken.length, before);
    assert.equal(failure.status, 503); // the caregiver keeps the retry notice
    assert.ok(cancelledUtterances.has(utterances.at(-1))); // the dropped utterance cannot speak late
  } finally { speechMode = "start"; }
});

test('a new tap cancels a pending emergency voice and only the latest speaks', async () => {
  speechMode = "never";
  const a = tts.playGeneratedSpeech('primera local');
  await waitRequests();
  requests.shift()(new Response('', { status: 503 }));
  const seen = utterances.length;
  for (let i = 0; i < 100 && utterances.length === seen; i++) await tick();
  assert.equal(utterances.length, seen + 1); // the fallback utterance reached the browser
  speechMode = "start";
  const b = tts.playGeneratedSpeech('segunda local');
  await waitRequests();
  requests.shift()(new Response('', { status: 503 }));
  assert.equal(await a, false); // cancelled before it ever started
  assert.equal(await b, true);
  assert.ok(!spoken.includes('primera local'));
  assert.equal(spoken.at(-1), 'segunda local');
});

test('category preload restores stored audio without generating or using local voice', async () => {
  globalThis.document = { visibilityState: 'visible' };
  const fresh = await import('../src/services/ttsService.js?hydrate');
  const entries = await databaseOperation('readonly', store => store.getAll());
  const entry = entries.find(e => e.key.endsWith('|sin red'));
  assert.ok(entry);
  const before = spoken.length;
  const cancel = fresh.prefetchGeneratedSpeech(['sin red']);
  for (let i=0; i<100 && !fresh.getSpeechMetrics().some(e => e.stage==='cache'); i++) await tick();
  assert.ok(fresh.getSpeechMetrics().some(e => e.stage==='cache'));
  await fresh.playGeneratedSpeech('sin red');
  assert.equal(requests.length, 0);
  assert.equal(spoken.length, before);
  cancel(); fresh.stopGeneratedSpeech();
});

test('tap promotes queued preload without deadlock; other background work waits for foreground', async () => {
  globalThis.document = { visibilityState: 'visible' };
  const service = await import('../src/services/ttsService.js?priority');
  const first = service.playGeneratedSpeech('priority foreground');
  await waitRequests();
  const stop = service.prefetchGeneratedSpeech(['priority background', 'background later']);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(requests.length, 1);
  const tapped = service.playGeneratedSpeech('priority background');
  await waitRequests(2);
  const [firstRequest, secondRequest] = requests.splice(0);
  stop();
  finish(secondRequest);
  assert.equal(await tapped, true);
  finish(firstRequest);
  assert.equal(await first, false);
  await tick();
  assert.equal(requests.length, 0);
  service.stopGeneratedSpeech();
});


test('blocked playback offers retry and never silently replaces cached Leda', async () => {
  rejectPlayback = true;
  const before = spoken.length;
  let errors = 0;
  try {
    assert.equal(await tts.playGeneratedSpeech('sin red', { onError: () => errors++ }), false);
    assert.equal(errors, 1);
    assert.equal(spoken.length, before);
    assert.equal(requests.length, 0);
  } finally { rejectPlayback = false; }
  assert.equal(await tts.playGeneratedSpeech('sin red'), true);
});

test('HTTP errors keep their status in metrics and speak with the emergency voice', async () => {
  for (const status of [400, 403, 500, 502, 503]) {
    const before = spoken.length;
    const result = tts.playGeneratedSpeech(`http-${status}`);
    await waitRequests();
    requests.shift()(Response.json({ code: status === 403 ? 'authentication' : 'generation', retryAfterMs: 1 }, { status }));
    assert.equal(await result, true);
    assert.equal(spoken.length, before + 1);
    assert.ok(tts.getSpeechMetrics().some((entry) => entry.stage === 'error' && entry.status === status && entry.failureStage === 'generation'));
  }
});

test('invalid network WAV is never played or cached; the emergency voice speaks and Leda can be retried', async () => {
  const before = played.length;
  const beforeSpoken = spoken.length;
  const result = tts.playGeneratedSpeech('corrupt response');
  await waitRequests();
  requests.shift()(new Response('not wav', { headers: { 'Content-Type': 'audio/wav' } }));
  assert.equal(await result, true);
  assert.equal(played.length, before); // invalid audio never reached the speaker
  assert.equal(spoken.length, beforeSpoken + 1);
  assert.equal(spoken.at(-1), 'corrupt response');
  const next = tts.playGeneratedSpeech('corrupt response');
  await waitRequests();
  finish(requests.shift());
  assert.equal(await next, true); // Leda on retry
  assert.equal(played.length, before + 1);
  assert.equal(spoken.length, beforeSpoken + 1);
});

test('undecodable cached audio is evicted, speaks locally and the next tap regenerates Leda', async () => {
  // Seed a valid Leda audio through the normal generation path.
  const seed = tts.playGeneratedSpeech('audio danado');
  await waitRequests();
  finish(requests.shift());
  assert.equal(await seed, true);
  const key = (await databaseOperation('readonly', store => store.getAll())).find(e => e.key.endsWith('|audio danado'))?.key;
  assert.ok(key);
  // The stored bytes no longer decode (e.g. an entry written by an old version).
  rejectDecode = true;
  const before = spoken.length;
  assert.equal(await tts.playGeneratedSpeech('audio danado'), true); // emergency voice, not silence
  assert.equal(spoken.length, before + 1);
  assert.equal(spoken.at(-1), 'audio danado');
  rejectDecode = false;
  // Only that entry was evicted; other cached phrases are intact.
  assert.equal(await databaseOperation('readonly', store => store.get(key)), undefined);
  await tts.playGeneratedSpeech('segunda');
  assert.equal(requests.length, 0);
  // The next tap regenerates Leda instead of staying silent or local.
  const regenerated = tts.playGeneratedSpeech('audio danado');
  await waitRequests();
  finish(requests.shift());
  assert.equal(await regenerated, true);
  assert.equal(spoken.length, before + 1);
});

test('an undecodable fresh generation is not kept and the emergency voice speaks', async () => {
  rejectDecode = true;
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('recien danado');
  await waitRequests();
  finish(requests.shift());
  assert.equal(await result, true);
  assert.equal(spoken.at(-1), 'recien danado');
  rejectDecode = false;
  await tick();
  const entries = await databaseOperation('readonly', store => store.getAll());
  assert.ok(!entries.some((entry) => entry.key.endsWith('|recien danado')));
  const retry = tts.playGeneratedSpeech('recien danado');
  await waitRequests();
  finish(requests.shift());
  assert.equal(await retry, true);
  assert.equal(spoken.length, before + 1); // Leda again
});

test('corrupt IndexedDB entry is evicted before generating a replacement', async () => {
  const entries = await databaseOperation('readonly', store => store.getAll());
  const template = entries.find(e => e.key.endsWith('|sin red'));
  const key = template.key.replace(/sin red$/, 'corrupt cache');
  await databaseOperation('readwrite', store => store.put({ ...template, key, audio: new Uint8Array([1,2]).buffer }));
  const fresh = await import('../src/services/ttsService.js?invalid-cache');
  const result = fresh.playGeneratedSpeech('corrupt cache');
  await waitRequests();
  const remaining = await databaseOperation('readonly', store => store.get(key));
  assert.equal(remaining, undefined);
  finish(requests.shift());
  assert.equal(await result, true);
  assert.ok(fresh.getSpeechMetrics().some(e => e.stage === 'error' && e.source === 'indexeddb' && e.code === 'format'));
  fresh.stopGeneratedSpeech();
});

test('background reservation survives reloads and cannot spend the daily quota on preload', async () => {
  const { reserveBackgroundGeneration } = await import('../src/services/ttsPolicy.js');
  assert.equal(await reserveBackgroundGeneration(), true);
  const reloaded = await import('../src/services/ttsPolicy.js?reload');
  assert.equal(await reloaded.reserveBackgroundGeneration(), false);
});

// This test must run before the one-hour quota block below: the block is shared by every module instance.
test('when the quota block ends Gemini is retried and Leda speaks again', async () => {
  const before = spoken.length;
  const blocked = tts.playGeneratedSpeech('quota breve');
  await waitRequests();
  requests.shift()(Response.json({ code: 'quota', retryAfterMs: 60 }, { status: 429 }));
  assert.equal(await blocked, true); // emergency voice during the block
  assert.equal(spoken.length, before + 1);
  await new Promise((resolve) => setTimeout(resolve, 90));
  const recovered = tts.playGeneratedSpeech('quota breve', { retry: true });
  await waitRequests();
  finish(requests.shift());
  assert.equal(await recovered, true);
  assert.equal(spoken.length, before + 1); // Leda is the main voice again
});

test('quota applies to all texts across reloads, speaks locally without network, cached Leda still plays', async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) };
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('quota one');
  await waitRequests();
  requests.shift()(Response.json({ code:'quota', retryAfterMs:3600000 }, { status:429 }));
  assert.equal(await result, true); // emergency voice, never silence
  assert.equal(spoken.at(-1), 'quota one');
  assert.ok(tts.getSpeechMetrics().some((entry) => entry.stage === 'error' && entry.code === 'quota' && entry.retryAt > Date.now() + 3500000));
  // A known quota block speaks locally without spending a request we know will fail.
  assert.equal(await tts.playGeneratedSpeech('quota other'), true);
  assert.equal(spoken.at(-1), 'quota other');
  assert.equal(requests.length, 0);
  const fresh = await import('../src/services/ttsService.js?quota-reload');
  assert.equal(await fresh.playGeneratedSpeech('quota new'), true);
  assert.equal(requests.length, 0);
  const spokenBeforeCached = spoken.length;
  assert.equal(await fresh.playGeneratedSpeech('sin red'), true); // cached Leda, not the local voice
  assert.equal(spoken.length, spokenBeforeCached);
  assert.equal(spoken.length, before + 3);
  fresh.stopGeneratedSpeech();
});
