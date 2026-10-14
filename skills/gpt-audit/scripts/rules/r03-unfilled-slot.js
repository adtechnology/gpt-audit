// R03: Unfilled slot
// Severity: Medium
// Evidence: render.isEmpty === true after ad request

export default function r03UnfilledSlot(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];

  for (const slot of slots) {
    // If render information is present, use render.isEmpty
    if (slot.render && typeof slot.render.isEmpty === 'boolean') {
      if (slot.render.isEmpty) {
        findings.push({
          id: 'R03',
          severity: 'medium',
          slot: slot.elementId || null,
          evidence: `slot ${slot.elementId || '(unknown)'} (${slot.adUnitPath || ''}) returned empty (render.isEmpty: true)`,
          fix: `check line-item targeting, inventory pricing/floors, and advertiser demand for ${slot.adUnitPath || 'this ad unit'}`
        });
      }
      continue;
    }

    // Fallback if render event not captured: queryId present but no iframe and no response
    const wasRequested = !!slot.dom?.queryId;
    const hasResponse = slot.response && (slot.response.lineItemId !== null || slot.response.advertiserId !== null);
    const hasIframe = slot.iframe?.present && (slot.iframe.h > 0 || slot.iframe.w > 0);

    if (wasRequested && !hasResponse && !hasIframe) {
      findings.push({
        id: 'R03',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `slot ${slot.elementId || '(unknown)'} was requested (queryId ${slot.dom.queryId}) but no creative rendered and response is null`,
        fix: `check line-item targeting, inventory pricing/floors, and advertiser demand for ${slot.adUnitPath || 'this ad unit'}`
      });
    }
  }

  return findings;
}
