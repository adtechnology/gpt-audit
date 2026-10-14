import test from 'node:test';
import assert from 'node:assert/strict';
import r01 from '../rules/r01-slot-never-displayed.js';
import r08 from '../rules/r08-initial-load-disabled-no-refresh.js';
import { renderReport } from '../report.js';

test('partial initial network/event coverage cannot establish absence of requests', () => {
  const snapshot = { meta: { capture: { initialEvents: 'partial' } }, gpt: { initialLoadDisabled: true }, slots: [{ elementId: 'header', adUnitPath: '/123/home', dom: { exists: true } }], events: [] };
  const network = { requests: [], capture: { method: 'resource-timing', initialCoverage: 'partial' } };
  assert.equal(r01(snapshot, network).length, 0);
  assert.equal(r08(snapshot, network).length, 0);
  snapshot.meta.capture.initialEvents = 'from-navigation';
  assert.equal(r01(snapshot, network).length, 1);
  assert.equal(r08(snapshot, network).length, 1);
});

test('network capture limits and unknown CMP evidence survive every report format', () => {
  const capture = { method: 'resource-timing', initialCoverage: 'partial', headersCaptured: false, bodiesCaptured: false, timeOrigin: 123 };
  const { json, markdown, html } = renderReport({}, { requests: [{ kind: 'display', gdpr: '1', gdpr_consent: 80 }], capture }, []);
  assert.deepEqual(json.meta.networkCapture, capture);
  assert.equal(json.tcf.apiPresent, null);
  assert.equal(json.tcf.status, 'incomplete');
  for (const rendered of [markdown, html]) {
    assert.match(rendered, /resource-timing/);
    assert.match(rendered, /headers: not captured/);
    assert.match(rendered, /bodies: not captured/);
  }
  assert.match(html, /__tcfapi: unknown/);
});
