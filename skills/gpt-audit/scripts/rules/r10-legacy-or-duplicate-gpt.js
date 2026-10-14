// R10: Legacy or duplicate gpt.js
// Severity: Medium
// Evidence: legacyHost true, more than one script tag, or async false (snapshot); as a fallback for frames the
//           collector cannot read, gpt.js loads from googletagservices.com or more than one gpt.js load in network.libraries.

export default function r10LegacyOrDuplicateGpt(snapshot, network) {
  const findings = [];
  const gpt = snapshot?.gpt || {};
  const scriptTags = gpt.scriptTags || [];
  const libs = (network?.libraries || []).filter(l => l.name === 'gpt.js');
  const legacyLibs = libs.filter(l => (l.url || '').includes('googletagservices.com'));

  if (gpt.legacyHost || legacyLibs.length > 0) {
    const frames = Array.from(new Set(scriptTags.filter(s => (s.src || '').includes('googletagservices.com') && s.frame).map(s => s.frame)));
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `gpt.js is loaded from deprecated legacy host googletagservices.com${frames.length ? ` inside ${frames.length} iframe(s) (${frames.slice(0, 5).join(', ')}${frames.length > 5 ? '…' : ''})` : ''}${!gpt.legacyHost && legacyLibs.length ? ` (${legacyLibs.length} load(s) seen in the network log)` : ''}`,
      fix: `load GPT from https://securepubads.g.doubleclick.net/tag/js/gpt.js`
    });
  }

  if (scriptTags.length > 1) {
    const inFrames = scriptTags.filter(s => s.frame).length;
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `multiple (${scriptTags.length}) gpt.js script tags detected in page${inFrames ? ` (${scriptTags.length - inFrames} in the main frame, ${inFrames} in iframes)` : ''}`,
      fix: `remove redundant gpt.js script tags so exactly one tag loads GPT`
    });
  } else if (libs.length > 1 && libs.length > scriptTags.length) {
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `gpt.js was loaded ${libs.length} times in one page view (network log) while the page exposes ${scriptTags.length} script tag(s): extra GPT instances run in frames the collector cannot read`,
      fix: `load GPT once in the main frame; have creatives and wrappers reuse window.googletag instead of loading their own copy`
    });
  }

  const syncTags = scriptTags.filter(s => s.async === false);
  if (syncTags.length > 0) {
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `${syncTags.length} gpt.js script tag(s) loaded synchronously without the async attribute: ${syncTags.slice(0, 4).map(t => `${t.src || '?'}${t.frame ? ` (iframe ${t.frame})` : ' (main frame)'}`).join(', ')}${syncTags.length > 4 ? '…' : ''}`,
      fix: `add async attribute to the <script src=".../gpt.js"> tag to prevent render blocking`
    });
  }

  return findings;
}
