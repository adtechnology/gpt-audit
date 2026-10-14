import test from 'node:test';
import assert from 'node:assert/strict';
import r01 from '../rules/r01-slot-never-displayed.js';
import r05 from '../rules/r05-container-size-mismatch.js';
import r06 from '../rules/r06-single-request-architecture.js';
import r07 from '../rules/r07-mixed-correlators.js';
import r09 from '../rules/r09-consent-mismatch.js';

const unrequested = (elementId = 'ad', overrides = {}) => ({
  elementId,
  adUnitPath: '/6032,22328928714/site/home',
  response: null,
  dom: { exists: true, boundingRect: { width: 300, height: 250 }, queryId: null },
  ...overrides
});
const fixedSlot = (dom = {}, extra = {}) => ({
  elementId: 'ad', sizes: [[300, 250]],
  render: { isEmpty: false, size: [300, 250] },
  iframe: { present: true, w: 300, h: 250 },
  dom: { exists: true, boundingRect: { width: 300, height: 250 }, ...dom },
  ...extra
});
const display = (overrides = {}) => ({ kind: 'display', correlator: '123', ...overrides });

test('R01 uses tilde-separated element IDs without treating a shared path as proof for every slot', () => {
  const slots = [unrequested('ad'), unrequested('second'), unrequested('inactive', {
    dom: { exists: true, cssDisplay: 'none', boundingRect: { width: 0, height: 0 } }
  })];
  const findings = r01({ slots }, { requests: [display({
    adUnits: ['/6032:22328928714/site/home'], raw: { dids: 'ad~second' }
  })] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].slot, 'inactive');
  assert.equal(findings[0].severity, 'low');
  assert.equal(findings[0].status, 'needs-validation');
  assert.doesNotMatch(findings[0].fix, /call googletag\.display/);
});

test('R01 recognizes the MCM comma/colon path equivalent when request IDs are unavailable', () => {
  assert.deepEqual(r01({ slots: [unrequested()] }, { requests: [display({
    adUnits: ['/6032:22328928714/site/home']
  })] }), []);
  assert.equal(r01({ slots: [unrequested()] }, { requests: [display({
    adUnits: ['/6032:999/site/home']
  })] }).length, 1);
});

test('R01 prefers parser slotElementIds and treats incomplete request capture as uncertain', () => {
  assert.deepEqual(r01({ slots: [unrequested()] }, { requests: [display({
    slotElementIds: ['ad'], raw: { dids: 'other' }
  })] }), []);
  const findings = r01({ slots: [unrequested()] }, { requests: [display({
    slotElementIds: ['ad'], urlTruncated: true
  })] });
  assert.equal(findings[0].severity, 'low');
  assert.equal(findings[0].status, 'needs-validation');
  assert.match(findings[0].evidence, /incomplete request rows/);
});

test('R01 retains a finding for a visible unrequested slot and respects response, queryId and event evidence', () => {
  const finding = r01({ slots: [unrequested()] }, { requests: [] })[0];
  assert.equal(finding.severity, 'high');
  assert.match(finding.evidence, /no observed/);
  assert.doesNotMatch(finding.fix, /call googletag\.display/);
  for (const slot of [unrequested('ad', { response: {} }), unrequested('ad', { dom: { queryId: 'q' } })]) {
    assert.deepEqual(r01({ slots: [slot] }, {}), []);
  }
  assert.deepEqual(r01({ slots: [unrequested()], events: [{ name: 'slotRequested', slotElementId: 'ad' }] }, {}), []);
});

test('R01 treats ancestor-hidden or zero-size slots as needing validation and ignores video path matches', () => {
  for (const dom of [{ hidden: true }, { boundingRect: { width: 0, height: 0 } }]) {
    const finding = r01({ slots: [unrequested('ad', { dom })] }, {})[0];
    assert.equal(finding.severity, 'low');
    assert.equal(finding.status, 'needs-validation');
  }
  assert.equal(r01({ slots: [unrequested()] }, { requests: [{ kind: 'video', iu: '/6032,22328928714/site/home' }] }).length, 1);
});

test('R05 does not infer CLS or a geometry defect from absent own reservation or extra wrapper space', () => {
  const slots = [
    fixedSlot({ reservedHeight: false }),
    fixedSlot({ boundingRect: { width: 600, height: 266 }, reservedHeight: false }),
    fixedSlot({ reservedHeight: true, reservation: { own: false, ancestor: true } })
  ];
  assert.deepEqual(r05({ slots }), []);
});

test('R05 ignores hidden, fluid, native and tracking-pixel creatives', () => {
  const small = { boundingRect: { width: 100, height: 100 } };
  const slots = [
    fixedSlot({ ...small, hidden: true }),
    fixedSlot({ ...small, cssDisplay: 'none' }),
    fixedSlot(small, { render: { isEmpty: false, size: 'fluid' } }),
    fixedSlot(small, { render: { isEmpty: false, size: 'native' } }),
    fixedSlot(small, { render: null, sizes: ['fluid'] }),
    fixedSlot(small, { render: { isEmpty: false, size: [1, 1] } }),
    fixedSlot(small, { isNative: true }),
    fixedSlot(small, { render: { isEmpty: true, size: [300, 250] } })
  ];
  assert.deepEqual(r05({ slots }), []);
});

