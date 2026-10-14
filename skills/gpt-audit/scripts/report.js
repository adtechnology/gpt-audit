#!/usr/bin/env node
// report.js — Phase 2 (see docs/PLAN.md, "Phase 2 — analyzer and report").
//
// CLI: node report.js <snapshot.json> <network.json> <findings.json> [-c <config.json>] -o <out/<host>/>
//      → writes report.md, report.json, and report.html in the layout given in the plan.
// CLI: node report.js --compare out/*/report.json -o out/comparison.md
//      → one table, one row per host: GPT version · slots · ad requests · SRA · lazy load ·
//        initial load disabled · Prebid version · consent (gdpr, tcString present, npa) ·
//        unfilled slots · findings by severity · compliance status.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { evaluateCompliance } from './rules/r16-publisher-mandatory-params.js';
import { analyzeTcf } from './tcf.js';
import { renderHtmlReport } from './report-html.js';
import { getSingleRequestConfig, summarizeBatching } from './batching.js';

const booleanLabel = value => value === true ? 'on' : value === false ? 'off' : 'unknown';
const observedLabel = value => value === true ? 'yes' : value === false ? 'no' : 'unknown';
const complianceLabel = passed => passed === true ? 'COMPLIANT ✅' : passed === false ? 'NON-COMPLIANT ❌' : 'INCOMPLETE — unverified requirements';
const privacyKeys = ['gdpr', 'gdpr_consent', 'npa', 'ltd', 'rdp'];
const parameterPresent = (request, key) => {
  if (typeof request.parameterPresence?.[key] === 'boolean') return request.parameterPresence[key];
  if (request.raw && typeof request.raw === 'object') return Object.hasOwn(request.raw, key);
  return request[key] !== undefined && request[key] !== null;
};
const parameterValue = (request, key) => request[key] ?? request.raw?.[key] ?? null;
const privacyLabel = (value, present) => present === false ? 'absent' : value === null || value === undefined ? 'unknown' : value === '' ? 'empty' : String(value);

function summarizePrivacy(requests, key) {
  const presentRequests = requests.filter(r => parameterPresent(r, key));
  const values = [...new Set(presentRequests.map(r => parameterValue(r, key)).filter(v => v !== null).map(String))];
  const value = values.length === 1 ? values[0] : null;
  return {
    value,
    present: requests.length ? presentRequests.length > 0 : null,
    state: values.length > 1 ? 'mixed' : presentRequests.length ? privacyLabel(value, true) : requests.length ? 'absent' : 'unknown'
  };
}

function captureNotes(meta) {
  const capture = meta.capture || {};
  const initialEvents = ['partial', 'from-navigation'].includes(capture.initialEvents) ? capture.initialEvents : 'unknown';
  const consentAction = capture.consentAction || 'unknown';
  const notes = [
    'Scope: one captured page session; findings describe the observed state and requests.',
    `Initial event coverage: ${initialEvents === 'from-navigation' ? 'listeners attached from navigation' : initialEvents === 'partial' ? 'partial; earlier events may be missing' : 'unknown'}. Consent action: ${consentAction}.`
  ];
  if (meta.viewport?.w && meta.viewport?.h) {
    const scroll = capture.scrollPosition;
    notes.push(`Viewport at capture: ${meta.viewport.w}×${meta.viewport.h}${scroll ? `; scroll position ${scroll.x ?? 'unknown'}, ${scroll.y ?? 'unknown'}` : ''}.`);
  }
  return { capture: { ...capture, initialEvents, consentAction }, notes };
}

function slotFillStatus(slot) {
  if (slot.render?.isEmpty === true) return 'unfilled';
  if (slot.render?.isEmpty === false) return 'filled';
  return 'unknown';
}

function slotFillType(slot) {
  if (slotFillStatus(slot) === 'unfilled') return 'Unfilled';
  if (slot.render?.isBackfill === true) return slot.render?.lineItemId == null ? 'AdX / Open Bidding' : 'AdX / Backfill';
  if (slot.render?.isEmpty === false && slot.render?.isBackfill === false) return 'Standard Line Item';
  return 'Unknown';
}

