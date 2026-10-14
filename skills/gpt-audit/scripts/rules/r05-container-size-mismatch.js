// R05: Container size differs from rendered creative
// Severity: Medium
// Evidence: dom.rect vs iframe.w/h differ by more than 2 px, or reservedHeight false (1x1 and fluid exempt)

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

    // Check reservedHeight on container
    if (slot.dom.reservedHeight === false) {
      findings.push({
        id: 'R05',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `container #${slot.elementId} has no reserved height (reservedHeight: false), risking Cumulative Layout Shift (CLS)`,
        fix: `reserve container min-height per breakpoint via CSS matching expected creative heights (CLS prevention)`
      });
      continue;
    }

    // Check container height vs creative height
    if (slot.dom.boundingRect && slot.dom.boundingRect.height > 0 && ifrH > 1) {
      const hDiff = Math.abs(slot.dom.boundingRect.height - ifrH);
      if (hDiff > 2) {
        findings.push({
          id: 'R05',
          severity: 'medium',
          slot: slot.elementId || null,
          evidence: `container #${slot.elementId} height (${slot.dom.boundingRect.height}px) differs from creative height (${ifrH}px) by ${Math.round(hDiff)}px`,
          fix: `reserve container min-height matching creative height (${ifrH}px) to eliminate layout shift`
        });
      }
    }
  }

  return findings;
}
