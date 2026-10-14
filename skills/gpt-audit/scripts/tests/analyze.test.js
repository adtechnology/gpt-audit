import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyze.js';
import { renderReport, renderComparison } from '../report.js';
import { decodeTcString, analyzeTcf } from '../tcf.js';

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
  const { markdown, json, html } = renderReport(snapshot, network, findings);
  assert.ok(markdown.includes('# GPT Audit Report: https://fixture.example.com/article'));
  assert.ok(markdown.includes('High Severity (3)'));
  assert.ok(markdown.includes('Medium Severity (1)'));
  assert.ok(markdown.includes('Low Severity (1)'));
  assert.ok(markdown.includes('AdX/OB (7777777)')); // Shows sourceAgnosticLineItemId for backfill slot

  // Test HTML report generation
  assert.ok(typeof html === 'string' && html.length > 500);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('class="hero"'));
  assert.ok(html.includes('fixture.example.com'));
  assert.ok(html.includes('gauge-svg')); // Health Score gauge
  assert.ok(html.includes('tab-slots'));
  assert.ok(html.includes('tab-findings'));

  // Test comparison generation
  const compMd = renderComparison([json]);
  assert.ok(compMd.includes('Multi-Host Comparison'));
  assert.ok(compMd.includes('fixture.example.com'));
});

test('analyze: R16 flags missing publisher mandatory parameters (PPID, custParams, pageTargeting)', async () => {
  const snapshot = {
    meta: { url: 'https://publisher.example.com' },
    gpt: {
      present: true,
      pageTargeting: { env: 'prod' } // Missing required 'section' and 'edition'
    },
    slots: [
      { elementId: 'slot_header', sizes: [[728, 90]], targeting: {} } // Missing 'pos'
    ]
  };

  const network = {
    requests: [
      {
        kind: 'display',
        isSra: false,
        ppid: false, // Missing PPID
        cust_params: { env: 'prod' } // Missing 'user_tier'
      }
    ]
  };

  const config = {
    publisher: 'Test Publisher Media',
    required: {
      ppid: true,
      custParams: ['user_tier'],
      pageTargeting: ['env', 'section'],
      slotTargeting: ['pos'],
      minSlots: 2,
      requiredElementIds: ['slot_header', 'slot_sidebar']
    }
  };

  const findings = await analyze(snapshot, network, { config });
  const r16Findings = findings.filter(f => f.id === 'R16');

  // Should flag:
  // 1. PPID missing (high)
  // 2. cust_params.user_tier missing (high)
  // 3. pageTargeting.section missing (high)
  // 4. slotTargeting.pos missing on slot_header (medium)
  // 5. required slot_sidebar missing (high)
  // 6. minSlots 2 expected, found 1 (medium)
  assert.ok(r16Findings.length >= 6, `Expected at least 6 R16 findings, got ${r16Findings.length}`);

  const ppidFinding = r16Findings.find(f => f.evidence.includes('ppid'));
  assert.ok(ppidFinding, 'Must report missing PPID');
  assert.equal(ppidFinding.severity, 'high');

  const custFinding = r16Findings.find(f => f.evidence.includes('user_tier'));
  assert.ok(custFinding, 'Must report missing user_tier');

  const pageFinding = r16Findings.find(f => f.evidence.includes('section'));
  assert.ok(pageFinding, 'Must report missing pageTargeting key section');

  const slotMissingFinding = r16Findings.find(f => f.slot === 'slot_sidebar');
  assert.ok(slotMissingFinding, 'Must report missing required slot_sidebar');

  // Verify report generation includes compliance table
  const { markdown, json } = renderReport(snapshot, network, findings, { config });
  assert.ok(markdown.includes('Publisher Mandatory Parameters (Compliance)'));
  assert.ok(markdown.includes('Test Publisher Media'));
  assert.ok(markdown.includes('NON-COMPLIANT ❌'));
  assert.ok(markdown.includes('PPID (Publisher Provided Identifier)'));
  assert.equal(json.compliance.passed, false);
  assert.ok(json.compliance.checks.some(c => c.name.includes('PPID') && !c.passed));

  // Verify multi-host comparison reflects compliance failure
  const compMd = renderComparison([json]);
  assert.ok(compMd.includes('❌'));
});

