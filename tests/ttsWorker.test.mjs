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

test('worker preserves HTTP failures, sanitizes errors and forwards Google quota delay', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const events = [];
  console.warn = event => events.push(JSON.parse(event));
  try {
    for (const status of [400,403,429,500,502,503]) {
      globalThis.fetch = async () => Response.json({error:{message:'sensitive upstream diagnostic', details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'35048.2s'}]}},{status});
      const response = await worker.fetch(new Request('https://worker/api/generate-speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'private phrase'})}),{GEMINI_API_KEY:'test-only'});
      assert.equal(response.status,status);
      const body = await response.json();
      assert.ok(!JSON.stringify(body).includes('sensitive'));
      if(status===429) {
        assert.equal(body.code,'quota');
        assert.equal(body.retryAfterMs,35048200);
        assert.equal(response.headers.get('Retry-After'),'35049');
      }
    }
    assert.ok(events.every(e => !JSON.stringify(e).includes('private phrase')));
  } finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
});

test('worker rejects corrupt PCM instead of delivering an invalid WAV', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  globalThis.fetch = async () => Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:'AA=='}}]}}]});
  try {
    const response=await worker.fetch(new Request('https://worker/api/generate-speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'fixture'})}),{GEMINI_API_KEY:'test-only'});
    assert.equal(response.status,502);
    assert.equal((await response.json()).code,'format');
  } finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
});
