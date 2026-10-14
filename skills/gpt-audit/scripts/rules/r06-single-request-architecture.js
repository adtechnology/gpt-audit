// R06: Optional batching opportunity, never evidence of a serving failure.

export default function r06SingleRequestArchitecture(snapshot, network) {
  const findings = [];
  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display' && !r.error && !r.urlTruncated);

  if (displayRequests.length === 0) return findings;

  const hasSra = displayRequests.some(r => r.isSra || r.iu_parts || r.enc_prev_ius);
  if (hasSra || snapshot?.gpt?.config?.singleRequest === true) return findings;

  const identities = new Set();
  for (const req of displayRequests) {
    const dids = req.slotElementIds ?? req.dids ?? req.raw?.dids;
    const ids = Array.isArray(dids) ? dids : typeof dids === 'string' ? dids.split(/[~,]/).filter(Boolean) : [];
    for (const identity of ids.length ? ids.map(id => `id:${id}`) : (req.adUnits || (req.iu ? [req.iu] : [])).map(path => `path:${path}`)) identities.add(identity);
  }

  if (displayRequests.length >= 2 && identities.size >= 2) {
    findings.push({
      id: 'R06',
      severity: 'low',
      status: 'optimization',
      slot: null,
      evidence: `${displayRequests.length} display requests for at least ${identities.size} slot/ad-unit identities were observed without SRA batching; independent requests can be intentional for lazy loading, refresh, or header bidding`,
      fix: `if several slots are eligible at the same time, consider googletag.setConfig({ singleRequest: true }) before googletag.enableServices(); confirm that batching fits the site's request strategy`
    });
  }

  return findings;
}
