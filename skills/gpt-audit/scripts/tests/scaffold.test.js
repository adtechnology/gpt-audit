// Placeholder test so `npm test` passes on the scaffold. Replace with real parser and rule tests in Phase 1/2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAdRequestUrl } from '../network-extract.js';

test('collector stays small and self-contained', () => {
  const src = readFileSync(new URL('../collect-gpt.js', import.meta.url), 'utf8');
  assert.ok(src.length < 10_000, 'collect-gpt.js must stay under 10 KB');
  assert.ok(!/^\s*import\s/m.test(src), 'collect-gpt.js must not use imports');
  assert.ok(src.includes('async function collectGpt'), 'collectGpt signature must stay');
});

test('parseAdRequestUrl returns host and raw params', () => {
  const r = parseAdRequestUrl('https://securepubads.g.doubleclick.net/gampad/ads?iu=/6355419/Travel&sz=300x250&correlator=123');
  assert.equal(r.host, 'securepubads.g.doubleclick.net');
  assert.equal(r.raw.correlator, '123');
});

test('init-listeners stays small and self-contained', () => {
  const src = readFileSync(new URL('../init-listeners.js', import.meta.url), 'utf8');
  assert.ok(src.length < 2_000, 'init-listeners.js must stay tiny');
  assert.ok(!/^\s*import\s/m.test(src), 'init-listeners.js must not use imports');
  assert.ok(src.includes('googletag.cmd'), 'init-listeners.js must hook googletag.cmd');
});

