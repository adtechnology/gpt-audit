// R04: No requested size fits the viewport
// Severity: Medium
// Evidence: all sizes wider than viewport.w (1x1 and fluid fit any container)

export default function r04ViewportFit(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];
  const vpW = snapshot?.meta?.viewport?.w || 0;

  if (vpW <= 0) return findings;

  for (const slot of slots) {
    const rawSizes = slot.sizes || [];
    if (!rawSizes.length) continue;

    // 1x1 and fluid fit any container or viewport
    const hasFlexibleSize = rawSizes.some(s => s === 'fluid' || (Array.isArray(s) && s[0] === 1 && s[1] === 1));
    if (hasFlexibleSize) continue;

    const fixedSizes = rawSizes.filter(s => Array.isArray(s) && s.length >= 2);
    if (!fixedSizes.length) continue;

    const allWiderThanViewport = fixedSizes.every(s => s[0] > vpW);

    if (allWiderThanViewport) {
      findings.push({
        id: 'R04',
        severity: 'medium',
        slot: slot.elementId || null,
        evidence: `all requested sizes [${fixedSizes.map(s => `${s[0]}×${s[1]}`).join(', ')}] exceed viewport width (${vpW}px)`,
        fix: `configure responsive sizeMapping or add smaller creative sizes for narrow viewports`
      });
    }
  }

  return findings;
}
