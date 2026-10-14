// R01: A defined slot has no observed request. Hidden/inactive slots need validation.

// MCM network codes use a comma in the slot path and may use a colon on the wire.
const normalizePath = path => typeof path === 'string' ? path.replace(/^(\/\d+):(?=\d+\/)/, '$1,') : path;
const requestIds = req => {
  const dids = req.slotElementIds ?? req.dids ?? req.raw?.dids;
  return (Array.isArray(dids) ? dids : typeof dids === 'string' ? dids.split(/[~,]/) : [])
    .map(id => String(id).trim()).filter(Boolean);
};

export default function r01SlotNeverDisplayed(snapshot, network) {
  const findings = [];
  const slots = snapshot?.slots || [];
  const requests = network?.requests || [];
  const events = snapshot?.events || [];
  const incompleteCapture = requests.some(req => req.kind !== 'video' && (req.error || req.urlTruncated));

  const requestedAdUnits = new Set();
  const requestedDids = new Set();

  for (const req of requests.filter(req => req.kind !== 'video')) {
    if (req.error || req.urlTruncated) continue;
    const ids = requestIds(req);
    for (const id of ids) requestedDids.add(id);
    // Explicit element IDs are stronger evidence than a path shared by many slots.
    // Use ad-unit matching only for requests that do not identify their elements.
    if (ids.length) continue;
    for (const path of Array.isArray(req.adUnits) ? req.adUnits : []) requestedAdUnits.add(normalizePath(path));
    if (req.iu) requestedAdUnits.add(normalizePath(req.iu));
  }

  for (const slot of slots) {
    const hasResponse = slot.response !== null && typeof slot.response === 'object';
    const hasQueryId = !!slot.dom?.queryId;
    const hasNetworkRequest = (slot.adUnitPath && requestedAdUnits.has(normalizePath(slot.adUnitPath))) ||
                              (slot.elementId && requestedDids.has(slot.elementId));
    const hasEvent = events.some(e => e.slotElementId === slot.elementId &&
      (e.name === 'slotRequested' || e.name === 'slotResponseReceived' || e.name === 'slotRenderEnded'));

    if (!hasResponse && !hasQueryId && !hasNetworkRequest && !hasEvent) {
      const dom = slot.dom || {};
      const rect = dom.boundingRect;
      const hidden = dom.hidden === true || dom.cssDisplay === 'none' ||
        ['hidden', 'collapse'].includes(dom.cssVisibility) || dom.contentVisibility === 'hidden';
      const inactive = hidden || (rect && rect.width === 0 && rect.height === 0) ||
        (snapshot?.gpt?.config?.lazyLoad && dom.inViewportNow === false);
      findings.push({
        id: 'R01',
        severity: inactive || incompleteCapture ? 'low' : 'high',
        ...(inactive || incompleteCapture ? { status: 'needs-validation' } : {}),
        slot: slot.elementId || null,
        evidence: `slot ${slot.elementId || '(unknown)'} (${slot.adUnitPath || 'unknown path'}) has no observed queryId, response, request event, or matching complete network request${inactive ? '; its container is hidden or inactive, so this may be intentional' : ' during this capture'}${incompleteCapture ? '; incomplete request rows prevent establishing that no request was sent' : ''}`,
        fix: `verify the slot's breakpoint, lazy-load and activation conditions, then inspect its display registration and request lifecycle; change the integration only if the slot should have requested an ad in this state`
      });
    }
  }

  return findings;
}