test('analyze: R16 passes when all publisher requirements are satisfied', async () => {
  const snapshot = {
    meta: { url: 'https://compliant.example.com' },
    gpt: {
      present: true,
      pageTargeting: { env: 'prod', section: 'news' }
    },
    slots: [
      { elementId: 'slot_top', sizes: [[728, 90]], targeting: { pos: 'top' }, iframe: { present: true, safeFrame: true }, render: { isEmpty: false } }
    ]
  };

  const network = {
    requests: [
      {
        kind: 'display',
        isSra: true,
        ppid: true, // Satisfied
        cust_params: { user_tier: 'premium', section: 'news' } // Satisfied
      }
    ]
  };

  const config = {
    publisher: 'Compliant Publisher Group',
    required: {
      ppid: true,
      custParams: ['user_tier'],
      pageTargeting: ['env', 'section'],
      slotTargeting: ['pos'],
      minSlots: 1,
      requiredElementIds: ['slot_top']
    }
  };

  const findings = await analyze(snapshot, network, { config });
  const r16Findings = findings.filter(f => f.id === 'R16');
  assert.equal(r16Findings.length, 0, 'Compliant setup must trigger 0 R16 findings');

  const { markdown, json } = renderReport(snapshot, network, findings, { config });
  assert.ok(markdown.includes('COMPLIANT ✅'));
  assert.equal(json.compliance.passed, true);
  assert.ok(json.compliance.checks.every(c => c.passed));

  const compMd = renderComparison([json]);
  assert.ok(compMd.includes('✅ Pass'));
});

