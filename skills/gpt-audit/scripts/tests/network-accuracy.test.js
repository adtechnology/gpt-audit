import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAdRequestUrl, parseNetworkRaw, extractNetworkData } from '../network-extract.js';

const adUrl = 'https://securepubads.g.doubleclick.net/gampad/ads?iu=/1234/publisher.example/homepage';
const gptUrl = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';

test('request body and headers cannot supply status or timing metadata', () => {
  const raw = `## Request ${adUrl}
### Request Headers
duration: 42
startTime: 43
Status: 200
### Response Body
this.duration=0; var startTime=99;
duration: 0
Status: 200
### Timing
duration: 1
startTime: 2
`;
  assert.deepEqual(parseNetworkRaw(raw), [{ url: adUrl, status: null, startTime: null, duration: null }]);
});

test('explicit request metadata and labelled timing sections retain measured zero', () => {
  const raw = `## Request ${adUrl}
Status: [success - 204]
startTime: 0
### Timing
- duration: 18.5 ms
### Response Body
duration: 0
`;
  const [request] = parseNetworkRaw(raw);
  assert.equal(request.status, 204);
  assert.equal(request.startTime, 0);
  assert.equal(request.duration, 18.5);
});

test('list output distinguishes numeric, failed and unavailable statuses and keeps full URLs', () => {
  const longUrl = `${adUrl}&cust_params=section%3D${'example'.repeat(150)}`;
  const raw = `reqid=1 GET ${longUrl} [200]
reqid=2 GET ${gptUrl} [net::ERR_NAME_NOT_RESOLVED]
reqid=3 GET ${adUrl} [pending]
reqid=4 GET ${adUrl}
reqid=5 GET ${adUrl} [success - 204]`;
  const requests = parseNetworkRaw(raw);
  assert.equal(requests.length, 5);
  assert.equal(requests[0].url, longUrl);
  assert.deepEqual(requests.map(request => request.status), [200, 'net::ERR_NAME_NOT_RESOLVED', null, null, 204]);
  assert.equal(extractNetworkData(raw).libraries[0].status, 'net::ERR_NAME_NOT_RESOLVED');
});

test('failed detail requests keep transport failure and do not assume success', () => {
  const raw = `## Request ${adUrl}
Status: [failed - net::ERR_FAILED]
### Response Body
this.duration=0;
`;
  const [request] = extractNetworkData(raw).requests;
  assert.equal(request.status, 'failed - net::ERR_FAILED');
  assert.equal(request.duration, null);
});

test('full detail blocks take priority over incomplete listings without duplicate requests', () => {
  const raw = `reqid=1 GET ${adUrl.slice(0, -3)}... [200]
## Request ${adUrl}
Status: 200
`;
  const result = extractNetworkData(raw);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].url, adUrl);
  assert.deepEqual(result.requests[0].adUnits, ['/1234/publisher.example/homepage']);
});

test('truncated listing URLs remain explicit incomplete evidence without parsed query claims', () => {
  for (const ending of ['...', '…']) {
    const result = extractNetworkData(`reqid=1 GET ${adUrl}&gdpr=1${ending} [200]`);
    const [request] = result.requests;
    assert.equal(request.urlTruncated, true);
    assert.match(request.error, /truncated/);
    assert.equal(request.status, 200);
    assert.equal(request.gdpr, undefined);
    assert.equal(request.adUnits, undefined);
  }
});

test('SRA MCM network pairs reconstruct canonical slot paths and tilde-separated slot IDs', () => {
  const url = new URL(adUrl);
  url.search = new URLSearchParams({
    iu_parts: '1234:5678,publisher.example,homepage',
    enc_prev_ius: '/0/1/2,/0/1/2',
    dids: 'wallpaper_example~superbanner_example'
  }).toString();
  const parsed = parseAdRequestUrl(url.href);
  assert.deepEqual(parsed.adUnits, ['/1234,5678/publisher.example/homepage', '/1234,5678/publisher.example/homepage']);
  assert.deepEqual(parsed.slotElementIds, ['wallpaper_example', 'superbanner_example']);
  assert.equal(parsed.iu_parts, '1234:5678,publisher.example,homepage');
});

