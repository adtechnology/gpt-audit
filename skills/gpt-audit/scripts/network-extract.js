#!/usr/bin/env node
// network-extract.js — Phase 1 (see docs/PLAN.md, "Phase 1 — collector").
//
// CLI: node network-extract.js <network-raw.json> -o <network.json>
// Input: the JSON array the agent saved from the MCP tools list_network_requests + get_network_request.
// Output: one row per request to */gampad/ads with status, start time, duration, URL length and the parsed
// query (see references/gampad-params.md), plus every gpt.js / pubads_impl load with its timing.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function decodeKeyValues(str) {
  if (!str) return {};
  const out = {};
  const pairs = str.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      try {
        const k = decodeURIComponent(pair);
        out[k] = '';
      } catch (_) { out[pair] = ''; }
    } else {
      try {
        const k = decodeURIComponent(pair.slice(0, eqIdx));
        const rawV = decodeURIComponent(pair.slice(eqIdx + 1));
        const vals = rawV.split(',');
        out[k] = vals.length > 1 ? vals : rawV;
      } catch (_) {
        const k = pair.slice(0, eqIdx);
        out[k] = pair.slice(eqIdx + 1);
      }
    }
  }
  return out;
}

export function parseAdRequestUrl(url) {
  const u = new URL(url);
  const p = u.searchParams;

  const iu = p.get('iu');
  const iuParts = p.get('iu_parts');
  const encPrevIus = p.get('enc_prev_ius');
  const isSra = !!(iuParts || encPrevIus || p.get('prev_iu_szs'));

  const adUnits = [];
  if (iu) {
    adUnits.push(iu);
  } else if (iuParts) {
    const parts = iuParts.split(',').map(s => s.trim());
    if (encPrevIus) {
      const paths = encPrevIus.split(',').map(s => s.trim());
      for (const path of paths) {
        const indices = path.split('/').filter(Boolean).map(Number);
        const segments = indices.map(idx => parts[idx]?.replace(/^\//, '')).filter(Boolean);
        adUnits.push('/' + segments.join('/'));
      }
    } else {
      adUnits.push('/' + parts.map(s => s.replace(/^\//, '')).join('/'));
    }
  }

  const rawConsent = p.get('gdpr_consent') || '';
  const gdprConsentLength = rawConsent.length;

  const ppidVal = p.get('ppid');
  const ppid = ppidVal !== null && ppidVal !== '';

  return {
    host: u.host,
    path: u.pathname,
    urlLength: url.length,
    isSra,
    correlator: p.get('correlator'),
    adUnits,
    iu: iu || null,
    iu_parts: iuParts || null,
    enc_prev_ius: encPrevIus || null,
    sz: p.get('sz'),
    prev_iu_szs: p.get('prev_iu_szs'),
    cust_params: decodeKeyValues(p.get('cust_params')),
    scp: decodeKeyValues(p.get('scp')),
    gdpr: p.get('gdpr'),
    gdpr_consent: gdprConsentLength,
    addtl_consent: p.get('addtl_consent'),
    us_privacy: p.get('us_privacy'),
    gpp: p.get('gpp'),
    gpp_sid: p.get('gpp_sid'),
    npa: p.get('npa'),
    ltd: p.get('ltd'),
    rdp: p.get('rdp'),
    tfcd: p.get('tfcd'),
    tfua: p.get('tfua'),
    ppid,
    pvsid: p.get('pvsid'),
    eid: p.get('eid'),
    ifi: p.get('ifi'),
    biw: p.get('biw'),
    bih: p.get('bih'),
    u_sd: p.get('u_sd'),
    sfv: p.get('sfv'),
    raw: Object.fromEntries(p.entries())
  };
}

export function extractNetworkData(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : (rawItems.requests || rawItems.data || []);
  const requests = [];
  const libraries = [];

  for (const item of items) {
    const url = item.url || item.request?.url || item.response?.url || (typeof item === 'string' ? item : '');
    if (!url) continue;

    const status = item.status ?? item.response?.status ?? null;
    const startTime = item.timing?.startTime ?? item.startTime ?? item.time ?? null;
    const duration = item.timing?.duration ?? item.duration ?? null;

    if (url.includes('/gampad/ads')) {
      try {
        const parsed = parseAdRequestUrl(url);
        requests.push({
          url,
          status,
          startTime,
          duration,
          ...parsed
        });
      } catch (e) {
        requests.push({
          url,
          status,
          startTime,
          duration,
          urlLength: url.length,
          error: e.message
        });
      }
    } else if (url.includes('/tag/js/gpt.js')) {
      libraries.push({
        name: 'gpt.js',
        url,
        status,
        startTime,
        duration
      });
    } else if (url.includes('pubads_impl')) {
      libraries.push({
        name: 'pubads_impl',
        url,
        status,
        startTime,
        duration
      });
    }
  }

  return { requests, libraries };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let inputFile = null;
  let outputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && i + 1 < args.length) {
      outputFile = args[++i];
    } else if (!inputFile) {
      inputFile = args[i];
    }
  }

  if (!inputFile) {
    console.error('Usage: node network-extract.js <network-raw.json> [-o <network.json>]');
    process.exit(1);
  }

  try {
    const rawContent = readFileSync(inputFile, 'utf8');
    const rawData = JSON.parse(rawContent);
    const result = extractNetworkData(rawData);
    const formatted = JSON.stringify(result, null, 2);

    if (outputFile) {
      mkdirSync(dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, formatted, 'utf8');
      console.log(`Saved ${result.requests.length} ad requests and ${result.libraries.length} library loads to ${outputFile}`);
    } else {
      process.stdout.write(formatted + '\n');
    }
  } catch (e) {
    console.error(`network-extract error: ${e.message}`);
    process.exit(1);
  }
}
