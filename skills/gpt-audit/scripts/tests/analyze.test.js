import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyze.js';
import { renderReport, renderComparison } from '../report.js';

test('analyze: triggers R01, R05, R06, R07, and R09 on synthetic fixture', async () => {
  const snapshot = {
    meta: {
      url: 'https://fixture.example.com/article',
      title: 'Fixture Article',
      viewport: { w: 1200, h: 800, dpr: 1 },
      timestamp: '2026-10-14T12:00:00Z',
      collectorVersion: '0.1.0'
    },
    gpt: {
      present: true,
      version: '202610090101',
      apiReady: true,
      pubadsReady: true,
      scriptTags: [{ src: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', async: true, inHead: true }],
      legacyHost: false,
      cmdQueueLength: 0,
      initialLoadDisabled: false,
      pageTargeting: { env: 'test' }
    },
    slots: [
      // 1. Triggers R01: Defined but never requested, no queryId, no response
      {
        elementId: 'slot_ghost_unrequested',
        adUnitPath: '/1234/ghost',
        sizes: [[300, 250]],
        response: null,
        render: null,
        dom: { exists: true, boundingRect: { width: 300, height: 250 }, queryId: null, reservedHeight: true },
        iframe: { present: false, w: 0, h: 0 }
      },
      // 2. Triggers R05: Container height (100) differs from creative height (250) by 150px (> 2px)
      {
        elementId: 'slot_cls_mismatch',
        adUnitPath: '/1234/mismatch',
        sizes: [[300, 250]],
        response: { lineItemId: 9999, advertiserId: 8888 },
        render: { isEmpty: false, size: [300, 250], isBackfill: false, lineItemId: 9999 },
        dom: { exists: true, boundingRect: { width: 300, height: 100 }, queryId: 'qid_mismatch', reservedHeight: true },
        iframe: { present: true, w: 300, h: 250 }
      },
      // 3. Compliant slot: Filled backfill (AdX/OB) - lineItemId null, isBackfill true (Must NOT trigger R03)
      {
        elementId: 'slot_backfill_adx',
        adUnitPath: '/1234/adx',
        sizes: [[728, 90]],
        response: { lineItemId: null, advertiserId: 5555 },
        render: {
          isEmpty: false,
          size: [728, 90],
          isBackfill: true,
          lineItemId: null,
          creativeId: 12345,
          sourceAgnosticLineItemId: 7777777,
          yieldGroupIds: [101]
        },
        dom: { exists: true, boundingRect: { width: 728, height: 90 }, queryId: 'qid_adx', reservedHeight: true },
        iframe: { present: true, w: 728, h: 90, safeFrame: true }
      }
    ],
    neighbours: {
      consent: {
        tcf: { present: true, gdprApplies: true, tcStringLength: 0, purpose1: true }
      }
    },
    events: [
      { name: 'slotRequested', slotElementId: 'slot_cls_mismatch' },
      { name: 'slotRenderEnded', slotElementId: 'slot_cls_mismatch', isEmpty: false, size: [300, 250] },
      { name: 'slotRequested', slotElementId: 'slot_backfill_adx' },
      { name: 'slotRenderEnded', slotElementId: 'slot_backfill_adx', isEmpty: false, size: [728, 90], isBackfill: true }
    ]
  };

  const network = {
    requests: [
      // Request 1: Display, correlator 111111, SRA off (no iu_parts), gdpr=1 with empty gdpr_consent (Triggers R06, R07, R09)
      {
        kind: 'display',
        isSra: false,
        iu: '/1234/mismatch',
        adUnits: ['/1234/mismatch'],
        correlator: '111111',
        status: 200,
        gdpr: '1',
        gdpr_consent: 0, // Triggers R09
        npa: '0'
      },
      // Request 2: Display, correlator 222222 (different correlator, triggers R07; SRA off triggers R06)
      {
        kind: 'display',
        isSra: false,
        iu: '/1234/adx',
        adUnits: ['/1234/adx'],
        correlator: '222222', // Triggers R07
        status: 200,
        gdpr: '1',
        gdpr_consent: 0, // Triggers R09
        npa: '0'
      },
      // Request 3: Video request (Must be ignored for R06 and R07)
      {
        kind: 'video',
        isSra: false,
        iu: '/1234/video',
        adUnits: ['/1234/video'],
        correlator: '999999', // Independent video correlator
        status: 200
      }
    ]
  };

  const findings = await analyze(snapshot, network);
  const ruleIds = findings.map(f => f.id);

  // Assert R01 is triggered (ghost unrequested slot)
  assert.ok(ruleIds.includes('R01'), 'Expected R01 to be triggered');
  const fR01 = findings.find(f => f.id === 'R01');
  assert.equal(fR01.slot, 'slot_ghost_unrequested');
  assert.equal(fR01.severity, 'high');

  // Assert R05 is triggered (container height 100 != iframe height 250)
  assert.ok(ruleIds.includes('R05'), 'Expected R05 to be triggered');
  const fR05 = findings.find(f => f.id === 'R05');
  assert.equal(fR05.slot, 'slot_cls_mismatch');
  assert.equal(fR05.severity, 'medium');

  // Assert R06 is triggered (SRA off: 2 separate display requests without iu_parts)
  assert.ok(ruleIds.includes('R06'), 'Expected R06 to be triggered');
  const fR06 = findings.find(f => f.id === 'R06');
  assert.equal(fR06.severity, 'low');

  // Assert R07 is triggered (Mixed correlators across display requests: 111111 vs 222222)
  assert.ok(ruleIds.includes('R07'), 'Expected R07 to be triggered');
  const fR07 = findings.find(f => f.id === 'R07');
  assert.equal(fR07.severity, 'high');

  // Assert R09 is triggered (gdpr=1 with gdpr_consent = 0)
  assert.ok(ruleIds.includes('R09'), 'Expected R09 to be triggered');
  const fR09 = findings.find(f => f.id === 'R09');
  assert.equal(fR09.severity, 'high');

  // Assert R03 is NOT triggered on slot_backfill_adx (it has isBackfill: true, isEmpty: false)
  const fR03 = findings.find(f => f.id === 'R03' && f.slot === 'slot_backfill_adx');
  assert.equal(fR03, undefined, 'AdX / Open Bidding fill must not trigger R03');

  // Test report generation
  const { markdown, json } = renderReport(snapshot, network, findings);
  assert.ok(markdown.includes('# GPT Audit Report: https://fixture.example.com/article'));
  assert.ok(markdown.includes('High Severity (3)'));
  assert.ok(markdown.includes('Medium Severity (1)'));
  assert.ok(markdown.includes('Low Severity (1)'));
  assert.ok(markdown.includes('AdX/OB (7777777)')); // Shows sourceAgnosticLineItemId for backfill slot

  // Test comparison generation
  const compMd = renderComparison([json]);
  assert.ok(compMd.includes('Multi-Host Comparison'));
  assert.ok(compMd.includes('fixture.example.com'));
});
