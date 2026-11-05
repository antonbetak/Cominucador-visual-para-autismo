import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

let spoken = [];
let played = [];
let requests = [];
let rejectPlayback = false;
globalThis.speechSynthesis = { cancel() {}, getVoices: () => [], speak: (u) => spoken.push(u.text) };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.Audio = class {
  addEventListener() {}
  removeAttribute() {}
  load() {}
  pause() {}
  async play() {
    if (!this.src?.startsWith("data:")) {
      if (rejectPlayback) throw new DOMException("Tap required", "NotAllowedError");
      played.push(this.src);
    }
  }
};
globalThis.fetch = () => new Promise((resolve) => requests.push(resolve));
const tts = await import('../src/services/ttsService.js');
const finish = (resolve) => resolve(new Response(new Blob(['audio']), { headers: { 'Content-Type': 'audio/wav' } }));
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
  const a = tts.playGeneratedSpeech('pendiente', { emergencyVoice: true });
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


test('Gemini error reports retry without automatically enabling local voice', async () => {
  let errors = 0;
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('sin red', { onError: () => errors++ });
  await waitRequests();
  requests.shift()(new Response('', { status: 502 }));
  assert.equal(await result, false);
  assert.equal(errors, 1);
  assert.equal(spoken.length, before);
  const retry = tts.playGeneratedSpeech('sin red', { retry: true });
  await waitRequests();
  finish(requests.shift());
  assert.equal(await retry, true);
});

test('local emergency voice requires explicit opt-in and a Gemini failure', async () => {
  const before = spoken.length;
  const result = tts.playGeneratedSpeech('emergencia', { emergencyVoice: true });
  await waitRequests();
  assert.equal(spoken.length, before);
  requests.shift()(new Response('', { status: 503 }));
  assert.equal(await result, true);
  assert.equal(spoken.length, before + 1);
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
