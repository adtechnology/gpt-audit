import test from 'node:test';
import assert from 'node:assert/strict';
import r04 from '../rules/r04-viewport-fit.js';
import r05 from '../rules/r05-container-size-mismatch.js';
import r06 from '../rules/r06-single-request-architecture.js';
import { getRequestSlotCount, getSingleRequestConfig, summarizeBatching } from '../batching.js';

const slot = (overrides = {}) => ({
  elementId: 'leaderboard',
  sizes: [[728, 90]],
  render: { isEmpty: false, size: [728, 90] },
  iframe: { present: true, w: 728, h: 90 },
  dom: { exists: true, cssDisplay: 'block', boundingRect: { width: 728, height: 90 } },
  ...overrides
});

test('R04: active viewport sizes override broad declared sizes', () => {
  const active = slot({ sizes: [[970, 250]], viewportSizes: [[300, 250]], dom: { exists: true, boundingRect: { width: 320, height: 250 } } });
  assert.deepEqual(r04({ meta: { viewport: { w: 320 } }, slots: [active] }), []);
  active.viewportSizes = [[970, 250]];
  const findings = r04({ meta: { viewport: { w: 320 } }, slots: [active] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /active viewport sizes/);
});

test('R04: an empty mapping suppresses a slot rather than making it oversized', () => {
  assert.deepEqual(r04({ meta: { viewport: { w: 320 } }, slots: [slot({ sizes: [[970, 250]], viewportSizes: [] })] }), []);
  const legacy = r04({ meta: { viewport: { w: 320 } }, slots: [slot({ sizes: [[970, 250]] })] });
  assert.equal(legacy.length, 1);
  assert.match(legacy[0].evidence, /declared sizes/);
});

test('R05: a direct parent reservation is enough when it matches the creative', () => {
  const reserved = slot({ dom: { exists: true, reservedHeight: false, boundingRect: { width: 728, height: 90 }, reservation: { height: 90, source: 'min-height', elementId: 'leaderboard-wrapper' } } });
  assert.deepEqual(r05({ slots: [reserved] }), []);
});

test('R05: a 90px parent reservation under a 250px creative is a risk, not measured CLS', () => {
  const reserved = slot({ render: { isEmpty: false, size: [728, 250] }, iframe: { present: true, w: 728, h: 250 }, dom: { exists: true, boundingRect: { width: 728, height: 250 }, reservation: { height: 90, source: 'min-height', elementId: 'leaderboard-wrapper' } } });
  const findings = r05({ slots: [reserved] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /#leaderboard-wrapper \(90px\).*160px.*250px/);
  assert.match(findings[0].evidence, /risk, not a measured CLS/);
  assert.doesNotMatch(findings[0].fix, /eliminate|caused|measured CLS/);
});

test('R05: larger wrappers and unknown legacy reservation do not cause false positives', () => {
  const larger = slot({ dom: { exists: true, boundingRect: { width: 970, height: 250 }, reservation: { height: 250, source: 'min-height', elementId: 'wrapper' } } });
  const legacy = slot({ dom: { exists: true, reservedHeight: false, boundingRect: { width: 728, height: 90 } } });
  const unknown = slot({ dom: { exists: true, reservedHeight: false, reservation: null, boundingRect: { width: 728, height: 90 } } });
  assert.deepEqual(r05({ slots: [larger, legacy, unknown] }), []);
});

test('R05: smaller measured boxes report overflow, with clipping only when its CSS proves it', () => {
  const overflow = slot({ dom: { exists: true, reservedHeight: true, boundingRect: { width: 728, height: 60 } } });
  const finding = r05({ slots: [overflow] })[0];
  assert.match(finding.evidence, /height 90px vs 60px/);
  assert.doesNotMatch(finding.evidence, /CSS overflow clips/);
  assert.match(finding.evidence, /no layout shift or CLS value was measured/);
  overflow.dom.cssOverflowY = 'hidden';
  const clipped = r05({ slots: [overflow] })[0];
  assert.match(clipped.evidence, /CSS overflow clips height/);
  assert.match(clipped.fix, /without cropping/);
});

test('R05: fluid, pixels, empty slots, and outer-frame reservations are not misclassified', () => {
  const dom = { exists: true, boundingRect: { width: 728, height: 90 }, reservation: { height: 0, source: 'inline-height', elementId: 'wrapper' } };
  assert.deepEqual(r05({ slots: [
    slot({ dom, render: { size: 'fluid' } }),
    slot({ dom, render: { size: [1, 1] } }),
    slot({ dom, render: { isEmpty: true } }),
    slot({ dom, frame: 'passback' })
  ] }), []);
});

test('batching: compressed one-slot requests differ from actual multi-slot requests', () => {
  const compressedOne = { kind: 'display', isSra: true, dids: 'leaderboard', enc_prev_ius: '0/1/2', adUnits: ['/123/home'], prev_iu_szs: '728x90|970x90|970x250' };
  assert.equal(getRequestSlotCount(compressedOne), 1);
  assert.equal(summarizeBatching({ requests: [compressedOne] }).observed, false);
  const batched = { kind: 'display', isSra: true, dids: 'leaderboard,square', enc_prev_ius: '0/1/2,0/1/3', adUnits: ['/123/home', '/123/home'], prev_iu_szs: '728x90,970x250|300x250' };
  assert.equal(getRequestSlotCount(batched), 2);
  assert.equal(summarizeBatching({ requests: [batched] }).observed, true);
  assert.deepEqual(r06({}, { requests: [batched] }), []);
});

test('batching: ambiguous size transport and conflicting identity evidence remain unknown', () => {
  assert.equal(getRequestSlotCount({ isSra: true, prev_iu_szs: '728x90|970x250' }), null);
  assert.equal(getRequestSlotCount({ dids: 'one', adUnits: ['/123/one', '/123/two'] }), null);
  assert.equal(summarizeBatching({ requests: [{ kind: 'display', isSra: true }] }).observed, null);
  assert.equal(getRequestSlotCount({ slotCount: 2, isBatched: true }), 2);
  assert.equal(getRequestSlotCount({ prev_scp: [{ pos: 'top' }, { pos: 'side' }] }), 2);
});

test('R06: repeat refresh requests do not inflate distinct-slot evidence', () => {
  const first = { kind: 'display', slotCount: 1, dids: 'one', adUnits: ['/123/shared'] };
  const refresh = { ...first };
  assert.deepEqual(r06({}, { requests: [first, refresh, refresh] }), []);
  const second = { ...first, dids: 'two' };
  const network = { requests: [first, refresh, second, { kind: 'video', slotCount: 2 }] };
  const summary = summarizeBatching(network);
  assert.equal(summary.displayRequestCount, 3);
  assert.equal(summary.uniqueSingleSlotCount, 2);
  assert.equal(summary.repeatedSingleSlotRequestCount, 1);
  const findings = r06({ gpt: { config: { singleRequest: true, lazyLoad: {} } } }, network);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'low');
  assert.match(findings[0].evidence, /batching was not observed/);
  assert.match(findings[0].evidence, /1 repeated request excluded/);
  assert.match(findings[0].evidence, /lazy loading is configured/);
  assert.doesNotMatch(findings[0].evidence, /SRA.*disabled|SRA.*off/);
});

test('batching: configured SRA is tri-state and independent of transport and observed batching', () => {
  assert.equal(getSingleRequestConfig({ gpt: { config: { singleRequest: true } } }), true);
  assert.equal(getSingleRequestConfig({ gpt: { config: { singleRequest: false } } }), false);
  assert.equal(getSingleRequestConfig({ gpt: { pubadsConfig: { singleRequest: false } } }), false);
  assert.equal(getSingleRequestConfig({ gpt: { config: {} } }), null);
  const legacy = summarizeBatching({ requests: [{ iu: '/123/one', isSra: true }, { iu: '/123/two', isSra: true }] });
  assert.equal(legacy.observed, false);
  assert.equal(legacy.transportCompressedRequestCount, 2);
  assert.equal(r06({}, { requests: [{ iu: '/123/one' }, { iu: '/123/two' }] }).length, 1);
});
