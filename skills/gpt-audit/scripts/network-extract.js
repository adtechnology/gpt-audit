#!/usr/bin/env node
// network-extract.js — Phase 1 (see docs/PLAN.md, "Phase 1 — collector").
//
// CLI: node network-extract.js <network-raw.txt> [--timings <snapshot.json>] -o <network.json>
// Input: verbatim output from list_network_requests / get_network_request saved in network-raw.txt.
// Output: one row per request to */gampad/ads with status, start time, duration, URL length and the parsed
// query (see references/gampad-params.md), plus every gpt.js / pubads_impl load with its timing.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function canonicalAdUnit(path) {
  const segments = path.split('/').filter(Boolean);
  // SRA encodes an MCM parent/child network pair with a colon. GPT slot paths use a comma.
  if (segments.length) segments[0] = segments[0].replace(/^(\d+):(\d+)$/, '$1,$2');
  return '/' + segments.join('/');
}

function numericTiming(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseStatus(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
  if (typeof value !== 'string') return null;
  const status = value.trim().replace(/^\[|\]$/g, '').trim();
  const http = status.match(/^(?:success\s*-\s*|failed\s*-\s*)?([1-5]\d{2})(?:\s+[^\r\n]*)?$/i);
  if (http) return Number(http[1]);
  // Transport failures have no HTTP response. Keep the captured failure rather than assuming 200.
  if (/net::ERR[_A-Z]+|^(?:failed|failure|cancelled|canceled|blocked|aborted)(?:\b|\s*-)/i.test(status)) return status;
  return null;
}

function isTruncatedUrl(url) {
  return /(?:\.\.\.|…)$/.test(url);
}

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

  const outputParam = p.get('output') || '';
  const isVideo = outputParam.startsWith('vast') || outputParam.startsWith('xml_vast');
  const kind = isVideo ? 'video' : 'display';

  const iu = p.get('iu');
  const iuParts = p.get('iu_parts');
  const encPrevIus = p.get('enc_prev_ius');
  const isSra = !!(iuParts || encPrevIus || p.get('prev_iu_szs'));

  const adUnits = [];
  if (iu) {
    adUnits.push(canonicalAdUnit(iu));
  } else if (iuParts) {
    const parts = iuParts.split(',').map(s => s.trim());
    if (encPrevIus) {
      const paths = encPrevIus.split(',').map(s => s.trim());
      for (const path of paths) {
        const tokens = path.split('/').filter(Boolean);
        // Invalid indices are incomplete evidence, not a partially reconstructed ad-unit path.
        if (!tokens.length || tokens.some(token => !/^\d+$/.test(token) || !parts[Number(token)])) continue;
        const segments = tokens.map(token => parts[Number(token)].replace(/^\//, ''));
        adUnits.push(canonicalAdUnit(segments.join('/')));
      }
    } else {
      adUnits.push(canonicalAdUnit(parts.join('/')));
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
    kind,
    isSra,
    correlator: p.get('correlator'),
    adUnits,
    slotElementIds: (p.get('dids') || '').split(/[~,]/).map(id => id.trim()).filter(Boolean),
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

export function parseNetworkRaw(rawContent) {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      return Array.isArray(data) ? data : (data.requests || data.data || []);
    } catch (_) {}
  }

  const items = [];

  // Match "## Request <url>" blocks from get_network_request
  if (rawContent.includes('## Request')) {
    const blocks = rawContent.split(/^## Request\s+/m);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const firstLineEnd = block.indexOf('\n');
      const url = (firstLineEnd !== -1 ? block.slice(0, firstLineEnd) : block).trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      const rest = firstLineEnd !== -1 ? block.slice(firstLineEnd) : '';
      // Only the request metadata before headers/body and explicitly labelled timing sections count.
      // Creative JavaScript may contain names such as "this.duration=0" and is never timing evidence.
      const beforeBody = rest.split(/^###\s+(?:Request|Response)\s+Body\b/im)[0];
      const metadata = beforeBody.split(/^###\s+/m)[0];
      const timingSections = [...beforeBody.matchAll(/^###\s+(?:Request\s+)?Timing(?:s)?\s*\r?\n([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim)].map(match => match[1]);
      const timingMetadata = [metadata, ...timingSections].join('\n');
      const statusMatch = metadata.match(/^\s*Status:\s*([^\r\n]*)/im);
      const status = parseStatus(statusMatch?.[1]);
      const number = '(\\d+(?:\\.\\d+)?)';
      const startTimeMatch = timingMetadata.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:startTime|start time|start)\\s*[:=]\\s*${number}\\s*(?:ms)?\\s*$`, 'im'));
      const durationMatch = timingMetadata.match(new RegExp(`^\\s*(?:[-*]\\s*)?duration\\s*[:=]\\s*${number}\\s*(?:ms)?\\s*$`, 'im'));
      const startTime = startTimeMatch ? numericTiming(Number(startTimeMatch[1])) : null;
      const duration = durationMatch ? numericTiming(Number(durationMatch[1])) : null;

      items.push({ url, status, startTime, duration });
    }
    return items;
  }

  // Match "reqid=<id> GET/POST <url> [<status>]" lines from list_network_requests
  const lineRegex = /^\s*reqid=\d+\s+[A-Z]+\s+(https?:\/\/\S+?)(?:\s+\[([^\r\n]*)\])?\s*$/gm;
  let match;
  while ((match = lineRegex.exec(rawContent)) !== null) {
    items.push({
      url: match[1],
      status: parseStatus(match[2]),
      startTime: null,
      duration: null
    });
  }

  return items;
}

function timingEntries(rawTimings) {
  if (!rawTimings) return [];
  if (Array.isArray(rawTimings)) return rawTimings;
  return rawTimings.networkTimings || rawTimings.resourceTiming || rawTimings.entries || [];
}

export function extractNetworkData(rawInput, rawTimings = null) {
  const items = typeof rawInput === 'string' ? parseNetworkRaw(rawInput) : (Array.isArray(rawInput) ? rawInput : (rawInput.requests || rawInput.data || []));
  const requests = [];
  const libraries = [];
  const resources = new Map();
  for (const entry of timingEntries(rawTimings)) {
    const url = entry.name || entry.url;
    if (typeof url !== 'string') continue;
    if (!resources.has(url)) resources.set(url, []);
    resources.get(url).push(entry);
  }
  const requestCounts = new Map();
  for (const item of items) {
    const url = item.url || item.request?.url || item.response?.url || (typeof item === 'string' ? item : '');
    requestCounts.set(url, (requestCounts.get(url) || 0) + 1);
  }

  for (const item of items) {
    const url = item.url || item.request?.url || item.response?.url || (typeof item === 'string' ? item : '');
    if (!url) continue;

    const status = parseStatus(item.status ?? item.response?.status);
    let startTime = numericTiming(item.timing?.startTime) ?? numericTiming(item.startTime);
    let duration = numericTiming(item.timing?.duration) ?? numericTiming(item.duration);
    let timingSource;
    const matchingResources = resources.get(url);
    // Multiple fetches of an identical URL are only paired when each occurrence was captured.
    if (matchingResources?.length === requestCounts.get(url)) {
      const entry = matchingResources.shift();
      requestCounts.set(url, requestCounts.get(url) - 1);
      if (startTime === null && numericTiming(entry.startTime) !== null) {
        startTime = entry.startTime;
        timingSource = 'resource-timing';
      }
      if (duration === null && numericTiming(entry.duration) !== null) {
        duration = entry.duration;
        timingSource = 'resource-timing';
      }
    }
    const timingProvenance = timingSource ? { timingSource } : {};

    if (url.includes('/gampad/ads')) {
      try {
        if (isTruncatedUrl(url)) throw new Error('Full request URL required; captured URL is truncated');
        const parsed = parseAdRequestUrl(url);
        requests.push({
          url,
          status,
          startTime,
          duration,
          ...timingProvenance,
          ...parsed
        });
      } catch (e) {
        requests.push({
          url,
          status,
          startTime,
          duration,
          urlLength: url.length,
          ...(isTruncatedUrl(url) ? { urlTruncated: true } : {}),
          ...timingProvenance,
          error: e.message
        });
      }
    } else if (url.includes('/tag/js/gpt.js')) {
      libraries.push({
        name: 'gpt.js',
        url,
        status,
        startTime,
        duration,
        ...timingProvenance
      });
    } else if (url.includes('pubads_impl')) {
      libraries.push({
        name: 'pubads_impl',
        url,
        status,
        startTime,
        duration,
        ...timingProvenance
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
  let timingsFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && i + 1 < args.length) {
      outputFile = args[++i];
    } else if (args[i] === '--timings' && i + 1 < args.length) {
      timingsFile = args[++i];
    } else if (!inputFile) {
      inputFile = args[i];
    }
  }

  if (!inputFile) {
    console.error('Usage: node network-extract.js <network-raw.txt> [--timings <snapshot.json>] [-o <network.json>]');
    process.exit(1);
  }

  try {
    const rawContent = readFileSync(inputFile, 'utf8');
    const timings = timingsFile ? JSON.parse(readFileSync(timingsFile, 'utf8')) : null;
    const result = extractNetworkData(rawContent, timings);
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
