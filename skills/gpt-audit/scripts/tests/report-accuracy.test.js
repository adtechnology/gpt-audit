import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderComparison } from '../report.js';

const snapshot = { meta: { url: 'https://publisher.example/' }, gpt: { present: true }, slots: [] };

test('missing evidence remains unknown across JSON, markdown, HTML and comparisons', () => {
  const result = renderReport(snapshot, { requests: [{ kind: 'display' }] });
  assert.equal(result.json.requests[0].status, null);
  assert.equal(result.json.requests[0].duration, null);
  assert.equal(result.json.requests[0].ppid, null);
  assert.equal(result.json.requests[0].gdpr_consent_length, null);
  assert.equal(result.json.meta.consent.gdpr, null);
  assert.equal(result.json.meta.consent.npa, null);
  assert.equal(result.json.meta.consent.tcStringPresent, null);
  assert.equal(result.json.features.sra, 'unknown');
  assert.match(result.markdown, /SRA: unknown/);
  assert.match(result.html, /SRA: unknown/);
  assert.doesNotMatch(result.html, /Setup is compliant and healthy/);
  assert.match(renderComparison([result.json]), /unknown/);
});

test('individual display calls do not become SRA in comparison and retain failed status', () => {
  const result = renderReport(snapshot, { requests: [{ kind: 'display', isSra: false, status: 'net::ERR_FAILED', duration: 0 }] });
  assert.equal(result.json.features.sra, 'not observed');
  assert.equal(result.json.requests[0].status, 'net::ERR_FAILED');
  assert.equal(result.json.requests[0].duration, 0);
  assert.match(result.html, /net::ERR_FAILED/);
  assert.match(result.html, /0 ms/);
  assert.match(renderComparison([result.json]), /not observed/);
});

test('SRA, initial load and Prebid survive report JSON round trip', () => {
  const result = renderReport({ ...snapshot, gpt: { present: true, initialLoadDisabled: true }, neighbours: { prebid: { present: true, version: 'test-version' } } },
    { requests: [{ kind: 'display', isSra: true, ppid: true, gdpr: '1', gdpr_consent: 42, npa: null, slotElementIds: ['top', 'side'] }] });
  assert.equal(result.json.features.sra, 'observed');
  assert.equal(result.json.features.initialLoadDisabled, true);
  assert.equal(result.json.requests[0].isSra, true);
  assert.deepEqual(result.json.requests[0].slotElementIds, ['top', 'side']);
  assert.equal(result.json.requests[0].ppid, true);
  assert.equal(result.json.meta.consent.npa, null);
  const comparison = renderComparison([JSON.parse(JSON.stringify(result.json))]);
  assert.match(comparison, /observed/);
  assert.match(comparison, /test-version/);
});

test('validation observations are labelled and do not penalize the HTML rule score', () => {
  const result = renderReport(snapshot, { requests: [] }, [{ id: 'R07', severity: 'low', status: 'needs-validation', evidence: 'Two correlators', fix: 'Inspect refresh' }]);
  assert.equal(result.json.summary.needsValidation, 1);
  assert.match(result.markdown, /Status\*\*: needs-validation/);
  assert.match(result.html, /needs-validation/);
  assert.match(result.html, /gauge-number">100<span/);
  assert.ok(result.json.limitations.length > 0);
});

test('render size source and unknown initial visibility stay explicit', () => {
  const result = renderReport({ ...snapshot, slots: [{ elementId: 'lazy', iframe: { present: true, w: 300, h: 250 }, dom: { inViewportOnLoad: null } }] }, { requests: [] });
  assert.equal(result.json.slots[0].inViewportOnLoad, null);
  assert.equal(result.json.slots[0].renderedSizeSource, 'iframe element');
  assert.match(result.markdown, /iframe element dimensions/);
});

test('unobserved fill stays unknown and targeting keys cannot inject report markup', () => {
  const key = '<img src=x onerror=alert(1)>';
  const result = renderReport({ ...snapshot, slots: [{ elementId: 'conditional', targeting: { [key]: ['x'] }, dom: { hidden: true } }] }, { requests: [] });
  assert.match(result.html, /Unknown \/ not observed/);
  assert.doesNotMatch(result.html, /<img src=x onerror=/);
  assert.match(result.html, /&lt;img src=x onerror=/);
});

test('incomplete requests keep an unknown kind consistently across formats', () => {
  const result = renderReport(snapshot, { requests: [{ error: 'Full request URL required', urlTruncated: true }] });
  assert.equal(result.json.requests[0].kind, 'unknown');
  assert.match(result.markdown, /0 display, 0 video, 1 unknown/);
  assert.match(result.html, />unknown<\/span>/);
});
