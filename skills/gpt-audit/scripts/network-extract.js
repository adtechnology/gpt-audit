#!/usr/bin/env node
// network-extract.js — Phase 1 (see docs/PLAN.md, "Phase 1 — collector").
//
// CLI: node network-extract.js <network-raw.json> -o <network.json>
// Input: the JSON array the agent saved from the MCP tools list_network_requests + get_network_request.
// Output: one row per request to */gampad/ads with status, start time, duration, URL length and the parsed
// query (see references/gampad-params.md), plus every gpt.js / pubads_impl load with its timing.
//
// TODO (Phase 1): implement. Export `parseAdRequestUrl(url)` so the tests can cover SRA and non-SRA URLs.

export function parseAdRequestUrl(url) {
  // TODO: parse iu | iu_parts+enc_prev_ius, sz | prev_iu_szs, cust_params, scp, correlator, consent params...
  const u = new URL(url);
  return { host: u.host, path: u.pathname, raw: Object.fromEntries(u.searchParams) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('network-extract.js: not implemented yet (Phase 1)');
  process.exit(2);
}
