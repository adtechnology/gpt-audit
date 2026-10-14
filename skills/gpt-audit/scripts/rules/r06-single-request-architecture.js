// R06: Multi-slot batching not observed
// Severity: Low
// Compressed fields cannot establish SRA configuration. Repeated requests for one slot do not add slots.

import { summarizeBatching } from '../batching.js';

export default function r06SingleRequestArchitecture(snapshot, network) {
  const batching = summarizeBatching(network);
  if (batching.observed !== false || batching.uniqueSingleSlotCount < 2) return [];
  const repeated = batching.repeatedSingleSlotRequestCount;
  const lazy = snapshot?.gpt?.config?.lazyLoad || snapshot?.gpt?.pubadsConfig?.lazyLoad;
  return [{
    id: 'R06',
    severity: 'low',
    slot: null,
    evidence: `multi-slot batching was not observed: ${batching.singleSlotRequestCount} display requests each contained one slot, covering ${batching.uniqueSingleSlotCount} distinct slot identities${repeated ? ` (${repeated} repeated request${repeated === 1 ? '' : 's'} excluded from the distinct-slot count)` : ''}; configured SRA state cannot be inferred from this${lazy ? '; lazy loading is configured' : ''}. Separate lazy-load or refresh requests may be intentional`,
    fix: `review whether compatible initial slots can be requested together; keep separate requests where intentional lazy loading or refresh requires them`
  }];
}