test('R05 finds a visible undersized fixed container without asserting an observed layout shift', () => {
  const findings = r05({ slots: [fixedSlot({ boundingRect: { width: 300, height: 100 } })] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'medium');
  assert.equal(findings[0].status, 'needs-validation');
  assert.match(findings[0].evidence, /exceeds its container/);
  assert.doesNotMatch(findings[0].evidence, /layout shift|CLS/);
  assert.doesNotMatch(findings[0].fix, /eliminate layout shift/);
});

test('R05 accepts sufficient ancestor reservation but still reports an ancestor that clips the creative', () => {
  const dom = {
    boundingRect: { width: 300, height: 100 },
    reservation: { own: false, ancestor: true, evidence: [{ source: 'ancestor', minHeight: '250px', height: 'auto' }] }
  };
  assert.deepEqual(r05({ slots: [fixedSlot(dom)] }), []);
  const findings = r05({ slots: [fixedSlot({ ...dom,
    clippingAncestor: { elementId: 'wrapper', width: 300, height: 150, overflowX: 'visible', overflowY: 'hidden' }
  })] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /clipping ancestor #wrapper/);
});

test('R05 catches width clipping and tolerates rounding differences', () => {
  assert.equal(r05({ slots: [fixedSlot({ boundingRect: { width: 200, height: 250 }, overflowX: 'hidden' })] }).length, 1);
  assert.deepEqual(r05({ slots: [fixedSlot({ boundingRect: { width: 299, height: 248 } })] }), []);
});

test('R06 is an optional batching optimization using the current setConfig API', () => {
  const findings = r06({}, { requests: [display({ iu: '/123/a' }), display({ iu: '/123/b' })] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'low');
  assert.equal(findings[0].status, 'optimization');
  assert.match(findings[0].fix, /googletag\.setConfig\(\{ singleRequest: true \}\)/);
  assert.doesNotMatch(findings[0].fix, /enableSingleRequest/);
  assert.doesNotMatch(findings[0].evidence, /failure|disabled/);
});

test('R06 avoids refresh-only, SRA-enabled and video-only suggestions', () => {
  const repeated = [display({ iu: '/123/a' }), display({ iu: '/123/a' })];
  assert.deepEqual(r06({}, { requests: repeated }), []);
  const requests = [display({ iu: '/123/a' }), display({ iu: '/123/b' })];
  assert.deepEqual(r06({ gpt: { config: { singleRequest: true } } }, { requests }), []);
  assert.deepEqual(r06({}, { requests: [...requests, display({ isSra: true })] }), []);
  assert.deepEqual(r06({}, { requests: requests.map(req => ({ ...req, kind: 'video' })) }), []);
});

test('R06 can distinguish slots sharing an ad unit using explicit IDs', () => {
  assert.equal(r06({}, { requests: [
    display({ iu: '/123/shared', raw: { dids: 'one' } }),
    display({ iu: '/123/shared', raw: { dids: 'two' } })
  ] }).length, 1);
});

test('R06 and R07 consume parsed element IDs and ignore incomplete requests', () => {
  const requests = [display({ correlator: '111', slotElementIds: ['one'] }),
    display({ correlator: '222', slotElementIds: ['two'] })];
  assert.equal(r06({}, { requests }).length, 1);
  assert.deepEqual(r07({}, { requests })[0].requestGroups[0].elementIds, ['one']);
  const incomplete = requests.map(req => ({ ...req, urlTruncated: true }));
  assert.deepEqual(r06({}, { requests: incomplete }), []);
  assert.deepEqual(r07({}, { requests: incomplete }), []);
});

test('R07 records correlator request groups as low validation evidence, allowing legitimate refresh', () => {
  const findings = r07({}, { requests: [
    display({ correlator: '111', raw: { dids: 'one~two' }, adUnits: ['/123/a'], startTime: 10 }),
    display({ correlator: '222', raw: { dids: 'one' }, adUnits: ['/123/a'], startTime: 70 })
  ] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'low');
  assert.equal(findings[0].status, 'needs-validation');
  assert.match(findings[0].evidence, /refresh normally creates/);
  assert.deepEqual(findings[0].requestGroups[0].elementIds, ['one', 'two']);
  assert.deepEqual(findings[0].requestGroups[1].startTimes, [70]);
});

test('R07 ignores video correlators and a single correlator', () => {
  assert.deepEqual(r07({}, { requests: [display(), display(), { kind: 'video', correlator: '999' }] }), []);
});

test('R09 reports missing TC under gdpr=1 only as a signaling review', () => {
  const findings = r09({}, { requests: [display({ gdpr: '1', gdpr_consent: 0 })] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'medium');
  assert.equal(findings[0].status, 'needs-validation');
  assert.match(findings[0].evidence, /signaling review/);
  assert.match(findings[0].fix, /automatic TCF-driven limited ads/);
});

test('R09 accepts explicit limited ads and does not infer required npa from Purpose 1 denial', () => {
  const snapshot = { neighbours: { consent: { tcf: { present: true, gdprApplies: true, purpose1: false } } } };
  assert.deepEqual(r09(snapshot, { requests: [display({ gdpr: '1', gdpr_consent: 0, ltd: '1' })] }), []);
  assert.deepEqual(r09(snapshot, { requests: [display({ gdpr: '1', gdpr_consent: 250 })] }), []);
});

test('R09 does not treat an absent local TCF global or unknown GDPR applicability as invalid', () => {
  const snapshot = { neighbours: { consent: { tcf: { present: false } } } };
  assert.deepEqual(r09(snapshot, { requests: [display({ gdpr: '1', gdpr_consent: 250 })] }), []);
  assert.deepEqual(r09(snapshot, { requests: [display({ gdpr: null, gdpr_consent: 0 })] }), []);
  assert.deepEqual(r09(snapshot, { requests: [{ kind: 'video', gdpr: '1', gdpr_consent: 0 }] }), []);
  assert.deepEqual(r09(snapshot, { requests: [display({ gdpr: '1', gdpr_consent: 0, urlTruncated: true })] }), []);
});
