import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWav } from '../src/services/wav.js';
import { wavFixture } from './wavFixture.mjs';
test('validates PCM format, RIFF size, data boundaries and sample alignment', () => {
  assert.equal(inspectWav(wavFixture()).rate, 24000);
  for (const mutate of [b => b[0]=0, b => b[4]=0, b => b[34]=8, b => b[40]=255]) {
    const bytes = wavFixture(); mutate(bytes);
    assert.throws(() => inspectWav(bytes), {code:'format'});
  }
  assert.throws(() => inspectWav(new Uint8Array(44)), {code:'format'});
});
