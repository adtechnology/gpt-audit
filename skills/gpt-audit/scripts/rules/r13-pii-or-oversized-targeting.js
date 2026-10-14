// R13: Targeting value looks like PII or ad request URL is oversized
// Severity: High
// Evidence: Email/phone pattern or explicit PII key in page/slot targeting or cust_params/scp/prev_scp; or ad request URL > 8000 chars

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const PII_KEY_RE = /^(e?-?mail|user_?email|phone|phone_?number|tel|telephone|mobile|ssn|social_?security)$/i;
const MAX_URL_LENGTH = 8000;

function detectPiiInValue(key, rawVal) {
  const vals = Array.isArray(rawVal) ? rawVal : [rawVal];
  for (const item of vals) {
    if (item === null || item === undefined) continue;
    const str = String(item).trim();
    if (!str) continue;
    if (EMAIL_RE.test(str)) {
      return { kind: 'email', sample: str };
    }
    if (PII_KEY_RE.test(key)) {
      if (PHONE_RE.test(str) && str.replace(/\D/g, '').length >= 7) {
        return { kind: 'phone', sample: str };
      }
      return { kind: `PII key "${key}"`, sample: str };
    }
  }
  return null;
}

export default function r13PiiOrOversizedTargeting(snapshot, network) {
  const findings = [];
  const reportedKeys = new Set();

  // 1. Check page-level targeting
  const pageTargeting = snapshot?.gpt?.pageTargeting || {};
  for (const [k, v] of Object.entries(pageTargeting)) {
    const hit = detectPiiInValue(k, v);
    if (hit) {
      reportedKeys.add(`key:${k}`);
      findings.push({
        id: 'R13',
        severity: 'high',
        slot: null,
        evidence: `page targeting key "${k}" contains raw PII (${hit.kind}: "${hit.sample}")`,
        fix: `remove "${k}" from pubads().setTargeting() or replace with a salted SHA-256 hash / PPID`
      });
    }
  }

  // 2. Check slot-level targeting
  for (const slot of (snapshot?.slots || [])) {
    const targeting = slot.targeting || {};
    for (const [k, v] of Object.entries(targeting)) {
      const dedupId = `slot:${slot.elementId || '?'}:${k}`;
      if (reportedKeys.has(dedupId) || reportedKeys.has(`key:${k}`)) continue;
      const hit = detectPiiInValue(k, v);
      if (hit) {
        reportedKeys.add(dedupId);
        findings.push({
          id: 'R13',
          severity: 'high',
          slot: slot.elementId || null,
          evidence: `slot #${slot.elementId || '?'} targeting key "${k}" contains raw PII (${hit.kind}: "${hit.sample}")`,
          fix: `remove "${k}" from slot.setTargeting() to avoid sending cleartext PII to Google Ad Manager`
        });
      }
    }
  }

  // 3. Check network ad request cust_params, scp, prev_scp, and URL length
  const requests = network?.requests || [];
  const oversizedReqs = [];

  for (const req of requests) {
    const paramSources = [
      req.cust_params,
      req.scp,
      ...(Array.isArray(req.prev_scp) ? req.prev_scp : [])
    ];
    for (const src of paramSources) {
      if (!src || typeof src !== 'object') continue;
      for (const [k, v] of Object.entries(src)) {
        if (reportedKeys.has(`key:${k}`)) continue;
        const hit = detectPiiInValue(k, v);
        if (hit) {
          reportedKeys.add(`key:${k}`);
          findings.push({
            id: 'R13',
            severity: 'high',
            slot: null,
            evidence: `ad request targeting parameter "${k}" contains raw PII (${hit.kind}: "${hit.sample}")`,
            fix: `strip "${k}" before calling setTargeting() so PII is never transmitted in gampad/ads URLs`
          });
        }
      }
    }

    const len = req.urlLength ?? (req.url ? req.url.length : 0);
    if (len > MAX_URL_LENGTH) {
      oversizedReqs.push(len);
    }
  }

  if (oversizedReqs.length > 0) {
    const maxLen = Math.max(...oversizedReqs);
    findings.push({
      id: 'R13',
      severity: 'high',
      slot: null,
      evidence: `${oversizedReqs.length} ad request URL(s) exceed ${MAX_URL_LENGTH} chars (max ${maxLen} chars), risking truncation or HTTP 413/414`,
      fix: `prune redundant targeting key-values or limit SRA batch size to keep gampad/ads URLs under ${MAX_URL_LENGTH} characters`
    });
  }

  return findings;
}
