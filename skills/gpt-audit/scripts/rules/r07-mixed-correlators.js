// R07: Multiple correlators need request-group context. Refresh may change them.

export default function r07MixedCorrelators(snapshot, network) {
  const findings = [];
  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display' && r.correlator && !r.error && !r.urlTruncated);

  if (displayRequests.length <= 1) return findings;

  const correlators = Array.from(new Set(displayRequests.map(r => String(r.correlator))));

  if (correlators.length > 1) {
    const requestGroups = correlators.map(correlator => {
      const rows = displayRequests.filter(req => String(req.correlator) === correlator);
      return {
        correlator,
        requestCount: rows.length,
        adUnits: [...new Set(rows.flatMap(req => req.adUnits || (req.iu ? [req.iu] : [])))],
        elementIds: [...new Set(rows.flatMap(req => {
          const dids = req.slotElementIds ?? req.dids ?? req.raw?.dids;
          return Array.isArray(dids) ? dids : typeof dids === 'string' ? dids.split(/[~,]/).filter(Boolean) : [];
        }))],
        startTimes: rows.map(req => req.startTime).filter(time => time != null)
      };
    });
    findings.push({
      id: 'R07',
      severity: 'low',
      status: 'needs-validation',
      slot: null,
      evidence: `${correlators.length} distinct correlators occur across ${displayRequests.length} display requests (${correlators.join(', ')}); this alone does not establish incorrect grouping because refresh normally creates a new correlator`,
      requestGroups,
      fix: `compare the recorded request groups and timing with the intended initial-load, lazy-load and refresh lifecycle; investigate only groups that should have shared a correlator`
    });
  }

  return findings;
}
