// Tests for the iframe-aware collector output and the rules that use it (R07, R09, R10, R17, R18),
// plus the network-extract additions (mixed raw formats, truncated rows, prev_scp, fill headers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../analyze.js';
import { renderReport } from '../report.js';
import { extractNetworkData, parseAdRequestUrl, parseNetworkRaw } from '../network-extract.js';

const TC = 'C'.repeat(300);
const passbackUrl = (n, pvsid, corr) =>
  `https://securepubads.g.doubleclick.net/gampad/ads?pvsid=${pvsid}&correlator=${corr}&output=ldjh&gdfp_req=1&impl=fif&gdpr=1&gdpr_consent=${TC}` +
  `&iu_parts=113349434%2Cexample.de%2Cdesktop%2Chome%2Cmrec_btf&enc_prev_ius=%2F0%2F1%2F2%2F3%2F4&prev_iu_szs=300x250&ifi=1&dids=gam_mrec_btf_${n}` +
  `&prev_scp=branch%3Dmaster%26GDPR_APPLIES%3D0%26miSlot%3Dmrec_btf_${n}&ppid=387665227687797407987614775782680377617&frm=23`;

const slot = (id, frame, targeting = {}) => ({
  elementId: id, adUnitPath: '/113349434/example.de/desktop/home/mrec_btf', sizes: [[300, 250]], targeting,
  categoryExclusions: [], response: { advertiserId: 1, campaignId: 2, lineItemId: null, creativeId: null, isBackfill: true, yieldGroupIds: [414686] },
  render: { isEmpty: false, size: [300, 250], isBackfill: true, lineItemId: null, creativeId: null, advertiserId: 1, campaignId: 2, sourceAgnosticLineItemId: null, sourceAgnosticCreativeId: null, yieldGroupIds: [414686], companyIds: null },
  dom: { exists: true, boundingRect: { width: 300, height: 250 }, inViewportOnLoad: false, cssDisplay: 'block', reservedHeight: true, queryId: `q-${id}` },
  iframe: { present: true, w: 300, h: 250, safeFrame: false, name: 'google_ads_iframe_x' }, frame
});

