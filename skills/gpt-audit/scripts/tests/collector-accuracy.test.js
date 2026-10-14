import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const collector = readFileSync(new URL('../collect-gpt.js', import.meta.url), 'utf8');
const init = readFileSync(new URL('../init-listeners.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const rect = (top = 100, width = 300, height = 250) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: width, width, height });
function element(id, options = {}) {
  return {
    id, style: {}, hidden: false, parentElement: null, box: rect(),
    css: { display: 'block', visibility: 'visible', contentVisibility: 'visible', minHeight: '0px', height: '250px', aspectRatio: 'auto', overflowX: 'visible', overflowY: 'visible' },
    getBoundingClientRect() { return this.box; },
    getAttribute() { return null; }, querySelector() { return null; },
    ...options,
  };
}
function browser({ elements = [element('ad')], resources = [], deferred = false, slotConfig = { targeting: {}, categoryExclusion: [] } } = {}) {
  const listeners = {}, configCalls = [], legacyCalls = [];
  const slots = elements.map(el => ({
    getSlotElementId: () => el.id, getAdUnitPath: () => '/123/' + el.id, getSizes: () => [[300, 250]],
    getResponseInformation: () => null,
    getConfig(keys) {
      configCalls.push(['slot', plain(keys)]);
      assert.deepEqual(plain(keys), ['targeting', 'categoryExclusion']);
      return slotConfig;
    },
    getTargetingKeys() { legacyCalls.push('slot.getTargetingKeys'); throw new Error('legacy call'); },
    getCategoryExclusions() { legacyCalls.push('slot.getCategoryExclusions'); throw new Error('legacy call'); },
  }));
  const pa = {
    getSlots: () => slots,
    getTargetingKeys() { legacyCalls.push('page.getTargetingKeys'); throw new Error('legacy call'); },
    getConfig() { legacyCalls.push('pubads.getConfig'); throw new Error('unsupported getConfig'); },
    isInitialLoadDisabled() { legacyCalls.push('isInitialLoadDisabled'); throw new Error('legacy call'); },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  };
  let interactions = 0;
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    getComputedStyle: el => el.css,
    googletag: {
      apiReady: true, pubadsReady: true, getVersion: () => 'test', pubads: () => pa,
      getConfig(keys) {
        configCalls.push(['page', plain(keys)]);
        assert.deepEqual(plain(keys), ['adsenseAttributes', 'disableInitialLoad', 'targeting']);
        return { disableInitialLoad: false, targeting: { section: ['news'] } };
      },
      cmd: deferred ? [] : { push: fn => fn() },
      display() { interactions++; }, destroySlots() { interactions++; },
    },
  };
  pa.refresh = () => { interactions++; };
  const document = { title: 'test', head: {}, querySelectorAll: () => [], getElementById: id => elements.find(el => el.id === id) || null };
  const context = vm.createContext({ window, document, location: { href: 'https://example.test/' }, navigator: { userAgent: 'test' }, performance: { getEntriesByType: () => resources }, URL, setTimeout, clearTimeout });
  vm.runInContext(collector, context);
  return { window, document, context, slots, elements, listeners, configCalls, legacyCalls, pa, collect: async opts => plain(await vm.runInContext(`collectGpt(${JSON.stringify(opts || {})})`, context)), interactions: () => interactions };
}

test('collector stays importless, self-contained and below 10 KiB', () => {
  assert.ok(Buffer.byteLength(collector) < 10 * 1024);
  assert.doesNotMatch(collector, /\bimport\s/);
  assert.match(collector, /async function collectGpt\(/);
});

test('collector reads only supported explicit config keys without legacy calls or ad interactions', async () => {
  const b = browser({ slotConfig: {} });
  const snapshot = await b.collect();
  assert.deepEqual(b.configCalls, [['page', ['adsenseAttributes', 'disableInitialLoad', 'targeting']], ['slot', ['targeting', 'categoryExclusion']]]);
  assert.deepEqual(snapshot.gpt.pageTargeting, { section: ['news'] });
  assert.deepEqual(snapshot.slots[0].targeting, {});
  assert.deepEqual(b.legacyCalls, []);
  assert.deepEqual(snapshot.errors, []);
  assert.equal(b.interactions(), 0);
});

test('initial viewport evidence survives scroll and resize; later slots have unknown initial state', async () => {
  const b = browser();
  const initial = await b.collect({ probe: true });
  b.elements[0].box = rect(-900);
  b.window.innerHeight = 400;
  const extra = element('lazy', { box: rect(80) });
  b.elements.push(extra);
  b.slots.push({ ...b.slots[0], getSlotElementId: () => 'lazy' });
  const final = await b.collect();
  assert.equal(initial.slots[0].dom.inViewportOnLoad, true);
  assert.equal(final.slots[0].dom.inViewportOnLoad, true);
  assert.equal(final.slots[0].dom.inViewportNow, false);
  assert.equal(final.slots[0].dom.initialStateKnown, true);
  assert.deepEqual(final.meta.initialViewport, initial.meta.viewport);
  assert.equal(final.meta.initialTimestamp, initial.meta.initialTimestamp);
  assert.equal(final.slots[1].dom.inViewportOnLoad, null);
  assert.equal(final.slots[1].dom.initialStateKnown, false);
  assert.equal(final.slots[1].dom.inViewportNow, true);
});

test('collector distinguishes ancestor reservation and hidden state from creative-expanded height', async () => {
  const parent = element('wrapper', { css: { display: 'none', visibility: 'visible', minHeight: '280px', aspectRatio: 'auto', overflowX: 'hidden', overflowY: 'hidden' }, box: rect(0, 320, 280) });
  const ad = element('ad', { parentElement: parent });
  const b = browser({ elements: [ad] });
  const { dom } = (await b.collect()).slots[0];
  assert.equal(dom.hidden, true);
  assert.equal(dom.hiddenBy.elementId, 'wrapper');
  assert.equal(dom.hiddenBy.display, 'none');
  assert.equal(dom.reservedHeight, true);
  assert.equal(dom.reservation.own, false);
  assert.equal(dom.reservation.ancestor, true);
  assert.deepEqual(dom.reservation.evidence, [{ elementId: 'wrapper', source: 'ancestor', minHeight: 280, height: 0, aspectRatio: null }]);
  assert.equal(dom.clippingAncestor.height, 280);
  assert.equal(dom.overflowY, 'visible');
  ad.parentElement = null;
  const standalone = (await b.collect()).slots[0].dom;
  assert.equal(standalone.reservedHeight, false, 'computed creative height is not reservation evidence');
  ad.style.height = '250px';
  ad.css.visibility = 'hidden';
  const fixed = (await b.collect()).slots[0].dom;
  assert.equal(fixed.reservation.own, true);
  assert.equal(fixed.reservation.evidence[0].height, 250);
  assert.equal(fixed.hiddenBy.elementId, 'ad');
});

test('passive Resource Timing includes only GPT/GAM endpoints with provenance and caps', async () => {
  const urls = [
    'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
    'https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m20261013/pubads_impl.js',
    'https://pubads.g.doubleclick.net/gampad/ads?iu=%2F123%2Fad',
    'https://www.googletagservices.com/tag/js/gpt.js',
    'https://securepubads.g.doubleclick.net.evil.test/gampad/ads',
    'https://analytics.example.test/gampad/ads',
    'https://securepubads.g.doubleclick.net/other.js?url=/gampad/ads',
  ];
  const resources = urls.map((name, i) => ({ name, startTime: i * 100, duration: i, responseStatus: 200 }));
  const b = browser({ resources });
  const snapshot = await b.collect();
  assert.deepEqual(snapshot.networkTimings.map(x => x.name), urls.slice(0, 4));
  assert.equal(snapshot.networkTimings[0].duration, 0);
  assert.equal(snapshot.networkTimings[0].source, 'resource-timing');
  assert.equal(snapshot.networkTimings[0].responseStatus, undefined, 'timing cannot prove HTTP success');
  resources.push(...Array.from({ length: 220 }, () => resources[0]));
  assert.equal((await b.collect()).networkTimings.length, 200);
});

test('late probe attaches once, records coverage and caps recorded events', async () => {
  const b = browser();
  const start = await b.collect({ probe: true });
  assert.equal(start.probe.source, 'late-probe');
  assert.equal(start.probe.listenersAttached, true);
  assert.ok(start.probe.attachedAt);
  const handler = b.listeners.slotRequested[0];
  for (let i = 0; i < 205; i++) handler({ slot: b.slots[0] });
  const final = await b.collect({ probe: true });
  assert.equal(b.listeners.slotRequested.length, 1);
  assert.equal(final.events.length, 200);
  assert.equal(final.probe.eventsDropped, 5);
  assert.equal(final.probe.eventLimit, 200);
  assert.equal(b.interactions(), 0);
});

test('navigation probe reports actual attachment only after command queue runs', async () => {
  const b = browser({ deferred: true });
  vm.runInContext(init, b.context);
  assert.equal(b.window.__gptAudit.listenersAttached, false);
  assert.equal(b.window.__gptAudit.listenersPending, true);
  const queued = await b.collect({ probe: true });
  assert.equal(queued.probe.source, 'navigation');
  assert.equal(queued.probe.listenersAttached, false);
  assert.equal(queued.probe.attachedAt, null);
  assert.equal(b.window.googletag.cmd.length, 1, 'collector does not queue duplicate listeners');
  b.window.googletag.cmd.shift()();
  const active = await b.collect({ probe: true });
  assert.equal(active.probe.source, 'navigation');
  assert.equal(active.probe.listenersAttached, true);
  assert.ok(active.probe.attachedAt);
  for (let i = 0; i < 201; i++) b.listeners.slotRenderEnded[0]({ slot: b.slots[0], isEmpty: false, size: [300, 250] });
  const final = await b.collect();
  assert.equal(final.events.length, 200);
  assert.equal(final.probe.eventsDropped, 1);
});

test('failed listener attachment remains false and broken page fields never reject collection', async () => {
  const b = browser({ deferred: true });
  vm.runInContext(init, b.context);
  b.window.googletag.pubads = () => { throw new Error('not ready'); };
  b.window.googletag.cmd.shift()();
  assert.equal(b.window.__gptAudit.listenersAttached, false);
  assert.equal(b.window.__gptAudit.listenersPending, false);
  b.document.querySelectorAll = () => { throw new Error('DOM unavailable'); };
  const result = await b.collect({ probe: true });
  assert.ok(result.errors.some(e => e.field === 'scripts'));
  assert.equal(result.probe.listenersAttached, false);
});


test('navigation helper does not claim GPT is present on a page without the library', async () => {
  const b = browser();
  delete b.window.googletag;
  vm.runInContext(init, b.context);
  const result = await b.collect({ probe: true });
  assert.equal(result.gpt.present, false);
  assert.equal(result.gpt.apiReady, false);
  assert.equal(result.probe.listenersAttached, false);
  assert.equal(result.probe.source, 'navigation');
  assert.equal(b.window.googletag.cmd.length, 1);
});

test('unknown consent length and initial load settings stay null, measured zero stays zero', async () => {
  const b = browser();
  b.window.googletag.getConfig = () => ({});
  delete b.pa.isInitialLoadDisabled;
  b.window.__tcfapi = (_command, _version, callback) => callback(null, false);
  const unknown = await b.collect();
  assert.equal(unknown.gpt.initialLoadDisabled, null);
  assert.equal(unknown.neighbours.consent.tcf.tcStringLength, null);
  assert.equal(unknown.neighbours.consent.tcf.purpose1, null);
  delete b.window.__tcfapi;
  assert.equal((await b.collect()).neighbours.consent.tcf.tcStringLength, null);
  b.window.__tcfapi = (_command, _version, callback) => callback({ tcString: '', gdprApplies: true, purpose: { consents: { 1: false } } }, true);
  const measured = await b.collect();
  assert.equal(measured.neighbours.consent.tcf.tcStringLength, 0);
  assert.equal(measured.neighbours.consent.tcf.purpose1, false);
});
