#!/usr/bin/env node
// report.js — Phase 2 (see docs/PLAN.md, "Phase 2 — analyzer and report").
//
// CLI:   node report.js <snapshot.json> <network.json> <findings.json> -o <out/<host>/>
//        → writes report.md and report.json in the layout given in the plan.
// CLI:   node report.js --compare out/*/report.json -o out/comparison.md
//        → one table, one row per host: GPT version · slots · ad requests · SRA · lazy load ·
//          initial load disabled · Prebid version · consent (gdpr, tcString present, npa) ·
//          unfilled slots · findings by severity.
//
// TODO (Phase 2): implement.

export function renderReport(snapshot, network, findings) {
  // TODO
  return { markdown: '# report (not implemented yet)\n', json: { meta: snapshot?.meta ?? {}, slots: [], requests: [], findings } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('report.js: not implemented yet (Phase 2)');
  process.exit(2);
}
