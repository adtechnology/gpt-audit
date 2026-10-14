import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderComparison } from '../report.js';
import { extractNetworkData } from '../network-extract.js';

const snapshot = overrides => ({
  meta: { url: 'https://evidence.example.com/', timestamp: '2026-10-14T12:00:00Z' },
  gpt: { present: true, version: '202610080101' },
  slots: [],
  ...overrides
});

function comparisonRow(report) {
  const lines = renderComparison([report]).split('\n');
  const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
  const headers = cells(lines.find(line => line.startsWith('| Host')));
  const values = cells(lines.find(line => line.startsWith('| **')));
  return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
}

test('reports retain missing privacy parameters and HTTP status as absent/unknown evidence', () => {
  const { json, markdown, html } = renderReport(snapshot(), { requests: [{ kind: 'display', adUnits: ['/1/header'] }] });
  assert.equal(json.requests[0].status, null);
  assert.equal(json.meta.consent.gdpr, null);
  assert.equal(json.meta.consent.npa, null);
  assert.equal(json.meta.consent.npaParamPresent, false);
  assert.equal(json.meta.consent.npaState, 'absent');
  assert.deepEqual(json.requests[0].parameterPresence, { gdpr: false, gdpr_consent: false, npa: false, ltd: false, rdp: false });
  assert.match(markdown, /NPA parameter: `absent`/);
  assert.match(markdown, /npa:absent, ltd:absent, rdp:absent/);
  assert.match(markdown, /\| unknown \| - \| absent \| absent \|/);
  assert.match(html, /npa:absent, ltd:absent, rdp:absent/);
  assert.match(html, />unknown<\/span>/);
  assert.equal(comparisonRow(json)['Consent (GDPR/TC/NPA parameter)'], 'absent/no/absent');

  const empty = renderReport(snapshot(), { requests: [] });
  assert.equal(empty.json.meta.consent.gdpr, null);
  assert.equal(empty.json.meta.consent.npa, null);
  assert.equal(empty.json.meta.consent.npaParamPresent, null);
  assert.equal(empty.json.meta.consent.tcStringPresent, null);
  assert.equal(comparisonRow(empty.json)['Consent (GDPR/TC/NPA parameter)'], 'unknown/unknown/unknown');
});

test('explicit privacy zero, one and empty parameters retain their distinct meaning', () => {
  for (const [value, expected] of [['0', false], ['1', true], ['', null]]) {
    const { json, markdown, html } = renderReport(snapshot(), { requests: [{ npa: value, ltd: '0', status: 0, raw: { npa: value, ltd: '0' } }] });
    assert.equal(json.meta.consent.npa, expected);
    assert.equal(json.meta.consent.npaParamPresent, true);
    assert.equal(json.meta.consent.npaState, value || 'empty');
    assert.equal(json.requests[0].npa, value);
    assert.equal(json.requests[0].status, 0);
    assert.match(markdown, new RegExp(`npa:${value || 'empty'}, ltd:0, rdp:absent`));
    assert.match(html, new RegExp(`npa:${value || 'empty'}, ltd:0, rdp:absent`));
  }
  const mixed = renderReport(snapshot(), { requests: [{ npa: '0' }, { npa: '1' }] });
  assert.equal(mixed.json.meta.consent.npa, null);
  assert.equal(mixed.json.meta.consent.npaState, 'mixed');
  assert.match(mixed.markdown, /NPA parameter: `mixed`/);
});

test('GDPR false is reported only from captured API or request evidence', () => {
  const { json, markdown } = renderReport(snapshot({ neighbours: { consent: { tcf: { gdprApplies: false } } } }), { requests: [] });
  assert.equal(json.meta.consent.gdpr, '0');
  assert.equal(json.meta.consent.gdprSource, '__tcfapi');
  assert.equal(json.meta.consent.gdprParamPresent, null);
  assert.match(markdown, /GDPR: `0`/);
  assert.equal(renderReport(snapshot({ neighbours: { consent: { tcf: {} } } }), {}).json.meta.consent.gdpr, null);
});

test('compressed one-slot transport does not imply configured SRA or multi-slot batching', () => {
  const network = extractNetworkData([{
    url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=1,news,header&enc_prev_ius=/0/1/2&dids=header&prev_iu_szs=728x90%7C970x250',
    startTime: 35
  }]);
  const { json, markdown, html } = renderReport(snapshot(), network);
  assert.equal(json.meta.sra, null);
  assert.equal(json.meta.batching.observed, false);
  assert.equal(json.meta.batching.transportCompressedRequestCount, 1);
  assert.equal(json.requests[0].isSra, true);
  assert.equal(json.requests[0].isBatched, false);
  assert.equal(json.requests[0].slotCount, 1);
  for (const key of ['iu_parts', 'enc_prev_ius', 'dids', 'prev_iu_szs', 'startTime']) {
    assert.equal(json.requests[0][key], network.requests[0][key]);
  }
  assert.match(markdown, /Configured SRA: `unknown` \| Observed multi-slot batching: `no`/);
  assert.match(html, /Configured SRA: unknown/);
  assert.match(html, /Observed multi-slot batching: no/);
  const row = comparisonRow(json);
  assert.equal(row['Configured SRA'], 'unknown');
  assert.equal(row['Observed Batching'], 'no');
  assert.equal(row['Compressed Requests'], '1');
});