export function renderReport(snapshot, network, findings = [], options = {}) {
  const meta = snapshot?.meta || {};
  const gpt = snapshot?.gpt || {};
  const slots = snapshot?.slots || [];
  const requests = network?.requests || [];
  const neighbours = snapshot?.neighbours || {};
  const frames = Array.isArray(snapshot?.frames) ? snapshot.frames : [];
  const mainSlotCount = typeof gpt.mainFrameSlotCount === 'number' ? gpt.mainFrameSlotCount : slots.filter(s => !s.frame).length;
  const frameSlotCount = slots.length - mainSlotCount;
  const gptInstances = typeof gpt.gptInstances === 'number' ? gpt.gptInstances : (gpt.present ? 1 : 0) + frames.length;

  let config = options?.config || null;
  if (!config && options?.configPath && existsSync(options.configPath)) {
    try {
      config = JSON.parse(readFileSync(options.configPath, 'utf8'));
    } catch (_) {}
  }
  if (!config && existsSync('gpt-audit.config.json')) {
    try {
      config = JSON.parse(readFileSync('gpt-audit.config.json', 'utf8'));
    } catch (_) {}
  }

  const compliance = evaluateCompliance(snapshot, network, config);
  const tcfAnalysis = analyzeTcf(snapshot, network);

  const highFindings = findings.filter(f => f.severity?.toLowerCase() === 'high');
  const medFindings = findings.filter(f => f.severity?.toLowerCase() === 'medium');
  const lowFindings = findings.filter(f => f.severity?.toLowerCase() === 'low');

  // Consent summary
  const gdprSignal = summarizePrivacy(requests, 'gdpr');
  const npaSignal = summarizePrivacy(requests, 'npa');
  const tcSignal = summarizePrivacy(requests, 'gdpr_consent');
  const gdprFromApi = typeof neighbours.consent?.tcf?.gdprApplies === 'boolean' ? (neighbours.consent.tcf.gdprApplies ? '1' : '0') : null;
  const gdprParam = gdprSignal.present === true ? gdprSignal.value : gdprFromApi;
  const tcStringKnown = requests.length > 0 || tcfAnalysis.apiPresent || neighbours.consent?.tcf?.tcStringLength !== undefined || Boolean(tcfAnalysis.tcString);
  const tcStringLen = tcStringKnown ? tcfAnalysis.tcStringLength : null;
  const coverage = captureNotes(meta);
  const networkCapture = network?.capture || null;
  if (networkCapture) {
    coverage.notes.push(`Network capture: ${networkCapture.method || 'unspecified'}; initial coverage: ${networkCapture.initialCoverage || 'unknown'}; headers: ${networkCapture.headersCaptured === true ? 'captured' : networkCapture.headersCaptured === false ? 'not captured' : 'unknown'}; bodies: ${networkCapture.bodiesCaptured === true ? 'captured' : networkCapture.bodiesCaptured === false ? 'not captured' : 'unknown'}.`);
  }

  const consentSummary = {
    gdpr: gdprParam,
    gdprParamPresent: gdprSignal.present,
    gdprState: gdprParam === null ? gdprSignal.state : gdprParam,
    gdprSource: gdprSignal.present === true ? 'network' : gdprFromApi !== null ? '__tcfapi' : 'none',
    tcStringPresent: tcStringLen === null ? null : tcStringLen > 0,
    tcStringLength: tcStringLen,
    tcStringParamPresent: tcSignal.present,
    tcString: tcfAnalysis.tcString || null,
    tcfStatus: tcfAnalysis.status,
    cmpId: tcfAnalysis.cmpId,
    npa: npaSignal.value === '1' ? true : npaSignal.value === '0' ? false : null,
    npaParamPresent: npaSignal.present,
    npaState: npaSignal.state,
    purposeConsents: Object.fromEntries(tcfAnalysis.purposes.map(p => [p.id, p.consent])),
    purposeLegitimateInterests: Object.fromEntries(tcfAnalysis.purposes.map(p => [p.id, p.legitimateInterest]))
  };

  const sraEnabled = getSingleRequestConfig(snapshot);
  const batching = summarizeBatching(network);
  const lazyLoadEnabled = gpt.config?.lazyLoad === undefined ? null : Boolean(gpt.config.lazyLoad);
  const initialLoadDisabled = typeof gpt.initialLoadDisabled === 'boolean' ? gpt.initialLoadDisabled : null;

  // Build JSON report
  const jsonReport = {
    meta: {
      url: meta.url || '',
      title: meta.title || '',
      timestamp: meta.timestamp || new Date().toISOString(),
      collectorVersion: meta.collectorVersion || '0.1.0',
      gptVersion: gpt.version || null,
      slotCount: slots.length,
      mainFrameSlotCount: mainSlotCount,
      frameSlotCount,
      gptInstances,
      requestCount: requests.length,
      sra: sraEnabled,
      batching,
      lazyLoad: lazyLoadEnabled,
      initialLoadDisabled,
      prebidVersion: neighbours.prebid?.version || null,
      viewport: meta.viewport || null,
      capture: coverage.capture,
      networkCapture,
      scopeNotes: coverage.notes,
      consent: consentSummary
    },
    tcf: tcfAnalysis,
    prebid: {
      present: Boolean(neighbours.prebid?.present),
      version: neighbours.prebid?.version || null,
      bidderTimeout: neighbours.prebid?.bidderTimeout ?? null,
      adUnitCount: neighbours.prebid?.adUnits?.length || 0,
      bidCount: neighbours.prebid?.bids?.length || 0,
      hbKeysOnSlots: Boolean(neighbours.prebid?.hbKeysOnSlots)
    },
    frames: frames.map(f => ({
      iframeId: f.iframeId || '',
      iframeName: f.iframeName || '',
      href: f.href || '',
      depth: f.depth ?? null,
      version: f.version || null,
      pubadsReady: f.pubadsReady ?? null,
      legacyHost: (f.scriptTags || []).some(t => (t.src || '').includes('googletagservices.com')),
      slotCount: f.slotCount ?? slots.filter(s => s.frame === f.iframeId).length
    })),
    summary: {
      high: highFindings.length,
      medium: medFindings.length,
      low: lowFindings.length,
      total: findings.length
    },
    compliance: compliance.active ? compliance : null,
    slots: slots.map(s => {
      const isBackfill = s.render?.isBackfill === true;
      const isEmpty = s.render?.isEmpty === true;
      let lineItemLabel = s.render?.lineItemId ?? s.response?.lineItemId ?? null;
      if (lineItemLabel === null && isBackfill) {
        lineItemLabel = s.render?.sourceAgnosticLineItemId
          ? `AdX/OB (${s.render.sourceAgnosticLineItemId})`
          : 'AdX / Open Bidding';
      } else if (lineItemLabel === null && isEmpty) {
        lineItemLabel = 'unfilled';
      }

      return {
        elementId: s.elementId || '',
        adUnitPath: s.adUnitPath || '',
        sizes: s.sizes || [],
        viewportSizes: s.viewportSizes || null,
        renderedSize: s.render?.size || (s.iframe?.w && s.iframe?.h ? [s.iframe.w, s.iframe.h] : null),
        lineItemId: lineItemLabel,
        creativeId: s.render?.creativeId ?? s.response?.creativeId ?? null,
        advertiserId: s.render?.advertiserId ?? s.response?.advertiserId ?? null,
        campaignId: s.render?.campaignId ?? s.response?.campaignId ?? null,
        safeFrame: s.iframe?.safeFrame ?? false,
        inViewportAtCapture: Object.hasOwn(s.dom || {}, 'inViewportAtCapture') ? s.dom.inViewportAtCapture : s.dom?.inViewportOnLoad ?? null,
        inViewportOnLoad: s.dom?.inViewportOnLoad ?? null,
        fillStatus: slotFillStatus(s),
        fillType: slotFillType(s),
        render: s.render || null,
        targetingKeys: Object.keys(s.targeting || {}),
        frame: s.frame || null
      };
    }),
    requests: requests.map(r => ({
      kind: r.kind || 'display',
      isSra: typeof r.isSra === 'boolean' ? r.isSra : null,
      isBatched: typeof r.isBatched === 'boolean' ? r.isBatched : null,
      slotCount: r.slotCount ?? null,
      iu_parts: r.iu_parts ?? null,
      enc_prev_ius: r.enc_prev_ius ?? null,
      dids: r.dids ?? null,
      prev_iu_szs: r.prev_iu_szs ?? null,
      startTime: r.startTime ?? null,
      correlator: r.correlator || null,
      adUnits: r.adUnits || (r.iu ? [r.iu] : []),
      status: r.status ?? null,
      duration: r.duration ?? null,
      gdpr: parameterValue(r, 'gdpr'),
      gdpr_consent_length: r.gdpr_consent ?? (typeof r.raw?.gdpr_consent === 'string' ? r.raw.gdpr_consent.length : null),
      tcString: r.tcString || null,
      npa: parameterValue(r, 'npa'),
      ltd: parameterValue(r, 'ltd'),
      rdp: parameterValue(r, 'rdp'),
      parameterPresence: Object.fromEntries(privacyKeys.map(key => [key, parameterPresent(r, key)])),
      ppid: r.ppid || false,
      pvsid: r.pvsid || null,
      fill: r.fill || null
    })),
    findings
  };

  // Build Markdown report
  const lines = [];

  // 1. Header
  lines.push(`# GPT Audit Report: ${meta.url || 'Unknown URL'}`);
  lines.push('');
  lines.push(`- **URL**: ${meta.url || 'N/A'}`);
  lines.push(`- **Audit Timestamp**: ${meta.timestamp || new Date().toISOString()}`);
  lines.push(`- **GPT Version**: \`${gpt.version || 'not loaded'}\``);
  lines.push(`- **Slots Defined**: ${slots.length}${frames.length ? ` (${mainSlotCount} in the main frame, ${frameSlotCount} in ${frames.length} iframe GPT instance(s))` : ''}`);
  lines.push(`- **GPT Instances**: ${gptInstances}${frames.length ? ` (1 main frame + ${frames.length} same-origin iframes)` : ''}`);
  lines.push(`- **Ad Requests (GAM)**: ${requests.length} (${batching.displayRequestCount} display, ${requests.filter(r => r.kind === 'video').length} video)`);
  lines.push(`- **Request Architecture**: Configured SRA: \`${booleanLabel(sraEnabled)}\` | Observed multi-slot batching: \`${observedLabel(batching.observed)}\` (${batching.batchedRequestCount} request(s)) | Transport-compressed requests: ${batching.transportCompressedRequestCount}`);
  lines.push(`- **Consent State**: GDPR: \`${consentSummary.gdprState}\` | TC String: \`${consentSummary.tcStringPresent === null ? 'unknown' : consentSummary.tcStringPresent ? `present (${consentSummary.tcStringLength} chars)` : 'absent'}\` | NPA parameter: \`${consentSummary.npaState}\` | TCF Status: \`${tcfAnalysis.status}\``);
  if (compliance.active) {
    const failedChecks = compliance.checks.filter(c => c.passed === false).length;
    lines.push(`- **Publisher Compliance**: **${compliance.publisher}** — **${complianceLabel(compliance.passed)}${compliance.passed === false ? ` (${failedChecks} requirement(s) failed)` : ''}**`);
  }
  lines.push(`- **Findings Summary**: **High**: ${highFindings.length} | **Medium**: ${medFindings.length} | **Low**: ${lowFindings.length} (Total: ${findings.length})`);
  for (const note of coverage.notes) lines.push(`- ${note}`);
  lines.push('');

  // 2. Publisher Mandatory Parameters (if configured)
  if (compliance.active) {
    lines.push('## 2. Publisher Mandatory Parameters (Compliance)');
    lines.push('');
    lines.push(`Configuration Profile: **${compliance.publisher}** | Status: **${complianceLabel(compliance.passed)}**`);
    lines.push('');
    lines.push('| Requirement | Category | Status | Verification Evidence / Details |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const c of compliance.checks) {
      const statusIcon = c.passed === true ? '✅ Passed' : c.passed === false ? '❌ **Failed**' : '➖ Unknown';
      lines.push(`| \`${c.name}\` | ${c.type} | ${statusIcon} | ${c.details} |`);
    }
    lines.push('');
  }

  // 3. Slot Table
  const slotSectionNum = compliance.active ? '3' : '2';
  lines.push(`## ${slotSectionNum}. Slot Table`);
  lines.push('');
  lines.push('| Element ID | Frame | Ad Unit Path | Declared Sizes | Rendered Size | Line Item ID | Creative ID | Advertiser ID | SafeFrame | In Viewport at Capture | Targeting Keys |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const slot of jsonReport.slots) {
    const szReq = (slot.sizes || []).map(s => Array.isArray(s) ? `${s[0]}×${s[1]}` : s).join(', ') || 'none';
    const szRend = Array.isArray(slot.renderedSize) ? `${slot.renderedSize[0]}×${slot.renderedSize[1]}` : (slot.renderedSize || 'none');
    const sf = slot.safeFrame ? 'yes' : 'no';
    const vp = slot.inViewportAtCapture === null ? 'unknown' : slot.inViewportAtCapture ? 'yes' : 'no';
    const tgKeys = (slot.targetingKeys || []).slice(0, 5).join(', ') + (slot.targetingKeys?.length > 5 ? '…' : '');
    const lineItem = slot.lineItemId !== null ? String(slot.lineItemId) : 'null';
    const creative = slot.creativeId !== null ? String(slot.creativeId) : 'null';
    const adv = slot.advertiserId !== null ? String(slot.advertiserId) : 'null';

    const frameCell = slot.frame ? `\`${slot.frame.length > 28 ? slot.frame.slice(0, 25) + '…' : slot.frame}\`` : 'main';
    lines.push(`| \`${slot.elementId}\` | ${frameCell} | \`${slot.adUnitPath}\` | ${szReq} | ${szRend} | ${lineItem} | ${creative} | ${adv} | ${sf} | ${vp} | ${tgKeys || 'none'} |`);
  }
  lines.push('');

  // GPT instances in same-origin iframes (ad-server passbacks, wrappers)
  if (frames.length > 0) {
    lines.push('### GPT Instances in iframes');
    lines.push('');
    lines.push('| Iframe ID | Depth | GPT Version | gpt.js Host | Slots |');
    lines.push('| :--- | :--- | :--- | :--- | :--- |');
    for (const f of jsonReport.frames) {
      lines.push(`| \`${f.iframeId || '(no id)'}\` | ${f.depth ?? '-'} | \`${f.version || 'unknown'}\` | ${f.legacyHost ? 'googletagservices.com (legacy)' : 'securepubads'} | ${f.slotCount} |`);
    }
    lines.push('');
  }

  // 3b. Detailed Render Information for Rendered Slots
  lines.push('### Slot Render Details (Event Data)');
  lines.push('');
  lines.push('| Element ID | Empty | Rendered Size | Backfill | Line Item ID | Source Agnostic Line Item | Creative ID | Yield Group IDs | Fill Type |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const slot of jsonReport.slots) {
    const r = slot.render;
    if (!r) {
      lines.push(`| \`${slot.elementId}\` | _no render event_ | - | - | - | - | - | - | **Unknown** |`);
      continue;
    }
    const emptyStr = typeof r.isEmpty === 'boolean' ? String(r.isEmpty) : 'unknown';
    const szStr = Array.isArray(r.size) ? `${r.size[0]}×${r.size[1]}` : (r.size || 'none');
    const backfillStr = typeof r.isBackfill === 'boolean' ? String(r.isBackfill) : 'unknown';
    const liStr = r.lineItemId != null ? String(r.lineItemId) : 'null';
    const saLiStr = r.sourceAgnosticLineItemId != null ? String(r.sourceAgnosticLineItemId) : 'null';
    const crStr = r.creativeId != null ? String(r.creativeId) : 'null';
    const ygStr = r.yieldGroupIds ? (Array.isArray(r.yieldGroupIds) ? r.yieldGroupIds.join(', ') : String(r.yieldGroupIds)) : 'none';

    lines.push(`| \`${slot.elementId}\` | ${emptyStr} | ${szStr} | ${backfillStr} | ${liStr} | ${saLiStr} | ${crStr} | ${ygStr} | **${slot.fillType}** |`);
  }
  lines.push('');

  // 4. Findings
  const findingsSectionNum = compliance.active ? '4' : '3';
  lines.push(`## ${findingsSectionNum}. Findings`);
  lines.push('');

  const renderFindingsSection = (title, list) => {
    lines.push(`### ${title} (${list.length})`);
    lines.push('');
    if (list.length === 0) {
      lines.push('_None_');
      lines.push('');
      return;
    }
    for (const f of list) {
      const slotLabel = f.slot ? ` [Slot: \`${f.slot}\`]` : '';
      lines.push(`- **[${f.id}]**${slotLabel}`);
      lines.push(`  - **Evidence**: ${f.evidence}`);
      lines.push(`  - **Fix**: ${f.fix}`);
    }
    lines.push('');
  };

  renderFindingsSection('High Severity', highFindings);
  renderFindingsSection('Medium Severity', medFindings);
  renderFindingsSection('Low Severity', lowFindings);

  // 5. Request Table
  const requestSectionNum = compliance.active ? '5' : '4';
  lines.push(`## ${requestSectionNum}. Ad Request Table (\`gampad/ads\`)`);
  lines.push('');
  lines.push('| # | Kind | Correlator | PPID | Ad Units (Count) | Status | Duration | GDPR | Consent Present | Privacy Signals (npa/ltd/rdp) |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  jsonReport.requests.forEach((req, idx) => {
    const kind = req.kind || 'display';
    const corr = req.correlator || 'none';
    const ppidStr = req.ppid ? 'yes' : 'no';
    const auCount = req.adUnits?.length || (req.iu ? 1 : 0);
    const auSnippet = auCount > 0 ? (req.adUnits?.[0] ? `${req.adUnits[0]} (${auCount})` : `${auCount} unit(s)`) : 'none';
    const status = req.status ?? 'unknown';
    const dur = req.duration !== null && req.duration !== undefined ? `${Math.round(req.duration)} ms` : '-';
    const gdpr = privacyLabel(req.gdpr, req.parameterPresence.gdpr);
    const consent = req.gdpr_consent_length > 0 ? `yes (${req.gdpr_consent_length} chars)` : req.parameterPresence.gdpr_consent === false ? 'absent' : req.gdpr_consent_length == null ? 'unknown' : 'empty';
    const priv = ['npa', 'ltd', 'rdp'].map(key => `${key}:${privacyLabel(req[key], req.parameterPresence[key])}`).join(', ');

    lines.push(`| ${idx + 1} | \`${kind}\` | \`${corr}\` | ${ppidStr} | \`${auSnippet}\` | ${status} | ${dur} | ${gdpr} | ${consent} | \`${priv}\` |`);
  });
  lines.push('');

  // 6. Appendix
  const appendixSectionNum = compliance.active ? '6' : '5';
  lines.push(`## ${appendixSectionNum}. Appendix`);
  lines.push('');

  // TCF v2 Consent & Purpose Analysis
  lines.push('### TCF v2 Consent & Purpose Analysis');
  lines.push('');
  const statusBadge = tcfAnalysis.status === 'healthy' ? '✅ Healthy' : tcfAnalysis.status === 'error' ? '❌ Issues Detected' : tcfAnalysis.status === 'incomplete' ? '➖ Incomplete' : tcfAnalysis.status === 'unknown' ? '➖ Unknown' : '➖ Not Active';
  lines.push(`- **TCF Status**: **${statusBadge}** — ${tcfAnalysis.statusSummary}`);
  lines.push(`- **\`__tcfapi\` Present**: \`${tcfAnalysis.apiPresent === null ? 'unknown' : String(tcfAnalysis.apiPresent)}\` | **GDPR Applies**: \`${tcfAnalysis.gdprApplies === null ? 'unknown' : String(tcfAnalysis.gdprApplies)}\``);
  if (tcfAnalysis.cmpId !== null || tcfAnalysis.tcfPolicyVersion !== null || tcfAnalysis.eventStatus) {
    lines.push(`- **CMP Details**: CMP ID: \`${tcfAnalysis.cmpId ?? 'n/a'}\` | CMP Version: \`${tcfAnalysis.cmpVersion ?? 'n/a'}\` | Policy Version: \`${tcfAnalysis.tcfPolicyVersion ?? 'n/a'}\` | Event Status: \`${tcfAnalysis.eventStatus || 'n/a'}\` | Publisher CC: \`${tcfAnalysis.publisherCC || 'n/a'}\``);
  }
  if (tcfAnalysis.googleVendor.consent !== null || tcfAnalysis.googleVendor.legitimateInterest !== null) {
    lines.push(`- **Google Vendor (ID 755)**: Consent: \`${tcfAnalysis.googleVendor.consent === null ? 'n/a' : String(tcfAnalysis.googleVendor.consent)}\` | Legitimate Interest: \`${tcfAnalysis.googleVendor.legitimateInterest === null ? 'n/a' : String(tcfAnalysis.googleVendor.legitimateInterest)}\``);
  }
  if (tcfAnalysis.gamEligibility.personalizedAds !== null) {
    lines.push(`- **GAM Ad Serving Eligibility**: Personalized Ads: \`${tcfAnalysis.gamEligibility.personalizedAds}\` | Non-Personalized Ads: \`${tcfAnalysis.gamEligibility.nonPersonalizedAds}\` | Limited Ads: \`${tcfAnalysis.gamEligibility.limitedAds}\``);
  }
  lines.push(`- **TC String (\`tcString\`)** (${tcfAnalysis.tcStringLength} chars, source: \`${tcfAnalysis.tcStringSource}\`): \`${tcfAnalysis.tcString || 'absent'}\``);
  lines.push('');

  if (tcfAnalysis.checks.length > 0) {
    lines.push('#### TCF Health Checks');
    lines.push('');
    lines.push('| Check | Status | Details |');
    lines.push('| :--- | :--- | :--- |');
    for (const c of tcfAnalysis.checks) {
      lines.push(`| ${c.name} | ${c.passed === null ? '➖ Unknown' : c.passed ? '✅ Passed' : '❌ **Failed**'} | ${c.details} |`);
    }
    lines.push('');
  }

  lines.push('#### TCF v2 Purposes (1–10)');
  lines.push('');
  lines.push('| Purpose | Name | Consent | Legitimate Interest | GAM Requirement |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');
  for (const p of tcfAnalysis.purposes) {
    const cStr = p.consent === null ? '`n/a`' : (p.consent ? '**`true`** ✅' : '**`false`** ❌');
    const liStr = p.legitimateInterest === null ? '`n/a`' : (p.legitimateInterest ? '**`true`** ✅' : '`false`');
    lines.push(`| **Purpose ${p.id}** | ${p.name} | ${cStr} | ${liStr} | ${p.gamRole} |`);
  }
  lines.push('');

  lines.push('### Page-Level Targeting');
  lines.push('');
  const ptKeys = Object.keys(gpt.pageTargeting || {});
  if (ptKeys.length === 0) {
    lines.push('_No page-level targeting keys set._');
  } else {
    lines.push('| Key | Value |');
    lines.push('| :--- | :--- |');
    for (const k of ptKeys) {
      const val = gpt.pageTargeting[k];
      const valStr = Array.isArray(val) ? val.join(', ') : String(val);
      lines.push(`| \`${k}\` | \`${valStr}\` |`);
    }
  }
  lines.push('');

  lines.push('### Prebid Summary');
  lines.push('');
  if (!neighbours.prebid?.present) {
    lines.push('_Prebid.js not detected._');
  } else {
    lines.push(`- **Prebid Version**: \`${neighbours.prebid.version || 'unknown'}\``);
    lines.push(`- **Bidder Timeout**: ${neighbours.prebid.bidderTimeout ? `${neighbours.prebid.bidderTimeout} ms` : 'unset'}`);
    lines.push(`- **Ad Units Configured**: ${neighbours.prebid.adUnits?.length || 0}`);
    lines.push(`- **Bids Returned**: ${neighbours.prebid.bids?.length || 0}`);
    lines.push(`- **hb_* Keys on Slots**: ${neighbours.prebid.hbKeysOnSlots ? 'yes' : 'no'}`);
  }
  lines.push('');

  lines.push('### Screenshots');
  lines.push('');
  lines.push('![Page Screenshot](page.png)');
  lines.push('');
  lines.push('![Publisher Console Screenshot](console.png)');
  lines.push('');

  const html = renderHtmlReport(snapshot, network, findings, jsonReport, compliance);

  return {
    markdown: lines.join('\n'),
    json: jsonReport,
    html
  };
}

