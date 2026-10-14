// R04: No active size fits the viewport or container
// Severity: Medium
// Evidence: all sizes wider than viewport.w or than dom.boundingRect.width (1x1 and fluid fit any container)

export default function r04ViewportFit(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];
  const vpW = snapshot?.meta?.viewport?.w || 0;

  for (const slot of slots) {
    // An empty active size mapping suppresses the slot at this viewport; it is not a sizing defect.
    const mappedSizesAvailable = Array.isArray(slot.viewportSizes);
    const rawSizes = mappedSizesAvailable ? slot.viewportSizes : (slot.sizes || []);
    if (!rawSizes.length) continue;
    const sizeSource = mappedSizesAvailable ? 'active viewport sizes' : 'declared sizes';

    // 1x1 and fluid fit any container or viewport
    const hasFlexibleSize = rawSizes.some(s => s === 'fluid' || (Array.isArray(s) && s[0] === 1 && s[1] === 1));
    if (hasFlexibleSize) continue;

    const fixedSizes = rawSizes.filter(s => Array.isArray(s) && s.length >= 2);
    if (!fixedSizes.length) continue;

    const allWiderThanViewport = vpW > 0 && fixedSizes.every(s => s[0] > vpW);

    if (allWiderThanViewport) {
      findings.push({
        id: 'R04',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `all ${sizeSource} [${fixedSizes.map(s => `${s[0]}×${s[1]}`).join(', ')}] exceed viewport width (${vpW}px)`,
        fix: `configure responsive sizeMapping or add smaller creative sizes for narrow viewports`
      });
      continue;
    }

    const containerW = slot.dom?.boundingRect?.width || 0;
    if (!slot.frame && slot.dom?.exists && slot.dom?.cssDisplay !== 'none' && containerW > 0 && fixedSizes.every(s => s[0] > containerW)) {
      findings.push({
        id: 'R04',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `all ${sizeSource} [${fixedSizes.map(s => `${s[0]}×${s[1]}`).join(', ')}] exceed container #${slot.elementId || 'slot'} width (${containerW}px)`,
        fix: `configure responsive sizeMapping or include creative sizes that fit within the ${containerW}px container`
      });
    }
  }

  return findings;
}
