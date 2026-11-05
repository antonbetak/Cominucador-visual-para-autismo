import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpeechNotice } from '../src/SpeechNotice.js';
test('notice has one polite status and a quota-aware retry; disappears on success', () => {
  const html = renderToStaticMarkup(createElement(SpeechNotice, {error:{code:'quota',retryAt:Date.now()+10000}}));
  assert.equal((html.match(/role="status"/g)||[]).length, 1);
  assert.ok(html.includes('disabled=""'));
  assert.ok(html.includes('Reintentar'));
  assert.ok(html.includes('cuota de voz'));
  assert.equal(renderToStaticMarkup(createElement(SpeechNotice, {error:null})), '');
  const blocked = renderToStaticMarkup(createElement(SpeechNotice, {error:{code:'blocked'}}));
  assert.ok(!blocked.includes('disabled='));
});