export function renderComparison(reports) {
  const lines = [];
  lines.push('# GPT Audit — Multi-Host Comparison');
  lines.push('');
  lines.push('| Host | GPT Version | Slots | Ad Requests | Compliance | Configured SRA | Observed Batching | Compressed Requests | Lazy Load | Initial Load | Prebid | Consent (GDPR/TC/NPA parameter) | Unfilled / Unknown Slots | Findings (H / M / L) |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const rep of reports) {
    const meta = rep.meta || {};
    const slots = rep.slots || [];
    const requests = rep.requests || [];
    const summary = rep.summary || {};
    const consent = meta.consent || {};
    const compliance = rep.compliance || null;

    let host = 'unknown';
    try {
      if (meta.url) host = new URL(meta.url).hostname;
    } catch (_) { host = meta.url || 'unknown'; }

    const gptVer = meta.gptVersion || 'none';
    const slotCount = meta.slotCount ?? slots.length;
    const reqCount = meta.requestCount ?? requests.length;

    const batching = meta.batching || summarizeBatching({ requests });
    const sraStr = booleanLabel(meta.sra);
    const batchStr = observedLabel(batching.observed);
    const lazyStr = booleanLabel(meta.lazyLoad);
    const initStr = meta.initialLoadDisabled === true ? 'disabled' : meta.initialLoadDisabled === false ? 'enabled' : 'unknown';
    const prebidVer = rep.prebid?.version || meta.prebidVersion || (rep.prebid?.present ? 'present' : 'none');

    let compStr = '-';
    if (compliance?.active) {
      compStr = compliance.passed === true ? '✅ Pass' : compliance.passed === false ? `❌ ${compliance.checks.filter(c => c.passed === false).length} issue(s)` : '➖ Incomplete';
    }

    const npaState = consent.npaState ?? (consent.npa === true ? '1' : consent.npa === false ? '0' : 'unknown');
    const consentStr = `${consent.gdprState ?? consent.gdpr ?? 'unknown'}/${observedLabel(consent.tcStringPresent)}/${npaState}`;
    const unfilledCount = slots.filter(s => s.lineItemId === 'unfilled' || s.render?.isEmpty === true).length;
    const unknownFillCount = slots.filter(s => s.fillStatus === 'unknown' || (s.fillStatus === undefined && typeof s.render?.isEmpty !== 'boolean')).length;
    const findingsStr = `${summary.high ?? 0}H / ${summary.medium ?? 0}M / ${summary.low ?? 0}L`;

    lines.push(`| **${host}** | \`${gptVer}\` | ${slotCount} | ${reqCount} | ${compStr} | ${sraStr} | ${batchStr} | ${batching.transportCompressedRequestCount} | ${lazyStr} | ${initStr} | \`${prebidVer}\` | ${consentStr} | ${unfilledCount} / ${unknownFillCount} | ${findingsStr} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  // Compare mode
  if (args.includes('--compare')) {
    let outIdx = args.indexOf('-o');
    let outputFile = outIdx !== -1 && outIdx + 1 < args.length ? args[outIdx + 1] : null;

    const files = args.filter((a, idx) => a !== '--compare' && a !== '-o' && (outIdx === -1 || (idx !== outIdx && idx !== outIdx + 1)));

    const reports = [];
    for (const f of files) {
      try {
        const content = readFileSync(f, 'utf8');
        reports.push(JSON.parse(content));
      } catch (e) {
        console.error(`Failed to read report JSON ${f}: ${e.message}`);
      }
    }

    const md = renderComparison(reports);
    if (outputFile) {
      mkdirSync(dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, md, 'utf8');
      console.log(`Saved comparison of ${reports.length} hosts to ${outputFile}`);
    } else {
      process.stdout.write(md + '\n');
    }
    process.exit(0);
  }

  // Single report mode
  let snapshotFile = null;
  let networkFile = null;
  let findingsFile = null;
  let outputDir = null;
  let configFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && i + 1 < args.length) {
      outputDir = args[++i];
    } else if ((args[i] === '-c' || args[i] === '--config') && i + 1 < args.length) {
      configFile = args[++i];
    } else if (!snapshotFile) {
      snapshotFile = args[i];
    } else if (!networkFile) {
      networkFile = args[i];
    } else if (!findingsFile) {
      findingsFile = args[i];
    }
  }

  if (!snapshotFile || !networkFile || !findingsFile) {
    console.error('Usage: node report.js <snapshot.json> <network.json> <findings.json> [-c <config.json>] -o <out/<host>/>');
    console.error('       node report.js --compare out/*/report.json -o out/comparison.md');
    process.exit(1);
  }

  try {
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    const network = JSON.parse(readFileSync(networkFile, 'utf8'));
    const findings = JSON.parse(readFileSync(findingsFile, 'utf8'));

    let config = null;
    if (configFile) {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
    } else if (existsSync('gpt-audit.config.json')) {
      config = JSON.parse(readFileSync('gpt-audit.config.json', 'utf8'));
    }

    const { markdown, json, html } = renderReport(snapshot, network, findings, { config });

    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      const mdPath = join(outputDir, 'report.md');
      const jsonPath = join(outputDir, 'report.json');
      const htmlPath = join(outputDir, 'report.html');

      writeFileSync(mdPath, markdown, 'utf8');
      writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
      writeFileSync(htmlPath, html, 'utf8');
      console.log(`Saved report.md, report.json, and report.html to ${outputDir}`);
    } else {
      process.stdout.write(markdown + '\n');
    }
  } catch (e) {
    console.error(`report error: ${e.message}`);
    process.exit(1);
  }
}
