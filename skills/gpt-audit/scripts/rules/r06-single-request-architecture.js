// R06: Single Request Architecture off
// Severity: Low
// Evidence: number of display gampad/ads rows >= requested slots and no iu_parts (video requests excluded)

export default function r06SingleRequestArchitecture(snapshot, network) {
  const findings = [];
  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display');

  if (displayRequests.length === 0) return findings;

  const hasSra = displayRequests.some(r => r.isSra || r.iu_parts || r.enc_prev_ius);
  if (hasSra) return findings;

  const slots = snapshot?.slots || [];
  const requestedSlots = slots.filter(s => s.dom?.queryId || s.render || (snapshot?.events || []).some(e => e.slotElementId === s.elementId && e.name === 'slotRequested'));
  const threshold = Math.max(2, requestedSlots.length);

  if (displayRequests.length >= 2 && displayRequests.length >= requestedSlots.length) {
    findings.push({
      id: 'R06',
      severity: 'low',
      slot: null,
      evidence: `Single Request Architecture (SRA) is disabled: ${displayRequests.length} display requests fired independently without iu_parts batching`,
      fix: `call googletag.pubads().enableSingleRequest() before googletag.enableServices()`
    });
  }

  return findings;
}