test('multi-slot batching and explicit SRA configuration stay independent across report formats', () => {
  const network = extractNetworkData([{
    url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=1,news,header,footer&enc_prev_ius=/0/1/2,/0/1/3&dids=header,footer&prev_iu_szs=728x90,300x250'
  }]);
  const observed = renderReport(snapshot(), network);
  assert.equal(observed.json.meta.batching.observed, true);
  assert.equal(observed.json.meta.sra, null);
  assert.equal(observed.json.requests[0].slotCount, 2);
  assert.equal(observed.json.requests[0].isBatched, true);
  assert.equal(comparisonRow(observed.json)['Observed Batching'], 'yes');
  assert.match(observed.html, /Observed multi-slot batching: yes/);

  const configured = renderReport(snapshot({ gpt: { present: true, config: { singleRequest: true } } }), { requests: [] });
  assert.equal(configured.json.meta.sra, true);
  assert.equal(configured.json.meta.batching.observed, null);
  assert.equal(comparisonRow(configured.json)['Configured SRA'], 'on');
  assert.match(configured.html, /Configured SRA: on/);
  assert.match(configured.html, /Observed multi-slot batching: unknown/);

  const off = renderReport(snapshot({ gpt: { present: true, config: { singleRequest: false } } }), network);
  assert.equal(off.json.meta.sra, false);
  assert.equal(off.json.meta.batching.observed, true);
  assert.equal(comparisonRow(off.json)['Configured SRA'], 'off');
});

test('reports label declared sizes and use latest viewport evidence including explicit unknown', () => {
  const { json, markdown, html } = renderReport(snapshot({
    meta: { url: 'https://evidence.example.com', viewport: { w: 390, h: 844 }, capture: { initialEvents: 'partial', consentAction: 'accepted', scrollPosition: { x: 0, y: 4200 } } },
    slots: [
      { elementId: 'below', sizes: [[970, 250], [300, 250]], viewportSizes: [[300, 250]], render: null, dom: { inViewportOnLoad: true, inViewportAtCapture: false } },
      { elementId: 'frame-unknown', frame: 'passback', render: {}, dom: { inViewportOnLoad: false, inViewportAtCapture: null } },
      { elementId: 'standard', render: { isEmpty: false, isBackfill: false } }
    ]
  }), { requests: [] });
  assert.equal(json.slots[0].inViewportAtCapture, false);
  assert.equal(json.slots[1].inViewportAtCapture, null);
  assert.equal(json.slots[0].fillStatus, 'unknown');
  assert.equal(json.slots[1].fillType, 'Unknown');
  assert.equal(json.slots[2].fillType, 'Standard Line Item');
  assert.deepEqual(json.slots[0].viewportSizes, [[300, 250]]);
  assert.match(markdown, /Declared Sizes/);
  assert.match(markdown, /In Viewport at Capture/);
  assert.doesNotMatch(markdown, /Requested Sizes/);
  assert.match(html, /0 in viewport at capture/);
  assert.match(html, /0 unfilled &bull; 2 unknown/);
  assert.doesNotMatch(html, /Direct \/ Standard|in viewport on load/);
  assert.match(markdown, /partial; earlier events may be missing/);
  assert.match(html, /Consent action: accepted/);
  assert.match(html, /Viewport at capture: 390×844; scroll position 0, 4200/);
  assert.equal(comparisonRow(json)['Unfilled / Unknown Slots'], '0 / 2');
});

test('Prebid version survives JSON comparison, including legacy metadata reports', () => {
  const report = renderReport(snapshot({ neighbours: { prebid: { present: true, version: '10.22.0' } } }), { requests: [] });
  assert.equal(report.json.prebid.version, '10.22.0');
  assert.equal(report.json.meta.prebidVersion, '10.22.0');
  assert.equal(comparisonRow(report.json).Prebid, '`10.22.0`');
  assert.equal(comparisonRow({ meta: { url: 'https://legacy.example', prebidVersion: '9.0.0' } }).Prebid, '`9.0.0`');
});

test('reports withhold numeric health scores and show incomplete TCF evidence as unknown', () => {
  const { markdown, html, json } = renderReport(snapshot({ neighbours: { consent: { tcf: { present: true, gdprApplies: true, tcStringLength: 80 } } } }), { requests: [] });
  assert.equal(json.tcf.status, 'incomplete');
  assert.match(markdown, /➖ Incomplete/);
  assert.match(markdown, /TC String Present & Valid \| ➖ Unknown/);
  assert.match(html, /TCF Incomplete/);
  assert.match(html, /TC String Present &amp; Valid<\/td><td>Unknown/);
  assert.match(html, /Score withheld/);
  assert.doesNotMatch(html, /<span>\/100<\/span>|Excellent Health|compliant and healthy/);
  assert.match(markdown, /one captured page session/);
  assert.match(html, /Consent action: unknown/);
});