test('analyze: R02 duplicate DOM id, R04 container width fit, and R13 PII / oversized URL', async () => {
  const snapshot = {
    meta: {
      url: 'https://broken.example.com',
      viewport: { w: 1280, h: 800, dpr: 1 }
    },
    gpt: {
      present: true,
      version: '202610090101',
      scriptTags: [{ src: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js', async: true, inHead: true }],
      pageTargeting: { email: 'test@example.com', section: 'home' }
    },
    slots: [
      // R02: duplicate DOM elements with same id (dom.count = 2)
      {
        elementId: 'div-gpt-ad-c',
        adUnitPath: '/6355419/Travel/Europe',
        sizes: [[300, 250]],
        response: { lineItemId: 101 },
        render: { isEmpty: false, size: [300, 250], lineItemId: 101 },
        dom: { exists: true, count: 2, boundingRect: { width: 300, height: 250 }, queryId: 'q1', reservedHeight: true },
        iframe: { present: true, w: 300, h: 250 }
      },
      // R04: 970x250 slot inside a 300px wide container on a 1280px viewport
      {
        elementId: 'div-gpt-ad-e',
        adUnitPath: '/6355419/Travel/Oversize',
        sizes: [[970, 250]],
        response: { lineItemId: 102 },
        render: { isEmpty: false, size: [970, 250], lineItemId: 102 },
        dom: { exists: true, count: 1, cssDisplay: 'block', boundingRect: { width: 300, height: 250 }, queryId: 'q2', reservedHeight: true },
        iframe: { present: true, w: 970, h: 250 }
      }
    ]
  };

  const network = {
    requests: [
      {
        kind: 'display',
        isSra: false,
        urlLength: 8500,
        correlator: '12345',
        adUnits: ['/6355419/Travel/Europe', '/6355419/Travel/Oversize'],
        cust_params: { email: 'test@example.com' }
      }
    ]
  };

  const findings = await analyze(snapshot, network);
  const r02 = findings.find(f => f.id === 'R02' && f.slot === 'div-gpt-ad-c');
  assert.ok(r02, 'R02 must flag slot with duplicate DOM elements (dom.count > 1)');
  assert.ok(r02.evidence.includes('2 elements'));

  const r04 = findings.find(f => f.id === 'R04' && f.slot === 'div-gpt-ad-e');
  assert.ok(r04, 'R04 must flag slot whose sizes exceed its DOM container width');
  assert.ok(r04.evidence.includes('300px'));

  const r13Pii = findings.find(f => f.id === 'R13' && f.evidence.includes('test@example.com'));
  assert.ok(r13Pii, 'R13 must flag raw email PII in targeting');

  const r13Url = findings.find(f => f.id === 'R13' && f.evidence.includes('8500'));
  assert.ok(r13Url, 'R13 must flag ad request URL exceeding 8000 chars');

  const { json } = renderReport(snapshot, network, findings);
  assert.equal(json.meta.sra, false, 'SRA must be false when isSra is false');
  const compMd = renderComparison([json]);
  assert.ok(compMd.includes('| off |'), 'Comparison table must report SRA off when SRA is not used');
});

test('tcf: decodes TCF v2 bitstream, evaluates purposes 1-10 true/false, and renders in report', () => {
  // Build a synthetic valid 32-byte TCF v2 core bitstream:
  // version=2 (bits 0..5), cmpId=300 (bits 78..89), cmpVersion=2 (bits 90..101),
  // consentLanguage="EN" (bits 108..119), vendorListVersion=120 (bits 120..131),
  // tcfPolicyVersion=4 (bits 132..137), isServiceSpecific=1 (bit 138),
  // specialFeatureOptins: SF1=true, SF2=false (bits 140..141),
  // purposeConsents: P1=true, P2=true, P3=false, P4=false, P7=true (bits 152..161),
  // purposeLegitimateInterests: P2=true, P7=true, P9=true, P10=true (bits 176..185),
  // publisherCC="ES" (bits 201..212)
  const buf = Buffer.alloc(36, 0);
  const setBits = (offset, len, val) => {
    for (let i = 0; i < len; i++) {
      const bit = (val >> (len - 1 - i)) & 1;
      const pos = offset + i;
      if (bit) buf[pos >> 3] |= (1 << (7 - (pos & 7)));
    }
  };
  setBits(0, 6, 2);     // version = 2
  setBits(78, 12, 300); // cmpId = 300
  setBits(90, 12, 2);   // cmpVersion = 2
  setBits(108, 6, 4);   // 'E'
  setBits(114, 6, 13);  // 'N'
  setBits(120, 12, 120); // vendorListVersion = 120
  setBits(132, 6, 4);   // tcfPolicyVersion = 4
  setBits(138, 1, 1);   // isServiceSpecific = true
  setBits(140, 1, 1);   // SF1 = true
  setBits(152, 1, 1);   // Purpose 1 consent = true
  setBits(153, 1, 1);   // Purpose 2 consent = true
  setBits(158, 1, 1);   // Purpose 7 consent = true
  setBits(177, 1, 1);   // Purpose 2 LI = true
  setBits(182, 1, 1);   // Purpose 7 LI = true
  setBits(184, 1, 1);   // Purpose 9 LI = true
  setBits(185, 1, 1);   // Purpose 10 LI = true
  setBits(201, 6, 4);   // 'E'
  setBits(207, 6, 18);  // 'S'
  // Vendor consent section at bit 213: range=1, numEntries=1, single vendor 755
  setBits(213, 16, 755); // maxVendorId = 755
  setBits(229, 1, 1);    // isRange = 1
  setBits(230, 12, 1);   // numEntries = 1
  setBits(242, 1, 0);    // single vendorId entry
  setBits(243, 16, 755); // vendor 755

  const tcString = buf.toString('base64url');
  const decoded = decodeTcString(tcString);
  assert.ok(decoded && decoded.valid, 'TC string should decode as valid TCF v2');
  assert.equal(decoded.version, 2);
  assert.equal(decoded.cmpId, 300);
  assert.equal(decoded.tcfPolicyVersion, 4);
  assert.equal(decoded.publisherCC, 'ES');
  assert.equal(decoded.purposeConsents[1], true);
  assert.equal(decoded.purposeConsents[2], true);
  assert.equal(decoded.purposeConsents[3], false);
  assert.equal(decoded.purposeConsents[4], false);
  assert.equal(decoded.purposeConsents[7], true);
  assert.equal(decoded.purposeLegitimateInterests[9], true);
  assert.equal(decoded.purposeLegitimateInterests[10], true);
  assert.equal(decoded.googleVendorConsent, true);

  const snapshot = {
    meta: { url: 'https://tcf.example.com' },
    gpt: { present: true, version: '202610090101' },
    slots: [],
    neighbours: {
      consent: {
        tcf: { present: true, gdprApplies: true, tcString, tcStringLength: tcString.length, eventStatus: 'tcloaded' }
      }
    }
  };
  const network = {
    requests: [{ kind: 'display', gdpr: '1', gdpr_consent: tcString.length, tcString, npa: '0' }]
  };

  const analysis = analyzeTcf(snapshot, network);
  assert.equal(analysis.status, 'healthy');
  assert.equal(analysis.tcString, tcString);
  assert.equal(analysis.gamEligibility.nonPersonalizedAds, true);
  assert.equal(analysis.gamEligibility.personalizedAds, false); // P3 & P4 are false

  const { markdown, json, html } = renderReport(snapshot, network, []);
  assert.equal(json.tcf.tcString, tcString);
  assert.equal(json.meta.consent.purposeConsents[1], true);
  assert.equal(json.meta.consent.purposeConsents[3], false);
  assert.ok(markdown.includes('### TCF v2 Consent & Purpose Analysis'));
  assert.ok(markdown.includes(tcString));
  assert.ok(markdown.includes('| **Purpose 1** |'));
  assert.ok(html.includes('TCF v2 Consent &amp; Purpose Analysis'));
  assert.ok(html.includes(tcString));
});


