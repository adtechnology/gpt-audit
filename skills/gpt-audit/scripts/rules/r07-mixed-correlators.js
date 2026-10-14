// R07: Mixed correlators in one page view
// Severity: High
// Evidence: more than one distinct correlator across display requests of one load (video requests excluded).
// When every correlator also carries its own pvsid, the requests come from separate GPT instances
// (ad-server passback creatives or wrappers that load their own gpt.js) rather than from repeated display() calls.

export default function r07MixedCorrelators(snapshot, network) {
  const findings = [];
  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display' && r.correlator);

  if (displayRequests.length <= 1) return findings;

  const correlators = Array.from(new Set(displayRequests.map(r => String(r.correlator))));
  if (correlators.length <= 1) return findings;

  const pvsids = new Set(displayRequests.filter(r => r.pvsid).map(r => String(r.pvsid)));
  const frameInstances = (snapshot?.frames || []).filter(f => f && f.version).length;
  const separateInstances = pvsids.size > 1 && pvsids.size >= correlators.length;

  if (separateInstances) {
    findings.push({
      id: 'R07',
      severity: 'high',
      slot: null,
      evidence: `mixed correlators detected: ${correlators.length} distinct correlator IDs across display requests (${correlators.join(', ')}), each with its own pvsid (${pvsids.size} page-view ids)${frameInstances ? `; ${frameInstances} GPT instance(s) found in iframes` : ''}: every request comes from a separate GPT instance`,
      fix: `consolidate GAM into one GPT instance per page: define the slots in the main frame and let passbacks or wrappers call googletag.pubads().refresh([slot]) instead of loading their own gpt.js; a single page view then shares one correlator and one pvsid`
    });
  } else {
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
