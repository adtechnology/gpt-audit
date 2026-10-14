// R07: Mixed correlators in one page view
// Severity: High
// Evidence: more than one distinct correlator across display requests of one load (video requests excluded)

export default function r07MixedCorrelators(snapshot, network) {
  const findings = [];
  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display' && r.correlator);

  if (displayRequests.length <= 1) return findings;

  const correlators = Array.from(new Set(displayRequests.map(r => String(r.correlator))));

  if (correlators.length > 1) {
    findings.push({
      id: 'R07',
      severity: 'high',
      slot: null,
      evidence: `mixed correlators detected: ${correlators.length} distinct correlator IDs across display requests (${correlators.join(', ')})`,
      fix: `ensure all initial slots are defined before services are enabled; check for repeated display() calls or page-level targeting resets`
    });
  }

  return findings;
}
