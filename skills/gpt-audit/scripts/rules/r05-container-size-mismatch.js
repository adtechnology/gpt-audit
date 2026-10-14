// R05: A visible, fixed-size creative exceeds its container or a clipping ancestor.
// A late snapshot cannot establish a layout shift or prove that space was unreserved.

const clips = value => value === 'hidden' || value === 'clip' || value === 'scroll' || value === 'auto';
const dimension = value => Number.parseFloat(value) || 0;

export default function r05ContainerSizeMismatch(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];

  for (const slot of slots) {
    if (slot.render?.isEmpty) continue;

    const dom = slot.dom;
    if (!dom?.exists || dom.hidden === true || dom.cssDisplay === 'none' ||
        ['hidden', 'collapse'].includes(dom.cssVisibility) || dom.contentVisibility === 'hidden') continue;

    const renderSize = slot.render?.size;
    if (renderSize === 'fluid' || renderSize === 'native' || slot.render?.isNative === true || slot.isNative === true) continue;
    if (!renderSize && (slot.sizes || []).some(size => size === 'fluid' || size === 'native')) continue;
    if (Array.isArray(renderSize) && renderSize[0] === 1 && renderSize[1] === 1) continue;

    const ifrW = slot.iframe?.w || (Array.isArray(renderSize) ? renderSize[0] : 0);
    const ifrH = slot.iframe?.h || (Array.isArray(renderSize) ? renderSize[1] : 0);

    // Skip tracking pixels and slots for which no usable rendered geometry exists.
    if (ifrW <= 1 && ifrH <= 1) continue;
    const rect = dom.boundingRect;
    if (!rect || rect.width <= 1 || rect.height <= 1) continue;

    const ancestor = dom.clippingAncestor;
    const ancestorClipsWidth = ancestor?.width > 1 && clips(ancestor.overflowX) && ifrW - ancestor.width > 2;
    const ancestorClipsHeight = ancestor?.height > 1 && clips(ancestor.overflowY) && ifrH - ancestor.height > 2;
    const reservedAncestorHeight = dom.reservation?.ancestor && (dom.reservation.evidence || [])
      .filter(entry => entry.source === 'ancestor')
      .some(entry => Math.max(dimension(entry.minHeight), dimension(entry.height)) >= ifrH - 2);
    const tooNarrow = ifrW - rect.width > 2;
    const tooShort = ifrH - rect.height > 2 && (!reservedAncestorHeight || clips(dom.overflowY));

    if (!tooNarrow && !tooShort && !ancestorClipsWidth && !ancestorClipsHeight) continue;
    const clipping = ancestorClipsWidth || ancestorClipsHeight;
    const ownClipping = (tooNarrow && clips(dom.overflowX)) || (tooShort && clips(dom.overflowY));
    findings.push({
      id: 'R05',
      severity: 'medium',
      ...(!clipping && !ownClipping ? { status: 'needs-validation' } : {}),
      slot: slot.elementId || null,
      evidence: clipping
        ? `creative in #${slot.elementId} (${ifrW}×${ifrH}px) exceeds clipping ancestor #${ancestor.elementId || '(unnamed)'} (${ancestor.width}×${ancestor.height}px)`
        : `creative in #${slot.elementId} (${ifrW}×${ifrH}px) exceeds its container (${rect.width}×${rect.height}px)${clips(dom.overflowX) || clips(dom.overflowY) ? ' with overflow clipping enabled' : '; inspect whether this overflow is intentional'}`,
      fix: `check the intended creative placement and clipping styles; provide sufficient container or ancestor space for the active fixed-size creative. Use layout-shift measurements to assess CLS separately`
    });
  }

  return findings;
}
