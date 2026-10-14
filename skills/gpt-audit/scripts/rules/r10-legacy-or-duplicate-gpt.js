// R10: Legacy or duplicate gpt.js
// Severity: Medium
// Evidence: legacyHost true, more than one script tag, or async false

export default function r10LegacyOrDuplicateGpt(snapshot) {
  const findings = [];
  const gpt = snapshot?.gpt || {};
  const scriptTags = gpt.scriptTags || [];

  if (gpt.legacyHost) {
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `gpt.js is loaded from deprecated legacy host googletagservices.com`,
      fix: `load GPT from https://securepubads.g.doubleclick.net/tag/js/gpt.js`
    });
  }

  if (scriptTags.length > 1) {
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `multiple (${scriptTags.length}) gpt.js script tags detected in page`,
      fix: `remove redundant gpt.js script tags so exactly one tag loads GPT`
    });
  }

  const syncTags = scriptTags.filter(s => s.async === false);
  if (syncTags.length > 0) {
    findings.push({
      id: 'R10',
      severity: 'medium',
      slot: null,
      evidence: `gpt.js script tag is loaded synchronously without the async attribute`,
      fix: `add async attribute to the <script src=".../gpt.js"> tag to prevent render blocking`
    });
  }

  return findings;
}