const passbackSnapshot = () => ({
  meta: { url: 'https://www.example.de/', title: 'x', viewport: { w: 1200, h: 1000, dpr: 2 }, timestamp: '2026-10-14T11:41:56Z', collectorVersion: '0.2.0' },
  gpt: {
    present: true, version: '202610080101', apiReady: true, pubadsReady: true, cmdQueueLength: 0, initialLoadDisabled: false, config: {}, pageTargeting: {},
    scriptTags: [
      { src: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', async: true, defer: false, inHead: false, frame: null },
      { src: 'https://www.googletagservices.com/tag/js/gpt.js', async: true, defer: false, inHead: false, frame: '__adnxs_passback__a' },
      { src: 'https://www.googletagservices.com/tag/js/gpt.js', async: true, defer: false, inHead: false, frame: '__adnxs_passback__b' }
    ],
    legacyHost: true, mainFrameSlotCount: 0, gptInstances: 3
  },
  slots: [
    slot('gam_mrec_btf_2', '__adnxs_passback__a', { GDPR_APPLIES: ['0'], miSlot: ['mrec_btf_2'] }),
    slot('gam_mrec_btf_3', '__adnxs_passback__b', { GDPR_APPLIES: ['0'], miSlot: ['mrec_btf_3'] })
  ],
  frames: [
    { iframeId: '__adnxs_passback__a', iframeName: '', href: 'https://www.example.de/', depth: 2, version: '202610080101', pubadsReady: true, scriptTags: [{ src: 'https://www.googletagservices.com/tag/js/gpt.js', async: true, defer: false, inHead: false, frame: '__adnxs_passback__a' }], slotCount: 1 },
    { iframeId: '__adnxs_passback__b', iframeName: '', href: 'https://www.example.de/', depth: 2, version: '202610080101', pubadsReady: true, scriptTags: [{ src: 'https://www.googletagservices.com/tag/js/gpt.js', async: true, defer: false, inHead: false, frame: '__adnxs_passback__b' }], slotCount: 1 }
  ],
  neighbours: { prebid: { present: false }, consent: { tcf: { present: true, gdprApplies: true, tcStringLength: 300, purpose1: true, cmpId: 345 }, gpp: { present: false }, usp: { present: false } }, apstag: { present: false } },
  events: [], errors: []
});

const passbackNetwork = () => extractNetworkData([
  { url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', status: 200 },
  { url: 'https://www.googletagservices.com/tag/js/gpt.js', status: 200 },
  { url: 'https://www.googletagservices.com/tag/js/gpt.js', status: 200 },
  { url: passbackUrl(2, '2011238188444148', '75047783341258'), status: 200 },
  { url: passbackUrl(3, '5211481424656552', '4302550329908489'), status: 200 }
]);

test('R07 explains separate GPT instances when every correlator has its own pvsid', async () => {
  const findings = await analyze(passbackSnapshot(), passbackNetwork());
  const r07 = findings.filter(f => f.id === 'R07');
  assert.equal(r07.length, 1);
  assert.match(r07[0].evidence, /separate GPT instance/);
  assert.match(r07[0].evidence, /2 GPT instance\(s\) found in iframes/);
  assert.match(r07[0].fix, /refresh\(\[slot\]\)/);
});

test('R07 keeps the generic wording when the requests share one pvsid', async () => {
  const net = extractNetworkData([
    { url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu=/1/a&sz=300x250&correlator=1&pvsid=7', status: 200 },
    { url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu=/1/b&sz=300x250&correlator=2&pvsid=7', status: 200 }
  ]);
  const findings = await analyze({ gpt: { present: true }, slots: [], frames: [] }, net);
  const r07 = findings.filter(f => f.id === 'R07');
  assert.equal(r07.length, 1);
  assert.match(r07[0].fix, /repeated display\(\)/);
});

test('R09 flags a custom GDPR_APPLIES=0 key next to gdpr=1', async () => {
  const findings = await analyze(passbackSnapshot(), passbackNetwork());
  const r09 = findings.filter(f => f.id === 'R09');
  assert.equal(r09.length, 1);
  assert.equal(r09[0].severity, 'medium');
  assert.match(r09[0].evidence, /GDPR does not apply/);
  assert.match(r09[0].evidence, /GDPR_APPLIES/);
});

test('R10 reports legacy host and tag counts per frame; falls back to the network log', async () => {
  const findings = await analyze(passbackSnapshot(), passbackNetwork());
  const r10 = findings.filter(f => f.id === 'R10');
  assert.ok(r10.some(f => /legacy host/.test(f.evidence) && /inside 2 iframe/.test(f.evidence)));
  assert.ok(r10.some(f => /multiple \(3\) gpt.js script tags/.test(f.evidence) && /2 in iframes/.test(f.evidence)));

  // Collector saw one tag, network saw three loads: cross-origin GPT instances.
  const snap = { gpt: { present: true, scriptTags: [{ src: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', async: true }], legacyHost: false }, slots: [], frames: [] };
  const f2 = await analyze(snap, passbackNetwork());
  const net10 = f2.filter(f => f.id === 'R10');
  assert.ok(net10.some(f => /loaded 3 times in one page view/.test(f.evidence)));
  assert.ok(net10.some(f => /legacy host/.test(f.evidence) && /2 load\(s\) seen in the network log/.test(f.evidence)));
});

test('R17 fires when the main frame defines no slot and GAM is reached from iframes', async () => {
  const findings = await analyze(passbackSnapshot(), passbackNetwork());
  const r17 = findings.filter(f => f.id === 'R17');
  assert.equal(r17.length, 1);
  assert.equal(r17[0].severity, 'low');
  assert.match(r17[0].evidence, /defines 0 slots/);
  assert.match(r17[0].evidence, /2 GPT instance\(s\) in iframes define 2 slot\(s\)/);
});

test('R17 stays quiet when the main frame defines slots or GPT is absent', async () => {
  const snap = passbackSnapshot();
  snap.slots.push(slot('main_slot', null, { pos: ['1'] }));
  snap.gpt.mainFrameSlotCount = 1;
  assert.equal((await analyze(snap, passbackNetwork())).filter(f => f.id === 'R17').length, 0);
  assert.equal((await analyze({ gpt: { present: false }, slots: [], frames: [] }, { requests: [] })).filter(f => f.id === 'R17').length, 0);
});

test('R18 flags slots that share an ad unit path without a distinguishing position key', async () => {
  const snap = passbackSnapshot();
  snap.slots[0].targeting = { GDPR_APPLIES: ['0'] };
  snap.slots[1].targeting = { GDPR_APPLIES: ['0'] };
  const r18 = (await analyze(snap, passbackNetwork())).filter(f => f.id === 'R18');
  assert.equal(r18.length, 1);
  assert.match(r18[0].evidence, /2 slots share the ad unit path \/113349434\/example.de\/desktop\/home\/mrec_btf/);
});

test('R18 accepts shared paths when a position key tells the slots apart', async () => {
  // miSlot differs per slot in the default fixture
  assert.equal((await analyze(passbackSnapshot(), passbackNetwork())).filter(f => f.id === 'R18').length, 0);
  const snap = passbackSnapshot();
  snap.slots.forEach(s => { s.targeting = { pos: ['1'] }; }); // same value on both: not distinguishable
  assert.equal((await analyze(snap, passbackNetwork())).filter(f => f.id === 'R18').length, 1);
});

test('report shows GPT instances, frame column and per-frame slot counts', () => {
  const { markdown, json } = renderReport(passbackSnapshot(), passbackNetwork(), []);
  assert.equal(json.meta.gptInstances, 3);
  assert.equal(json.meta.mainFrameSlotCount, 0);
  assert.equal(json.meta.frameSlotCount, 2);
  assert.equal(json.frames.length, 2);
  assert.equal(json.frames[0].legacyHost, true);
  assert.equal(json.slots[0].frame, '__adnxs_passback__a');
  assert.match(markdown, /\*\*GPT Instances\*\*: 3 \(1 main frame \+ 2 same-origin iframes\)/);
  assert.match(markdown, /### GPT Instances in iframes/);
  assert.match(markdown, /\| Element ID \| Frame \| Ad Unit Path/);
});

test('parseAdRequestUrl: prev_scp segments, dids and impl', () => {
  const r = parseAdRequestUrl(passbackUrl(2, '1', '2'));
  assert.equal(r.prev_scp.length, 1);
  assert.equal(r.prev_scp[0].GDPR_APPLIES, '0');
  assert.equal(r.prev_scp[0].miSlot, 'mrec_btf_2');
  assert.equal(r.dids, 'gam_mrec_btf_2');
  assert.equal(r.impl, 'fif');
  const sra = parseAdRequestUrl('https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=1,a&enc_prev_ius=/0/1,/0/1&prev_scp=pos%3D1|pos%3D2&correlator=5');
  assert.deepEqual(sra.prev_scp, [{ pos: '1' }, { pos: '2' }]);
});

test('parseNetworkRaw: mixes blocks and list rows, skips truncated rows, keeps fill headers', () => {
  const raw = `
## Network requests
reqid=270 GET https://securepubads.g.doubleclick.net/tag/js/gpt.js [200]
reqid=306 GET https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/m202610080101/pubads_impl.js [200]
reqid=1534 GET https://securepubads.g.doubleclick.net/gampad/ads?pvsid=1&correlator=2&output=ldjh&gdfp_req=1&iu_parts=1%2Ca&enc_prev_ius=%2F0%2F1&prev_iu_szs=300x250&gdpr=1&gdpr_consent=AB... <truncated> [200]
reqid=1600 GET https://securepubads.g.doubleclick.net/gampad/ads?iu=/1/b&sz=300x250&correlator=9 [200]

## Request https://securepubads.g.doubleclick.net/gampad/ads?pvsid=1&correlator=2&output=ldjh&gdfp_req=1&iu_parts=1%2Ca&enc_prev_ius=%2F0%2F1&prev_iu_szs=300x250&gdpr=1&gdpr_consent=ABCDEF
Status: 200
### Request Headers
- referer:https://www.example.de/
### Response Headers
- content-type:text/plain; charset=UTF-8
- content-length:16737
- date:Wed, 14 Oct 2026 11:41:45 GMT
- google-creative-id:-1
- google-lineitem-id:-1
- google-mediationgroup-id:414686

## Request https://pubads.g.doubleclick.net/gampad/ads?iu=/22178233913/x/video&output=vast&correlator=74150148&gdpr=1&gdpr_consent=ABCDEF
Status: 200
### Response Headers
- google-creative-id:138439236977,138472605675
- google-lineitem-id:6343692186,6709315662
`;
  const items = parseNetworkRaw(raw);
  assert.equal(items.filter(i => i.source === 'block').length, 2);
  assert.equal(items.filter(i => i.source === 'list').length, 3); // gpt.js, pubads_impl, /1/b; the truncated row is dropped
  assert.ok(!items.some(i => i.url.includes('<truncated>') || i.url.endsWith('...')));

  const net = extractNetworkData(raw);
  assert.equal(net.libraries.length, 2);
  assert.equal(net.requests.length, 3);
  const sra = net.requests.find(r => r.correlator === '2');
  assert.equal(sra.isSra, true);
  assert.equal(sra.gdpr_consent, 6);
  assert.deepEqual(sra.fill.lineItemIds, ['-1']);
  assert.equal(sra.fill.mediationGroupId, '414686');
  assert.equal(sra.fill.contentLength, 16737);
  const video = net.requests.find(r => r.kind === 'video');
  assert.deepEqual(video.fill.lineItemIds, ['6343692186', '6709315662']);
  const plain = net.requests.find(r => r.correlator === '9');
  assert.equal(plain.fill, null);
});

test('collector declares frames, gptInstances and mainFrameSlotCount', () => {
  const src = readFileSync(new URL('../collect-gpt.js', import.meta.url), 'utf8');
  for (const token of ['frames', 'gptInstances', 'mainFrameSlotCount', 'collectSlots', 'win.frames', "collectorVersion: '0.2.0'"]) {
    assert.ok(src.includes(token), `collector must contain ${token}`);
  }
  assert.ok(!/\.display\(|refresh\(|destroySlots\(/.test(src.replace(/\/\/.*$/gm, '')), 'collector must stay read-only');
});
