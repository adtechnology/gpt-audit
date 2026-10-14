import test from 'node:test';
import assert from 'node:assert/strict';
import r09 from '../rules/r09-consent-mismatch.js';
import { analyzeTcf } from '../tcf.js';

test('absent NPA and LTD do not prove a Purpose 1 violation', () => {
  const snapshot = { neighbours: { consent: { tcf: { present: true, gdprApplies: true, tcStringLength: 100, purpose1: false } } } };
  const network = { requests: [{ kind: 'display', gdpr: '1', gdpr_consent: 100, npa: null, ltd: null }] };
  assert.equal(r09(snapshot, network).length, 0);
  const analysis = analyzeTcf(snapshot, network);
  assert.equal(analysis.status, 'incomplete');
  assert.equal(analysis.checks.find(c => c.name.includes('Purpose 1')).passed, null);
  assert.equal(analysis.checks.find(c => c.name.includes('TC String')).passed, null, 'length alone cannot validate a TC string');
  network.requests[0].npa = '1';
  assert.equal(analyzeTcf(snapshot, network).checks.find(c => c.name.includes('Purpose 1')).passed, null, 'NPA does not replace storage consent');
  network.requests[0].ltd = '1';
  assert.equal(analyzeTcf(snapshot, network).checks.find(c => c.name.includes('Purpose 1')).passed, true);
});

test('unknown CMP coverage is not treated as an explicitly missing API', () => {
  const network = { requests: [{ gdpr: '1', gdpr_consent: 100 }] };
  assert.equal(r09({}, network).length, 0);
  const tcf = analyzeTcf({}, network);
  assert.equal(tcf.apiPresent, null);
  assert.equal(tcf.status, 'incomplete');
  assert.equal(tcf.checks.find(c => c.name === '__tcfapi Present').passed, null);
  const findings = r09({ neighbours: { consent: { tcf: { present: false } } } }, network);
  assert.equal(findings.length, 1);
});

test('final CMP UI status cannot prove historic request timing', () => {
  const snapshot = { neighbours: { consent: { tcf: { present: true, gdprApplies: true, eventStatus: 'cmpuishown' } } } };
  const findings = r09(snapshot, { requests: [{ gdpr: '1', gdpr_consent: 100 }] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'medium');
  assert.match(findings[0].evidence, /ordering.*not established/);
});
