// R01: Slot defined but never requested or displayed
// Severity: High
// Evidence: slot has no response, no dom.queryId, and no gampad/ads row names its ad unit

export default function r01SlotNeverDisplayed(snapshot, network) {
  const findings = [];
  const slots = snapshot?.slots || [];
  const requests = network?.requests || [];
  const events = snapshot?.events || [];

  const requestedAdUnits = new Set();
  const requestedDids = new Set();

  for (const req of requests) {
    if (req.adUnits && Array.isArray(req.adUnits)) {
      for (const au of req.adUnits) requestedAdUnits.add(au);
    }
    if (req.iu) requestedAdUnits.add(req.iu);
    if (req.raw?.dids) {
      const dids = req.raw.dids.split(',');
      for (const d of dids) requestedDids.add(d.trim());
    }
  }

  for (const slot of slots) {
    const hasResponse = slot.response !== null && typeof slot.response === 'object';
    const hasQueryId = !!slot.dom?.queryId;
    const hasNetworkRequest = (slot.adUnitPath && requestedAdUnits.has(slot.adUnitPath)) ||
                              (slot.elementId && requestedDids.has(slot.elementId));
    const hasEvent = events.some(e => e.slotElementId === slot.elementId &&
      (e.name === 'slotRequested' || e.name === 'slotResponseReceived' || e.name === 'slotRenderEnded'));

    if (!hasResponse && !hasQueryId && !hasNetworkRequest && !hasEvent) {
      findings.push({
        id: 'R01',
        severity: 'high',
        slot: slot.elementId || null,
        evidence: `slot ${slot.elementId || '(unknown)'} (${slot.adUnitPath || 'unknown path'}) is defined in pubads but has no queryId, received no response, and no ad request was sent`,
        fix: `call googletag.display("${slot.elementId || 'slot'}") or remove the slot definition`
      });
    }
  }

  return findings;
}
