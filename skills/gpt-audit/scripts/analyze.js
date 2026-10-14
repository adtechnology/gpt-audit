#!/usr/bin/env node
// analyze.js — Phase 2 (see docs/PLAN.md, "Phase 2 — analyzer and report").
//
// CLI: node analyze.js <snapshot.json> <network.json> [-c <config.json>] [-o <findings.json>]
// Loads every rule module in ./rules/ (one file per rule id), runs them in id order,
// writes the concatenated findings: { id, severity, slot, evidence, fix }[]. Deterministic, no network, no LLM.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import r01 from './rules/r01-slot-never-displayed.js';
import r02 from './rules/r02-dom-missing-or-duplicate.js';
import r03 from './rules/r03-unfilled-slot.js';
import r04 from './rules/r04-viewport-fit.js';
import r05 from './rules/r05-container-size-mismatch.js';
import r06 from './rules/r06-single-request-architecture.js';
import r07 from './rules/r07-mixed-correlators.js';
import r08 from './rules/r08-initial-load-disabled-no-refresh.js';
import r09 from './rules/r09-consent-mismatch.js';
import r10 from './rules/r10-legacy-or-duplicate-gpt.js';
import r16 from './rules/r16-publisher-mandatory-params.js';
import r17 from './rules/r17-gpt-idle-in-main-frame.js';
import r18 from './rules/r18-shared-ad-unit-path.js';

const RULES = [
  { id: 'R01', run: r01 },
  { id: 'R02', run: r02 },
  { id: 'R03', run: r03 },
  { id: 'R04', run: r04 },
  { id: 'R05', run: r05 },
  { id: 'R06', run: r06 },
  { id: 'R07', run: r07 },
  { id: 'R08', run: r08 },
  { id: 'R09', run: r09 },
  { id: 'R10', run: r10 },
  { id: 'R16', run: r16 },
  { id: 'R17', run: r17 },
  { id: 'R18', run: r18 }
];

const SEVERITY_ORDER = { high: 1, medium: 2, low: 3 };

export async function analyze(snapshot, network, options = {}) {
  let config = null;

  if (options && typeof options === 'object') {
    if (options.config && typeof options.config === 'object') {
      config = options.config;
    } else if (options.configPath && typeof options.configPath === 'string' && existsSync(options.configPath)) {
      try {
        config = JSON.parse(readFileSync(options.configPath, 'utf8'));
      } catch (_) {}
    } else if (options.required || options.ppid !== undefined || options.custParams || options.pageTargeting) {
      config = options;
    }
  }

  // Auto-detect gpt-audit.config.json if no config explicitly provided
  if (!config && existsSync('gpt-audit.config.json')) {
    try {
      config = JSON.parse(readFileSync('gpt-audit.config.json', 'utf8'));
    } catch (_) {}
  }

  const context = { config };
  const allFindings = [];

  for (const { id, run } of RULES) {
    try {
      const res = await run(snapshot, network, context);
      if (Array.isArray(res)) {
        allFindings.push(...res);
      }
    } catch (e) {
      allFindings.push({
        id,
        severity: 'high',
        slot: null,
        evidence: `rule ${id} threw: ${e.message}`,
        fix: 'investigate rule execution error'
      });
    }
  }

  // Sort findings: high -> medium -> low, then by rule ID
  allFindings.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity?.toLowerCase()] || 99;
    const sevB = SEVERITY_ORDER[b.severity?.toLowerCase()] || 99;
    if (sevA !== sevB) return sevA - sevB;
    return (a.id || '').localeCompare(b.id || '');
  });

  return allFindings;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let snapshotFile = null;
  let networkFile = null;
  let outputFile = null;
  let configFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && i + 1 < args.length) {
      outputFile = args[++i];
    } else if ((args[i] === '-c' || args[i] === '--config') && i + 1 < args.length) {
      configFile = args[++i];
    } else if (!snapshotFile) {
      snapshotFile = args[i];
    } else if (!networkFile) {
      networkFile = args[i];
    }
  }

  if (!snapshotFile || !networkFile) {
    console.error('Usage: node analyze.js <snapshot.json> <network.json> [-c <config.json>] [-o <findings.json>]');
    process.exit(1);
  }

  try {
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    const network = JSON.parse(readFileSync(networkFile, 'utf8'));

    let config = null;
    if (configFile) {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
      console.log(`Loaded publisher config from ${configFile}`);
    } else if (existsSync('gpt-audit.config.json')) {
      config = JSON.parse(readFileSync('gpt-audit.config.json', 'utf8'));
      console.log('Auto-detected publisher config from gpt-audit.config.json');
    }

    const findings = await analyze(snapshot, network, { config });
    const jsonOutput = JSON.stringify(findings, null, 2);

    if (outputFile) {
      mkdirSync(dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, jsonOutput, 'utf8');
      console.log(`Saved ${findings.length} findings to ${outputFile}`);
    } else {
      process.stdout.write(jsonOutput + '\n');
    }
  } catch (e) {
    console.error(`analyze error: ${e.message}`);
    process.exit(1);
  }
}
