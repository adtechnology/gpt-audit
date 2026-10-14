import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../collect-gpt.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const rect = (width = 728, height = 90, top = 20) => ({ x: 0, y: top, width, height, top, left: 0, right: width, bottom: top + height });

function element(id, { parent = null, css = {}, inline = {}, height = 'auto', bounds = rect(), children = [] } = {}) {
  return {
    id, tagName: 'DIV', parentElement: parent, className: '', children, style: inline,
    css: { display: 'block', minHeight: '0px', height: `${bounds.height}px`, aspectRatio: 'auto', overflowX: 'visible', overflowY: 'visible', ...css },
    getBoundingClientRect: () => bounds,
    computedStyleMap: () => new Map([['height', { toString: () => height }]]),
    getAttribute: () => null, querySelector: () => null
  };
}

async function collect({ el = element('ad-slot'), keys = [], values = {}, config, mapped = [[728, 90]], opts = {} } = {}) {
  const sizeCalls = [];
  const slot = {
    getSlotElementId: () => 'ad-slot', getAdUnitPath: () => '/1/home',
    getSizes: (...args) => { sizeCalls.push(args); return args.length ? mapped : [[970, 250], [728, 90]]; },
    getTargetingKeys: () => keys, getTargeting: key => values[key] || [],
    getResponseInformation: () => null, getCategoryExclusions: () => []
  };
  const pubads = { getSlots: () => [slot], getTargetingKeys: () => keys, getTargeting: slot.getTargeting };
  const calls = [];
  const googletag = { apiReady: true, pubadsReady: true, getVersion: () => '202610080101', pubads: () => pubads, cmd: [] };
  if (config !== undefined) googletag.getConfig = key => { calls.push(key); return config[key] || {}; };
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 1800, frames: [], googletag, getComputedStyle: node => node.css };
  const document = {
    title: 'fixture', defaultView: window,
    querySelectorAll: selector => selector.startsWith('[id=') ? (el ? [el] : []) : [],
    getElementById: () => el
  };
  const context = vm.createContext({ window, document, location: { href: 'https://example.test/' }, navigator: { userAgent: 'test' }, CSS: { escape: x => x }, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  return { snapshot: plain(await context.collectGpt(opts)), sizeCalls, calls };
}

test('parent min-height reserves 90 pixels without treating post-render auto height as reservation', async () => {
  const parent = element('ad-wrapper', { css: { minHeight: '90px' } });
  const el = element('ad-slot', { parent, bounds: rect(728, 250), css: { height: '250px' } });
  const { snapshot } = await collect({ el });
  assert.deepEqual(snapshot.slots[0].dom.reservation, { height: 90, source: 'min-height', elementId: 'ad-wrapper' });
  assert.equal(snapshot.slots[0].dom.reservedHeight, true);
  const auto = await collect({ el: element('ad-slot', { bounds: rect(728, 250) }) });
  assert.equal(auto.snapshot.slots[0].dom.reservation, null);
});

test('fixed stylesheet height and aspect ratio carry their source and measured reservation', async () => {
  const fixed = await collect({ el: element('ad-slot', { height: '90px', css: { height: '90px' } }) });
  assert.deepEqual(fixed.snapshot.slots[0].dom.reservation, { height: 90, source: 'stylesheet-height', elementId: 'ad-slot' });
  const ratio = await collect({ el: element('ad-slot', { bounds: rect(728, 250), css: { aspectRatio: '728 / 90' } }) });
  assert.deepEqual(ratio.snapshot.slots[0].dom.reservation, { height: 90, source: 'aspect-ratio', elementId: 'ad-slot' });
  const inline = await collect({ el: element('ad-slot', { inline: { height: '90px' }, height: '90px', css: { height: '90px' } }) });
  assert.equal(inline.snapshot.slots[0].dom.reservation.source, 'inline-height');
});

test('body min-height and unresolved percentage height do not imply ad reservation', async () => {
  const body = element('body', { css: { minHeight: '1000px' } });
  body.tagName = 'BODY';
  const { snapshot } = await collect({ el: element('ad-slot', { parent: body, css: { minHeight: '100%' }, inline: { height: '100%' } }) });
  assert.equal(snapshot.slots[0].dom.reservation, null);
});

test('intrinsic content height and stylesheet auto overriding inline height are not fixed reservation', async () => {
  const intrinsic = await collect({ el: element('ad-slot', { height: 'min-content', bounds: rect(728, 250) }) });
  assert.equal(intrinsic.snapshot.slots[0].dom.reservation, null);
  const override = await collect({ el: element('ad-slot', { inline: { height: '90px' }, height: 'auto', bounds: rect(728, 250) }) });
  assert.equal(override.snapshot.slots[0].dom.reservation, null);
});

test('viewportSizes applies current document viewport and capture visibility does not claim initial visibility', async () => {
  const { snapshot, sizeCalls } = await collect({ mapped: [[728, 90]], el: element('ad-slot', { bounds: rect(728, 90, -1500) }) });
  assert.deepEqual(sizeCalls, [[], [800, 600]]);
  assert.deepEqual(snapshot.slots[0].sizes, [[970, 250], [728, 90]]);
  assert.deepEqual(snapshot.slots[0].viewportSizes, [[728, 90]]);
  assert.equal(snapshot.slots[0].dom.inViewportAtCapture, false);
  assert.equal(snapshot.slots[0].dom.inViewportOnLoad, false);
  assert.deepEqual(snapshot.meta.capture, { initialEvents: 'partial', consentAction: 'unknown', scrollPosition: { x: 0, y: 1800 } });
});

test('HB and position targeting beyond the first 20 keys is captured before bounded ordinary keys', async () => {
  const keys = Array.from({ length: 150 }, (_, i) => `ordinary_${i}`);
  keys.push('hb_pb', 'miSlot', 'placementId');
  const values = { hb_pb: ['1.20'], miSlot: ['top'], placementId: ['leaderboard'] };
  const { snapshot } = await collect({ keys, values });
  const s = snapshot.slots[0];
  assert.deepEqual(s.targeting.hb_pb, ['1.20']);
  assert.deepEqual(s.targeting.miSlot, ['top']);
  assert.deepEqual(s.targeting.placementId, ['leaderboard']);
  assert.equal(s.targetingKeyCount, 153);
  assert.equal(s.targetingCapturedKeyCount, 128);
  assert.equal(s.targetingTruncated, true);
  assert.equal(snapshot.neighbours.prebid.hbKeysOnSlots, true);
  assert.equal(snapshot.gpt.targetingTruncated, true);
});

test('values exceeding the capture bound are explicitly marked truncated', async () => {
  const { snapshot } = await collect({ keys: ['pos'], values: { pos: ['x'.repeat(220)] } });
  assert.equal(snapshot.slots[0].targeting.pos[0].length, 200);
  assert.equal(snapshot.slots[0].targetingTruncated, true);
});

test('getConfig requests supported keys explicitly, preserves false, and falls back to legacy targeting', async () => {
  const { snapshot, calls } = await collect({ config: { disableInitialLoad: { disableInitialLoad: false } }, keys: ['pos'], values: { pos: ['top'] } });
  assert.deepEqual(calls, ['disableInitialLoad', 'targeting']);
  assert.deepEqual(snapshot.gpt.config, { disableInitialLoad: false });
  assert.equal(snapshot.gpt.initialLoadDisabled, false);
  assert.deepEqual(snapshot.gpt.pageTargeting, { pos: ['top'] });
  assert.equal((await collect()).snapshot.gpt.initialLoadDisabled, null);
});

test('unavailable Typed OM does not substitute computed auto height; failed DOM reads stay guarded', async () => {
  const el = element('ad-slot', { bounds: rect(728, 250) });
  delete el.computedStyleMap;
  assert.equal((await collect({ el })).snapshot.slots[0].dom.reservation, null);
  el.getBoundingClientRect = () => { throw new Error('detached'); };
  const { snapshot } = await collect({ el });
  assert.ok(snapshot.errors.some(e => e.field === 'slot.dom' && e.message === 'detached'));
  assert.equal(snapshot.slots[0].dom.inViewportAtCapture, null);
});

test('collector remains a self-contained bounded read-only function', () => {
  assert.ok(source.length < 12_000);
  assert.ok(!/^\s*import\s/m.test(source));
  assert.ok(!/\.display\(|\.refresh\(|\.destroySlots\(/.test(source.replace(/\/\/.*$/gm, '')));
});

test('navigation listener marker is set only after GPT listener registration succeeds', () => {
  const init = readFileSync(new URL('../init-listeners.js', import.meta.url), 'utf8');
  const listeners = [];
  const window = { __gptAuditFromNavigation: true, googletag: { cmd: [], pubads: () => ({ addEventListener: (...args) => listeners.push(args) }) } };
  vm.runInNewContext(init, { window });
  assert.notEqual(window.__gptAudit.listenersFromNavigation, true);
  window.googletag.cmd[0]();
  assert.equal(window.__gptAudit.listenersFromNavigation, true);
  assert.equal(listeners.length, 6);
  const failure = { googletag: { cmd: [], pubads: () => { throw new Error('unavailable'); } } };
  vm.runInNewContext(init, { window: failure });
  failure.googletag.cmd[0]();
  assert.notEqual(failure.__gptAudit.listenersFromNavigation, true);
  const late = { googletag: { cmd: [], pubads: () => ({ addEventListener() {} }) } };
  vm.runInNewContext(init, { window: late });
  late.googletag.cmd[0]();
  assert.equal(late.__gptAudit.listenersFromNavigation, false, 'post-navigation registration stays partial');
});
