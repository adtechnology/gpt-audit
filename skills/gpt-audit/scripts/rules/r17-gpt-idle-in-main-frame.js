// R17: GPT loaded in the main frame but never used there
// Severity: Low
// Evidence: gpt.present, zero main-frame slots, while GAM traffic (if any) comes from GPT instances in iframes
//           (ad-server passbacks, wrappers) or from a video player. The ~250 KB of gpt.js + pubads_impl are dead weight.

export default function r17GptIdleInMainFrame(snapshot, network) {
  const findings = [];
  const gpt = snapshot?.gpt || {};
  if (!gpt.present) return findings;

  const slots = snapshot?.slots || [];
  const mainSlots = slots.filter(s => !s.frame);
  const mainCount = typeof gpt.mainFrameSlotCount === 'number' ? gpt.mainFrameSlotCount : mainSlots.length;
  if (mainCount > 0) return findings;

  const frames = (snapshot?.frames || []).filter(f => f && (f.version || f.slotCount));
  const frameSlots = slots.filter(s => s.frame).length;
  const requests = network?.requests || [];
  const display = requests.filter(r => (r.kind || 'display') === 'display').length;
  const video = requests.filter(r => r.kind === 'video').length;

  const where = [];
  if (frames.length) where.push(`${frames.length} GPT instance(s) in iframes define ${frameSlots} slot(s)`);
  if (video) where.push(`${video} video (VAST) request(s)`);
  if (!frames.length && display) where.push(`${display} display request(s) from frames the collector could not read`);

  findings.push({
    id: 'R17',
    severity: 'low',
    slot: null,
    evidence: `gpt.js is loaded in the main frame (enableServices: ${gpt.pubadsReady ? 'called' : 'not called'}) but defines 0 slots${where.length ? '; GAM is reached elsewhere: ' + where.join(', ') : '; no GAM request was observed at all'}`,
    fix: frames.length
      ? 'move the GAM slots into the main-frame GPT instance (one defineSlot per position, passback via refresh()) and drop the per-iframe gpt.js loads, or remove the unused main-frame tag'
      : 'remove the unused gpt.js tag from the main frame, or define and display the slots it is meant to serve'
  });
  return findings;
}
