// R18: Several slots share one ad unit path
// Severity: Low
// Evidence: two or more slots with different elementIds use the same adUnitPath and carry no position key
//           (pos / position / slot / miSlot / contId with distinct values), so GAM reporting cannot tell them apart.

const POSITION_KEYS = ['pos', 'position', 'slot', 'slotname', 'slot_name', 'miSlot', 'contId', 'placement', 'placementId'];

export default function r18SharedAdUnitPath(snapshot) {
  const findings = [];
  const slots = (snapshot?.slots || []).filter(s => s && s.adUnitPath && s.elementId);
  const byPath = new Map();
  for (const s of slots) {
    if (!byPath.has(s.adUnitPath)) byPath.set(s.adUnitPath, []);
    byPath.get(s.adUnitPath).push(s);
  }

  for (const [path, group] of byPath) {
    const ids = Array.from(new Set(group.map(s => s.elementId)));
    if (ids.length < 2) continue;

    const key = POSITION_KEYS.find(k => group.every(s => s.targeting && s.targeting[k] !== undefined && String(s.targeting[k]) !== ''));
    if (key) {
      const values = new Set(group.map(s => String(s.targeting[key])));
      if (values.size === ids.length) continue; // positions are distinguishable through targeting
    }

    findings.push({
      id: 'R18',
      severity: 'low',
      slot: null,
      evidence: `${ids.length} slots share the ad unit path ${path} without a distinguishing position key (${ids.join(', ')})`,
      fix: `give each position its own ad unit (or child unit) under ${path}, or set a position key-value such as pos=<n> on every slot so reports and line items can target positions`
    });
  }
  return findings;
}
