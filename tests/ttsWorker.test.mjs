import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/generate-board.mjs';

test('CORS permits the published Vercel domain, not arbitrary origins', async () => {
  for (const origin of ['https://cominucador-visual-nunu.vercel.app', 'https://example.com']) {
    const response = await worker.fetch(new Request('https://worker/api/generate-speech', { method: 'OPTIONS', headers: { Origin: origin } }), {});
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin.includes('cominucador') ? origin : null);
  }
});

test('worker preserves model, Leda, Mexican child prompt, WAV and generation timing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('gemini-3.1-flash-tts-preview:generateContent'));
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.speechConfig.languageCode, 'es-MX');
    assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Leda');
    assert.match(body.contents[0].parts[0].text, /voz infantil/);
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAA=' } }] } }] });
  };
  try {
    const response = await worker.fetch(new Request('https://worker/api/generate-speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Quiero agua', voiceStyle: 'child' }),
    }), { GEMINI_API_KEY: 'test-only' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'audio/wav');
    assert.match(response.headers.get('Server-Timing'), /gemini;dur=[\d.]+, encoding;dur=/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
    assert.equal(bytes.length, 46);
  } finally { globalThis.fetch = originalFetch; }
});
