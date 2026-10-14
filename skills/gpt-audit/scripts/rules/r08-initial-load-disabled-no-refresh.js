// R08: Initial load disabled but nothing ever refreshed
// Severity: High
// Evidence: initialLoadDisabled true, zero gampad/ads display rows, no slotRequested events

import { initialRequestsMayBeMissing } from '../capture.js';

export default function r08InitialLoadDisabledNoRefresh(snapshot, network) {
  if (initialRequestsMayBeMissing(snapshot, network)) return [];
  const findings = [];
  const initialLoadDisabled = snapshot?.gpt?.initialLoadDisabled === true;

  if (!initialLoadDisabled) return findings;

  const displayRequests = (network?.requests || []).filter(r => r.kind === 'display');
  const events = snapshot?.events || [];
  const hasRequestedEvents = events.some(e => e.name === 'slotRequested' || e.name === 'slotResponseReceived');

  if (displayRequests.length === 0 && !hasRequestedEvents) {
    findings.push({
      id: 'R08',
      severity: 'high',
      slot: null,
      evidence: `pubads().disableInitialLoad() is active but no slots were ever refreshed (0 ad requests fired)`,
      fix: `ensure header-bidding auction completion or timeout callback invokes googletag.pubads().refresh()`
    });
  }

  return findings;
}
