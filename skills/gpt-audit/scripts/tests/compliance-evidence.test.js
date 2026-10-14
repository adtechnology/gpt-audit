import test from 'node:test';
import assert from 'node:assert/strict';
import r16, { evaluateCompliance } from '../rules/r16-publisher-mandatory-params.js';
import { renderReport, renderComparison } from '../report.js';

const snapshot = (gpt = {}) => ({
  meta: { url: 'https://partial.example.com', capture: { initialEvents: 'partial', consentAction: 'accepted' } },
  gpt: { present: true, ...gpt },
  slots: []
});
const partialNetwork = requests => ({ capture: { method: 'performance-resource-fallback', initialCoverage: 'partial' }, requests });
const requestRequirements = { publisher: 'Evidence Publisher', required: { ppid: true, custParams: ['section'] } };

test('partial empty network capture leaves mandatory request parameters unverified without absence findings', () => {
  const snap = snapshot();
  const network = partialNetwork([]);
  const compliance = evaluateCompliance(snap, network, requestRequirements);
  assert.equal(compliance.passed, null);
  assert.equal(compliance.status, 'incomplete');
  assert.equal(compliance.checks.length, 2);
  assert.ok(compliance.checks.every(check => check.passed === null));
  assert.deepEqual(compliance.findings, []);
  assert.deepEqual(r16(snap, network, { config: requestRequirements }), []);

  const { json, markdown, html } = renderReport(snap, network, [], { config: requestRequirements });
  assert.equal(json.compliance.passed, null);
  assert.deepEqual(json.meta.networkCapture, network.capture);
  assert.match(markdown, /Publisher Compliance.*INCOMPLETE/);
  assert.match(markdown, /PPID \(Publisher Provided Identifier\).*➖ Unknown/);
  assert.match(markdown, /cust_params: 'section'.*➖ Unknown/);
  assert.doesNotMatch(markdown, /NON-COMPLIANT|requirement\(s\) failed|❌ \*\*Failed\*\*/);
  assert.match(html, /Policy: Incomplete/);
  assert.match(html, />INCOMPLETE<\/span>/);
  assert.match(html, /➖ Unknown/);
  assert.doesNotMatch(html, /NON-COMPLIANT|❌ Failed/);
  assert.match(renderComparison([json]), /➖ Incomplete/);
});

test('a real captured omission fails mandatory request checks despite partial initial coverage', () => {
  const compliance = evaluateCompliance(snapshot(), partialNetwork([{ kind: 'display', ppid: false, cust_params: {} }]), requestRequirements);
  assert.equal(compliance.passed, false);
  assert.equal(compliance.status, 'non-compliant');
  assert.ok(compliance.checks.every(check => check.passed === false));
  assert.equal(compliance.findings.length, 2);
});

test('explicit publisher failures outrank unknown request checks and only real failures are counted', () => {
  const config = { required: { ...requestRequirements.required, pageTargeting: ['edition'] } };
  const snap = snapshot({ pageTargeting: {} });
  const network = partialNetwork([]);
  const compliance = evaluateCompliance(snap, network, config);
  assert.equal(compliance.passed, false);
  assert.deepEqual(compliance.checks.map(check => check.passed), [null, null, false]);
  assert.equal(compliance.findings.length, 1);
  const report = renderReport(snap, network, compliance.findings, { config });
  assert.match(report.markdown, /NON-COMPLIANT ❌ \(1 requirement\(s\) failed\)/);
  assert.match(report.html, /➖ Unknown/);
  assert.match(report.html, /❌ Failed/);
  assert.match(renderComparison([report.json]), /❌ 1 issue\(s\)/);
});

test('complete initial event coverage retains existing no-request compliance failure behavior', () => {
  const snap = snapshot();
  snap.meta.capture.initialEvents = 'from-navigation';
  const compliance = evaluateCompliance(snap, partialNetwork([]), requestRequirements);
  assert.equal(compliance.passed, false);
  assert.ok(compliance.checks.every(check => check.passed === false));
  assert.equal(compliance.findings.length, 2);
  assert.equal(evaluateCompliance(snapshot(), { requests: [] }, requestRequirements).passed, false);
});

test('compressed single-slot transport does not verify a mandatory configured SRA policy', () => {
  const network = partialNetwork([{ kind: 'display', isSra: true, isBatched: false, slotCount: 1, iu_parts: '1,header', enc_prev_ius: '/0/1' }]);
  const config = { required: { requireSra: true } };
  const compliance = evaluateCompliance(snapshot(), network, config);
  assert.equal(compliance.checks[0].passed, null);
  assert.equal(compliance.passed, null);
  assert.equal(compliance.status, 'incomplete');
  assert.deepEqual(compliance.findings, []);
  assert.match(compliance.checks[0].details, /does not verify configured SRA/);
  const report = renderReport(snapshot(), network, [], { config });
  assert.match(report.markdown, /Single Request Architecture \(SRA\).*➖ Unknown/);
  assert.match(report.html, /Policy: Incomplete/);
  assert.match(renderComparison([report.json]), /➖ Incomplete/);
});

test('explicit SRA configuration determines mandatory policy pass/fail with a current API fix', () => {
  const config = { required: { requireSra: true } };
  const network = partialNetwork([]);
  const pass = evaluateCompliance(snapshot({ config: { singleRequest: true } }), network, config);
  assert.equal(pass.passed, true);
  assert.equal(pass.status, 'compliant');
  assert.equal(pass.checks[0].passed, true);
  assert.deepEqual(pass.findings, []);
  const failed = evaluateCompliance(snapshot({ config: { singleRequest: false } }), network, config);
  assert.equal(failed.passed, false);
  assert.equal(failed.checks[0].passed, false);
  assert.equal(failed.findings.length, 1);
  assert.equal(failed.findings[0].severity, 'medium');
  assert.match(failed.findings[0].fix, /googletag\.setConfig\(\{ singleRequest: true \}\)/);
  assert.doesNotMatch(failed.findings[0].fix, /enableSingleRequest/);
});
