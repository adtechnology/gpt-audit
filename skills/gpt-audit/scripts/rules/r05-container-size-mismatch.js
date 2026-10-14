// R05: Insufficient explicit height reservation, or creative overflow
// Severity: Medium
// A larger wrapper can intentionally reserve space. A current box or a legacy boolean cannot measure CLS.

export default function r05ContainerSizeMismatch(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];

  for (const slot of slots) {
    if (slot.render?.isEmpty) continue;

    const renderSize = slot.render?.size;
    if (renderSize === 'fluid') continue;
    if (Array.isArray(renderSize) && renderSize[0] === 1 && renderSize[1] === 1) continue;

    const ifrW = slot.iframe?.w || (Array.isArray(renderSize) ? renderSize[0] : 0);
    const ifrH = slot.iframe?.h || (Array.isArray(renderSize) ? renderSize[1] : 0);

    // Skip tracking pixels or non-rendered slots
    if (ifrW <= 1 && ifrH <= 1) continue;
    if (!slot.dom?.exists) continue;

    const reservation = slot.dom.reservation;
    const reservedHeight = reservation?.height;
    // Concrete CSS evidence can come from the slot itself or its wrapper. Frame collectors cannot assess
    // the outer page's reservation, so keep reservation risk findings to main-frame slots.
    if (!slot.frame && Number.isFinite(reservedHeight) && reservedHeight >= 0 && ifrH > reservedHeight + 2) {
      const reservingElement = reservation.elementId ? `#${reservation.elementId}` : 'a nearby wrapper';
      findings.push({
        id: 'R05',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `observed ${reservation.source || 'CSS height'} reservation on ${reservingElement} (${reservedHeight}px) is ${Math.round(ifrH - reservedHeight)}px smaller than rendered creative height (${ifrH}px); this is layout-shift risk, not a measured CLS value`,
        fix: `reserve enough height on ${reservingElement} for the expected creative sizes at this breakpoint (${ifrH}px rendered here); measure layout shifts to verify the effect`
      });
      continue;
    }

    // Never flag excess space as a defect. A smaller measured box demonstrates overflow; clipping is
    // only asserted when its CSS overflow policy is known. Legacy reservedHeight=false alone is inconclusive.
    const rect = slot.dom.boundingRect;
    const overflow = [];
    if (rect?.width > 0 && ifrW > rect.width + 2) overflow.push({ axis: 'width', box: rect.width, creative: ifrW, policy: slot.dom.cssOverflowX });
    if (rect?.height > 0 && ifrH > rect.height + 2) overflow.push({ axis: 'height', box: rect.height, creative: ifrH, policy: slot.dom.cssOverflowY });
    if (!overflow.length) continue;
    const clipped = overflow.filter(o => o.policy === 'hidden' || o.policy === 'clip');
    findings.push({
      id: 'R05',
      severity: 'medium',
      slot: slot.elementId || null,
      evidence: `creative exceeds measured container #${slot.elementId || 'slot'}: ${overflow.map(o => `${o.axis} ${o.creative}px vs ${o.box}px`).join(', ')}${clipped.length ? `; CSS overflow clips ${clipped.map(o => o.axis).join(' and ')}` : '; overflow may affect surrounding content'}; no layout shift or CLS value was measured`,
      fix: clipped.length ? `review the container's clipping policy and dimensions so the creative fits without cropping` : `review the creative's overflow and the container dimensions; reserve expected sizes per breakpoint where content can move`
    });
  }

  return findings;
}
