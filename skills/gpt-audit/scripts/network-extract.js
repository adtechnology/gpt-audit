#!/usr/bin/env node
// network-extract.js — Phase 1 (see docs/PLAN.md, "Phase 1 — collector").
//
// CLI: node network-extract.js <network-raw.txt> -o <network.json>
// Input: verbatim output from list_network_requests and/or get_network_request saved in network-raw.txt.
//        Both formats may be mixed in one file; "## Request" blocks win over "reqid=" rows for the same URL and
//        rows whose URL the tool truncated ("... <truncated>") are skipped.
// Output: one row per request to */gampad/ads with status, start time, duration, URL length, the parsed
// query (see references/gampad-params.md) and the GAM fill headers (google-lineitem-id, google-creative-id,
// google-mediationgroup-id) when a block carried them, plus every gpt.js / pubads_impl load with its timing.

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

  const outputParam = p.get('output') || '';
  const isVideo = outputParam.startsWith('vast') || outputParam.startsWith('xml_vast');
  const kind = isVideo ? 'video' : 'display';

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

  // prev_scp: slot-level key-values, one segment per slot separated by "|" (SRA) or a single segment.
  const prevScpRaw = p.get('prev_scp');
  const prev_scp = prevScpRaw ? prevScpRaw.split('|').map(decodeKeyValues) : [];

  return {
    host: u.host,
    path: u.pathname,
    urlLength: url.length,
    kind,
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
    prev_scp,
    dids: p.get('dids'),
    impl: p.get('impl'),
    frm: p.get('frm'),
    gdpr: p.get('gdpr'),
    gdpr_consent: gdprConsentLength,
    tcString: rawConsent || null,
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
  const seen = new Set();
  const FILL_HEADERS = ['google-lineitem-id', 'google-creative-id', 'google-mediationgroup-id', 'google-mediationtag-id', 'date', 'content-length', 'content-type'];

  // Match "## Request <url>" blocks from get_network_request (full URLs, headers)
  if (rawContent.includes('## Request')) {
    const blocks = rawContent.split(/^## Request\s+/m);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const firstLineEnd = block.indexOf('\n');
      const url = (firstLineEnd !== -1 ? block.slice(0, firstLineEnd) : block).trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      const rest = firstLineEnd !== -1 ? block.slice(firstLineEnd) : '';
      const statusMatch = rest.match(/^Status:\s*(\d+)/m);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

      const startTimeMatch = rest.match(/startTime[:=]\s*([\d.]+)/i) || rest.match(/start[:=]\s*([\d.]+)/i);
      const durationMatch = rest.match(/duration[:=]\s*([\d.]+)/i) || rest.match(/time[:=]\s*([\d.]+)/i);
      const startTime = startTimeMatch ? parseFloat(startTimeMatch[1]) : null;
      const duration = durationMatch ? parseFloat(durationMatch[1]) : null;

      const responseHeaders = {};
      const respIdx = rest.indexOf('### Response Headers');
      if (respIdx !== -1) {
        const section = rest.slice(respIdx).split(/^###\s+(?!Response Headers)/m)[0];
        for (const line of section.split('\n')) {
          const m = line.match(/^-\s*([A-Za-z0-9-]+):(.*)$/);
          if (m && FILL_HEADERS.includes(m[1].toLowerCase())) responseHeaders[m[1].toLowerCase()] = m[2].trim();
        }
      }

      items.push({ url, status, startTime, duration, responseHeaders, source: 'block' });
      seen.add(url);
    }
  }

  // Match "reqid=<id> GET/POST <url> [<status>]" lines from list_network_requests (may be truncated)
  const lineRegex = /reqid=(\d+)\s+(?:GET|POST|OPTIONS|HEAD)\s+(\S+)([^\n]*)/g;
  let match;
  while ((match = lineRegex.exec(rawContent)) !== null) {
    const url = match[2];
    const tail = match[3] || '';
    if (tail.includes('<truncated>') || url.endsWith('...')) continue; // the tool cut the URL: unusable
    if (seen.has(url)) continue; // a full block for the same URL exists
    const statusMatch = tail.match(/\[(\d+)\]/);
    items.push({
      url,
      status: statusMatch ? parseInt(statusMatch[1], 10) : 200,
      reqid: parseInt(match[1], 10),
      source: 'list'
    });
    seen.add(url);
  }

  return items;
}

export function extractNetworkData(rawInput) {
  const items = typeof rawInput === 'string' ? parseNetworkRaw(rawInput) : (Array.isArray(rawInput) ? rawInput : (rawInput.requests || rawInput.data || []));
  const requests = [];
  const libraries = [];

  for (const item of items) {
    const url = item.url || item.request?.url || item.response?.url || (typeof item === 'string' ? item : '');
    if (!url) continue;

    const status = item.status ?? item.response?.status ?? null;
    const startTime = item.timing?.startTime ?? item.startTime ?? item.time ?? null;
    const duration = item.timing?.duration ?? item.duration ?? null;

    const rh = item.responseHeaders || {};
    const idList = v => (v === undefined || v === null || v === '') ? [] : String(v).split(',').map(x => x.trim()).filter(x => x !== '');
    const fill = Object.keys(rh).length ? {
      lineItemIds: idList(rh['google-lineitem-id']),
      creativeIds: idList(rh['google-creative-id']),
      mediationGroupId: rh['google-mediationgroup-id'] ?? null,
      date: rh['date'] ?? null,
      contentLength: rh['content-length'] ? parseInt(rh['content-length'], 10) : null
    } : null;

    if (url.includes('/gampad/ads')) {
      try {
        const parsed = parseAdRequestUrl(url);
        requests.push({
          url,
          status,
          startTime,
          duration,
          ...parsed,
          fill
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
    console.error('Usage: node network-extract.js <network-raw.txt> [-o <network.json>]');
    process.exit(1);
  }

  try {
    const rawContent = readFileSync(inputFile, 'utf8');
    const result = extractNetworkData(rawContent);
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
