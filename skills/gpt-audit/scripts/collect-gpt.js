// collect-gpt.js — Phase 1 (see docs/PLAN.md, "Phase 1 — collector").
//
// Runs INSIDE the audited page via the chrome-devtools MCP tool `evaluate_script`.
// Contract: one self-contained async function, no imports, no dependencies, under 10 KB,
// every field in its own try/catch (failures land in `errors[]`), never throws,
// resolves within 1500 ms. Leaves nothing behind except `window.__gptAudit`.
//
// Returns the snapshot object with the groups: meta, gpt, slots[], neighbours{prebid, consent, apstag}, errors[].
// opts.probe === true attaches GPT event listeners (slotRequested, slotResponseReceived,
// slotRenderEnded, impressionViewable, slotOnload) into window.__gptAudit.events; a second call
// with { probe: false } returns them.
//
// TODO (Phase 1): implement. Keep the signature below; the SKILL.md procedure and the tests depend on it.

async function collectGpt(opts = {}) {
  const errors = [{ field: 'collector', message: 'not implemented yet (Phase 1)' }];
  return {
    meta: { url: location.href, title: document.title, collectorVersion: '0.0.0' },
    gpt: { present: typeof window.googletag !== 'undefined' },
    slots: [],
    neighbours: {},
    errors,
  };
}

// Allow `node --check` and unit tests to load this file; the browser only needs the function above.
if (typeof module !== 'undefined' && module.exports) module.exports = { collectGpt };
