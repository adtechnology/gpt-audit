#!/usr/bin/env node
// analyze.js — Phase 2 (see docs/PLAN.md, "Phase 2 — analyzer and report").
//
// CLI: node analyze.js <snapshot.json> <network.json> -o <findings.json>
// Loads every rule module in ./rules/ (one file per rule id, see rules/README.md), runs them in id order,
// writes the concatenated findings: { id, severity, slot, evidence, fix }[]. Deterministic, no network, no LLM.
//
// TODO (Phase 2): implement rules R01–R10 first; R11–R15 are stretch (references/anomaly-catalog.md).

export async function analyze(snapshot, network) {
  // TODO: import rules, run, concat
  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('analyze.js: not implemented yet (Phase 2)');
  process.exit(2);
}