test('direct MCM paths and comma-separated slot IDs remain compatible', () => {
  const parsed = parseAdRequestUrl(`${adUrl.replace('/1234/', '/1234,5678/')}&dids=slot_a,slot_b`);
  assert.deepEqual(parsed.adUnits, ['/1234,5678/publisher.example/homepage']);
  assert.deepEqual(parsed.slotElementIds, ['slot_a', 'slot_b']);
});

test('malformed SRA index paths cannot become plausible partial ad unit paths', () => {
  const parsed = parseAdRequestUrl('https://securepubads.g.doubleclick.net/gampad/ads?iu_parts=1234,section&enc_prev_ius=/0/missing/1,/0/99,/0/1');
  assert.deepEqual(parsed.adUnits, ['/1234/section']);
});

test('exact Resource Timing matches enrich timing but never fabricate HTTP status', () => {
  const result = extractNetworkData([
    { url: adUrl, status: 'net::ERR_FAILED' },
    { url: gptUrl, startTime: 25, duration: 7 },
    { url: `${adUrl}&unmatched=1` }
  ], { networkTimings: [
    { name: adUrl, startTime: 100, duration: 0, responseStatus: 200 },
    { name: gptUrl, startTime: 5, duration: 1, responseStatus: 200 }
  ] });
  const [matched, unmatched] = result.requests;
  assert.equal(matched.startTime, 100);
  assert.equal(matched.duration, 0);
  assert.equal(matched.status, 'net::ERR_FAILED');
  assert.equal(matched.timingSource, 'resource-timing');
  assert.equal(unmatched.startTime, null);
  assert.equal(unmatched.duration, null);
  assert.equal(unmatched.status, null);
  assert.equal(result.libraries[0].startTime, 25);
  assert.equal(result.libraries[0].duration, 7);
});

test('Resource Timing refuses ambiguous repeated URL matches and invalid timing values', () => {
  const ambiguous = extractNetworkData([{ url: adUrl }], [
    { name: adUrl, startTime: 1, duration: 2 },
    { name: adUrl, startTime: 3, duration: 4 }
  ]);
  assert.equal(ambiguous.requests[0].startTime, null);
  assert.equal(ambiguous.requests[0].duration, null);
  const invalid = extractNetworkData([{ url: adUrl, time: 123, duration: -1 }], [
    { name: adUrl, startTime: '12', duration: Infinity }
  ]);
  assert.equal(invalid.requests[0].startTime, null);
  assert.equal(invalid.requests[0].duration, null);
  const repeated = extractNetworkData([{ url: adUrl }, { url: adUrl }], [
    { name: adUrl, startTime: 1, duration: 2 },
    { name: adUrl, startTime: 3, duration: 4 }
  ]);
  assert.deepEqual(repeated.requests.map(request => request.startTime), [1, 3]);
});

test('CLI --timings accepts the collector snapshot as a separate file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpt-audit-network-'));
  try {
    const rawFile = join(directory, 'network.txt');
    const timingsFile = join(directory, 'snapshot.json');
    const outputFile = join(directory, 'network.json');
    writeFileSync(rawFile, `reqid=1 GET ${adUrl} [200]`);
    writeFileSync(timingsFile, JSON.stringify({ networkTimings: [{ name: adUrl, startTime: 80, duration: 12 }] }));
    execFileSync(process.execPath, [fileURLToPath(new URL('../network-extract.js', import.meta.url)), rawFile, '--timings', timingsFile, '-o', outputFile]);
    const result = JSON.parse(readFileSync(outputFile, 'utf8'));
    assert.equal(result.requests[0].startTime, 80);
    assert.equal(result.requests[0].duration, 12);
    assert.equal(result.requests[0].timingSource, 'resource-timing');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
