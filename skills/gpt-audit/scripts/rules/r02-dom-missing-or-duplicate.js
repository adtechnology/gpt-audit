// R02: Slot div missing in DOM or duplicated
// Severity: High
// Evidence: dom.exists false, or two slots share elementId

export default function r02DomMissingOrDuplicate(snapshot) {
  const findings = [];
  const slots = snapshot?.slots || [];
  const idCounts = new Map();

  for (const slot of slots) {
    if (slot.elementId) {
      idCounts.set(slot.elementId, (idCounts.get(slot.elementId) || 0) + 1);
    }
  }

  const reportedDuplicates = new Set();

  for (const slot of slots) {
    if (!slot.dom?.exists) {
      findings.push({
        id: 'R02',
        severity: 'high',
        slot: slot.elementId || null,
        evidence: `slot container #${slot.elementId || '(no id)'} does not exist in the DOM`,
        fix: `ensure container <div id="${slot.elementId || 'slot'}"> exists in the DOM before calling display()`
      });
    }

    if (slot.elementId && (idCounts.get(slot.elementId) || 0) > 1 && !reportedDuplicates.has(slot.elementId)) {
      reportedDuplicates.add(slot.elementId);
      findings.push({
        id: 'R02',
        severity: 'high',
        slot: slot.elementId,
        evidence: `elementId "${slot.elementId}" is defined ${idCounts.get(slot.elementId)} times in pubads`,
        fix: `ensure unique container ids for each defined ad slot`
      });
    }
  }

  return findings;
}
