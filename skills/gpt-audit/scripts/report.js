#!/usr/bin/env node
// report.js — Phase 2 (see docs/PLAN.md, "Phase 2 — analyzer and report").
//
// CLI: node report.js <snapshot.json> <network.json> <findings.json> [-c <config.json>] -o <out/<host>/>
//      → writes report.md and report.json in the layout given in the plan.
// CLI: node report.js --compare out/*/report.json -o out/comparison.md
//      → one table, one row per host: GPT version · slots · ad requests · SRA · lazy load ·
//        initial load disabled · Prebid version · consent (gdpr, tcString present, npa) ·
//        unfilled slots · findings by severity · compliance status.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { evaluateCompliance } from './rules/r16-publisher-mandatory-params.js';
import { renderHtmlReport } from './report-html.js';

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

  const highFindings = findings.filter(f => f.severity?.toLowerCase() === 'high');
  const medFindings = findings.filter(f => f.severity?.toLowerCase() === 'medium');
  const lowFindings = findings.filter(f => f.severity?.toLowerCase() === 'low');

  // Consent summary
  const gdprParam = requests.find(r => r.gdpr !== undefined)?.gdpr ?? (neighbours.consent?.tcf?.gdprApplies ? '1' : '0');
  const tcStringLen = requests.find(r => r.gdpr_consent !== undefined)?.gdpr_consent ?? neighbours.consent?.tcf?.tcStringLength ?? 0;
  const npaParam = requests.find(r => r.npa !== undefined)?.npa ?? '0';

  const consentSummary = {
    gdpr: gdprParam,
    tcStringPresent: tcStringLen > 0,
    tcStringLength: tcStringLen,
    npa: npaParam === '1'
  };

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
      consent: consentSummary
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
        renderedSize: s.render?.size || (s.iframe?.w && s.iframe?.h ? [s.iframe.w, s.iframe.h] : null),
        lineItemId: lineItemLabel,
        creativeId: s.render?.creativeId ?? s.response?.creativeId ?? null,
        advertiserId: s.render?.advertiserId ?? s.response?.advertiserId ?? null,
        campaignId: s.render?.campaignId ?? s.response?.campaignId ?? null,
        safeFrame: s.iframe?.safeFrame ?? false,
        inViewportOnLoad: s.dom?.inViewportOnLoad ?? false,
        render: s.render || null,
        targetingKeys: Object.keys(s.targeting || {}),
        frame: s.frame || null
      };
    }),
    requests: requests.map(r => ({
      kind: r.kind || 'display',
      correlator: r.correlator || null,
      adUnits: r.adUnits || (r.iu ? [r.iu] : []),
      status: r.status ?? 200,
      duration: r.duration ?? null,
      gdpr: r.gdpr || null,
      gdpr_consent_length: r.gdpr_consent || 0,
      npa: r.npa || null,
      ltd: r.ltd || null,
      rdp: r.rdp || null,
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
  lines.push(`- **Ad Requests (GAM)**: ${requests.length} (${requests.filter(r => r.kind === 'display').length} display, ${requests.filter(r => r.kind === 'video').length} video)`);
  lines.push(`- **Consent State**: GDPR: \`${consentSummary.gdpr}\` | TC String: \`${consentSummary.tcStringPresent ? `present (${consentSummary.tcStringLength} chars)` : 'absent'}\` | NPA: \`${consentSummary.npa ? '1' : '0'}\``);
  if (compliance.active) {
    const failedChecks = compliance.checks.filter(c => !c.passed).length;
    lines.push(`- **Publisher Compliance**: **${compliance.publisher}** — **${compliance.passed ? 'COMPLIANT ✅' : `NON-COMPLIANT ❌ (${failedChecks} requirement(s) failed)`}**`);
  }
  lines.push(`- **Findings Summary**: **High**: ${highFindings.length} | **Medium**: ${medFindings.length} | **Low**: ${lowFindings.length} (Total: ${findings.length})`);
  lines.push('');

  // 2. Publisher Mandatory Parameters (if configured)
  if (compliance.active) {
    lines.push('## 2. Publisher Mandatory Parameters (Compliance)');
    lines.push('');
    lines.push(`Configuration Profile: **${compliance.publisher}** | Status: **${compliance.passed ? 'COMPLIANT ✅' : 'NON-COMPLIANT ❌'}**`);
    lines.push('');
    lines.push('| Requirement | Category | Status | Verification Evidence / Details |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const c of compliance.checks) {
      const statusIcon = c.passed ? '✅ Passed' : '❌ **Failed**';
      lines.push(`| \`${c.name}\` | ${c.type} | ${statusIcon} | ${c.details} |`);
    }
    lines.push('');
  }

  // 3. Slot Table
  const slotSectionNum = compliance.active ? '3' : '2';
  lines.push(`## ${slotSectionNum}. Slot Table`);
  lines.push('');
  lines.push('| Element ID | Frame | Ad Unit Path | Requested Sizes | Rendered Size | Line Item ID | Creative ID | Advertiser ID | SafeFrame | In Viewport | Targeting Keys |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const slot of jsonReport.slots) {
    const szReq = (slot.sizes || []).map(s => Array.isArray(s) ? `${s[0]}×${s[1]}` : s).join(', ') || 'none';
    const szRend = Array.isArray(slot.renderedSize) ? `${slot.renderedSize[0]}×${slot.renderedSize[1]}` : (slot.renderedSize || 'none');
    const sf = slot.safeFrame ? 'yes' : 'no';
    const vp = slot.inViewportOnLoad ? 'yes' : 'no';
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
      lines.push(`| \`${slot.elementId}\` | _no render event_ | - | - | - | - | - | - | - |`);
      continue;
    }
    const emptyStr = r.isEmpty ? 'true' : 'false';
    const szStr = Array.isArray(r.size) ? `${r.size[0]}×${r.size[1]}` : (r.size || 'none');
    const backfillStr = r.isBackfill ? 'true' : 'false';
    const liStr = r.lineItemId !== null ? String(r.lineItemId) : 'null';
    const saLiStr = r.sourceAgnosticLineItemId !== null ? String(r.sourceAgnosticLineItemId) : 'null';
    const crStr = r.creativeId !== null ? String(r.creativeId) : 'null';
    const ygStr = r.yieldGroupIds ? (Array.isArray(r.yieldGroupIds) ? r.yieldGroupIds.join(', ') : String(r.yieldGroupIds)) : 'none';

    let fillType = 'Standard Line Item';
    if (r.isEmpty) fillType = 'Unfilled';
    else if (r.isBackfill && r.lineItemId === null) fillType = 'AdX / Open Bidding';
    else if (r.isBackfill) fillType = 'AdX / Backfill';

    lines.push(`| \`${slot.elementId}\` | ${emptyStr} | ${szStr} | ${backfillStr} | ${liStr} | ${saLiStr} | ${crStr} | ${ygStr} | **${fillType}** |`);
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

  requests.forEach((req, idx) => {
    const kind = req.kind || 'display';
    const corr = req.correlator || 'none';
    const ppidStr = req.ppid ? 'yes' : 'no';
    const auCount = req.adUnits?.length || (req.iu ? 1 : 0);
    const auSnippet = auCount > 0 ? (req.adUnits?.[0] ? `${req.adUnits[0]} (${auCount})` : `${auCount} unit(s)`) : 'none';
    const status = req.status ?? 200;
    const dur = req.duration !== null && req.duration !== undefined ? `${Math.round(req.duration)} ms` : '-';
    const gdpr = req.gdpr ?? '-';
    const consent = (req.gdpr_consent && req.gdpr_consent > 0) ? `yes (${req.gdpr_consent} chars)` : 'no';
    const priv = `npa:${req.npa ?? '0'}, ltd:${req.ltd ?? '0'}, rdp:${req.rdp ?? '0'}`;

    lines.push(`| ${idx + 1} | \`${kind}\` | \`${corr}\` | ${ppidStr} | \`${auSnippet}\` | ${status} | ${dur} | ${gdpr} | ${consent} | \`${priv}\` |`);
  });
  lines.push('');

  // 6. Appendix
  const appendixSectionNum = compliance.active ? '6' : '5';
  lines.push(`## ${appendixSectionNum}. Appendix`);
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
  lines.push('| Host | GPT Version | Slots | Ad Requests | Compliance | SRA | Prebid | Consent (GDPR/TC/NPA) | Unfilled Slots | Findings (H / M / L) |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

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

    const hasSra = requests.some(r => r.isSra || r.kind === 'display');
    const sraStr = hasSra ? 'on' : 'off';
    const prebidVer = rep.prebid?.version || 'none';

    let compStr = '-';
    if (compliance?.active) {
      compStr = compliance.passed ? '✅ Pass' : `❌ ${compliance.checks.filter(c => !c.passed).length} issue(s)`;
    }

    const consentStr = `${consent.gdpr ?? '-'}/${consent.tcStringPresent ? 'yes' : 'no'}/${consent.npa ? '1' : '0'}`;
    const unfilledCount = slots.filter(s => s.lineItemId === 'unfilled' || s.render?.isEmpty === true).length;
    const findingsStr = `${summary.high ?? 0}H / ${summary.medium ?? 0}M / ${summary.low ?? 0}L`;

    lines.push(`| **${host}** | \`${gptVer}\` | ${slotCount} | ${reqCount} | ${compStr} | ${sraStr} | \`${prebidVer}\` | ${consentStr} | ${unfilledCount} | ${findingsStr} |`);
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
