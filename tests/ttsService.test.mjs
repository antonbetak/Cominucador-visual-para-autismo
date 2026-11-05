import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

let spoken = [];
let played = [];
let requests = [];
globalThis.speechSynthesis = { cancel() {}, getVoices: () => [], speak: (u) => spoken.push(u.text) };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.Audio = class {
  addEventListener() {}
  removeAttribute() {}
  load() {}
  pause() {}
  async play() { played.push(this.src); }
};
globalThis.fetch = () => new Promise((resolve) => requests.push(resolve));
const tts = await import('../src/services/ttsService.js');
const finish = (resolve) => resolve(new Response(new Blob(['audio']), { headers: { 'Content-Type': 'audio/wav' } }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitRequests(count = 1) {
  for (let i = 0; i < 500 && requests.length < count; i++) await tick();
  assert.equal(requests.length, count);
}

test('deduplicates requests, speaks fallback once, then uses warm memory', async () => {
  const a = tts.playGeneratedSpeech('agua');
  const b = tts.playGeneratedSpeech('agua');
  await waitRequests();
  assert.equal(requests.length, 1);
  assert.deepEqual(spoken, ['agua', 'agua']); // one per tap, never a late Gemini replacement
  finish(requests.shift());
  await Promise.all([a, b]);
  assert.equal(played.length, 0);
  await tts.playGeneratedSpeech('agua');
  assert.equal(played.length, 1);
  assert.equal(requests.length, 0);
});

test('only latest selection plays when requests finish out of order', async () => {
  const a = tts.playGeneratedSpeech('primera', { preferSpeed: false });
  const b = tts.playGeneratedSpeech('segunda', { preferSpeed: false });
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
  const a = tts.playGeneratedSpeech('pendiente', { preferSpeed: false });
  await waitRequests();
  await tts.playRecordedSpeech('recording.mp4');
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
  assert.ok(entries.some((entry) => entry.key.endsWith('|agua')));
  const reloaded = await import('../src/services/ttsService.js?reload');
  await reloaded.playGeneratedSpeech('agua', { preferSpeed: false });
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
  assert.ok(entries.reduce((sum, item) => sum + item.blob.size, 0) <= 32 * 1024 * 1024);
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
