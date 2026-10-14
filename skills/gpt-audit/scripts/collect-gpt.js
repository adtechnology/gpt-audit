// collect-gpt.js — in-page snapshot collector (main frame + same-origin iframes).
async function collectGpt(opts = {}) {
  const errors = [], R = Math.round, W = window;
  const safe = (fn, f, d = null) => { try { const r = fn(); return r !== undefined ? r : d; } catch (e) { errors.push({ field: f, message: e.message }); return d; } };
  const trunc = (v, m = 200) => typeof v === 'string' ? v.slice(0, m) : Array.isArray(v) ? v.slice(0, 20).map(x => trunc(x, m)) : v;
  const pick = (o, ks) => o ? Object.fromEntries(ks.map(k => [k, o[k] ?? null])) : null;
  const pickRender = e => e ? { ...pick(e, ['size', 'lineItemId', 'creativeId', 'advertiserId', 'campaignId', 'sourceAgnosticLineItemId', 'sourceAgnosticCreativeId', 'yieldGroupIds', 'companyIds']), isEmpty: typeof e.isEmpty === 'boolean' ? e.isEmpty : null, isBackfill: typeof e.isBackfill === 'boolean' ? e.isBackfill : null } : null;
  safe(() => {
    W.__gptAudit = W.__gptAudit || { events: [] };
    if (opts.probe && !W.__gptAudit.listenersAttached && W.googletag?.cmd) W.googletag.cmd.push(() => {
      try {
        const pa = W.googletag.pubads();
        ['slotRequested', 'slotResponseReceived', 'slotRenderEnded', 'impressionViewable', 'slotOnload'].forEach(n =>
          pa.addEventListener(n, e => { try { W.__gptAudit.events.push({ name: n, timestamp: Date.now(), slotElementId: e.slot?.getSlotElementId?.() || null, serviceName: e.serviceName || null, ...pickRender(e) }); } catch (_) {} }));
        W.__gptAudit.listenersAttached = true;
      } catch (_) {}
    });
  }, 'probe');
  const vp = { w: W.innerWidth || 0, h: W.innerHeight || 0, dpr: W.devicePixelRatio || 1 };
  const meta = { url: trunc(location.href, 500), title: trunc(document.title, 200), viewport: vp, userAgent: trunc(navigator.userAgent, 300), timestamp: new Date().toISOString(), collectorVersion: '0.2.0' };
  const tagsIn = (doc, frame) => Array.from(doc.querySelectorAll('script[src*="/tag/js/gpt.js"], script[src*="googletagservices.com/tag/"]')).map(s => ({ src: trunc(s.src, 300), async: !!s.async, defer: !!s.defer, inHead: s.parentNode === doc.head, frame }));
  const scriptTags = safe(() => tagsIn(document, null), 'scriptTags', []);
  const isLegacy = t => (t.src || '').includes('googletagservices.com/tag/');
  const gt = W.googletag, hasGpt = typeof gt !== 'undefined';
  const gptInfo = { present: hasGpt, version: null, apiReady: false, pubadsReady: false, scriptTags, legacyHost: scriptTags.some(isLegacy), cmdQueueLength: 0, config: {}, initialLoadDisabled: false, pageTargeting: {}, mainFrameSlotCount: 0 };
  const allEvents = W.__gptAudit?.events || [];
  const normSizes = s => !s || s === 'fluid' ? s || [] : !Array.isArray(s) ? [] : s.map(x => x === 'fluid' ? 'fluid' : Array.isArray(x) ? (+x[0] === x[0] ? [x[0], x[1]] : normSizes(x)) : (x?.getWidth && x?.getHeight ? [x.getWidth(), x.getHeight()] : x)).filter(Boolean);
  let hbKeysCount = 0;
  const collectSlots = (pubads, doc, frame) => (safe(() => pubads?.getSlots?.() || [], 'slots', []) || []).slice(0, 60).map(s => {
    const elementId = safe(() => s.getSlotElementId?.(), 'slot.id'), adUnitPath = safe(() => s.getAdUnitPath?.(), 'slot.iu'), sizes = safe(() => normSizes(s.getSizes?.()), 'slot.sz', []);
    const targeting = {};
    safe(() => { for (const k of (s.getTargetingKeys?.() || []).slice(0, 20)) { if (k.startsWith('hb_')) hbKeysCount++; targeting[k] = trunc(s.getTargeting(k), 200); } }, 'slot.tgt');
    const categoryExclusions = safe(() => s.getCategoryExclusions?.() || [], 'slot.cat', []);
    const response = safe(() => pick(s.getResponseInformation?.(), ['advertiserId', 'campaignId', 'lineItemId', 'creativeId', 'creativeTemplateId', 'isBackfill', 'yieldGroupIds']), 'slot.resp');
    let render = pickRender(allEvents.filter(e => e.name === 'slotRenderEnded' && e.slotElementId === elementId).pop());
    const el = elementId ? doc.getElementById(elementId) : null;
    const count = elementId ? safe(() => doc.querySelectorAll(`[id="${CSS?.escape ? CSS.escape(elementId) : elementId.replace(/"/g, '\\"')}"]`).length, 'slot.cnt', el ? 1 : 0) : 0;
    const dom = { exists: !!el, count, boundingRect: null, inViewportOnLoad: false, cssDisplay: null, reservedHeight: false, queryId: null };
    const iframe = { present: false, w: 0, h: 0, safeFrame: false, name: '' };
    if (el) safe(() => {
      const b = el.getBoundingClientRect(), cs = doc.defaultView.getComputedStyle(el), ifr = el.querySelector('iframe');
      dom.boundingRect = Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map(k => [k, R(b[k])]));
      dom.inViewportOnLoad = !frame && b.top < vp.h && b.bottom > 0 && b.left < vp.w && b.right > 0;
      dom.cssDisplay = cs.display; dom.reservedHeight = (parseFloat(cs.minHeight) || parseFloat(el.style.height) || 0) > 0;
      dom.queryId = el.getAttribute('data-google-query-id') || null;
      if (ifr) { iframe.present = true; iframe.w = ifr.offsetWidth || +ifr.width || 0; iframe.h = ifr.offsetHeight || +ifr.height || 0; iframe.safeFrame = `${ifr.src} ${ifr.id} ${ifr.name}`.toLowerCase().includes('safeframe'); iframe.name = trunc(ifr.name || ifr.id || '', 100); }
    }, 'slot.dom');
    if (!render && frame && response) render = { ...pickRender(response), isEmpty: false, size: iframe.present ? [iframe.w, iframe.h] : null };
    return { elementId, adUnitPath, sizes, targeting, categoryExclusions, response, render, dom, iframe, frame };
  });
  let slots = [];
  if (hasGpt) {
    gptInfo.version = safe(() => gt.getVersion?.(), 'gpt.ver'); gptInfo.apiReady = safe(() => !!gt.apiReady, 'gpt.api', false); gptInfo.pubadsReady = safe(() => !!gt.pubadsReady, 'gpt.pa', false);
    gptInfo.cmdQueueLength = safe(() => (Array.isArray(gt.cmd) ? gt.cmd.length : 0), 'gpt.cmd', 0);
    const pa = safe(() => gt.pubads?.(), 'gpt.pubads');
    if (pa) {
      gptInfo.initialLoadDisabled = safe(() => pa.isInitialLoadDisabled?.(), 'gpt.init', false);
      gptInfo.config = safe(() => pa.getConfig?.() || gt.getConfig?.() || {}, 'gpt.cfg', {});
      safe(() => { for (const k of (pa.getTargetingKeys?.() || []).slice(0, 20)) gptInfo.pageTargeting[k] = trunc(pa.getTargeting(k), 200); }, 'gpt.tgt');
    }
    slots = collectSlots(pa, document, null); gptInfo.mainFrameSlotCount = slots.length;
  }
  const frames = [];
  safe(() => {
    let seen = 0;
    const walk = (win, depth) => {
      for (let i = 0; i < win.frames.length && seen < 40; i++) {
        const f = win.frames[i]; let fd, fgt;
        try { fd = f.document; fgt = f.googletag; } catch (_) { continue; }
        if (fgt && typeof fgt.getVersion === 'function') {
          seen++; const el = safe(() => f.frameElement, 'f.el'), id = el?.id || `frame${seen}`;
          const rec = { iframeId: trunc(el?.id || '', 100), iframeName: trunc(el?.name || '', 100), href: trunc(safe(() => f.location.href, 'f.href', ''), 200), depth, version: safe(() => fgt.getVersion(), 'f.ver'), pubadsReady: !!fgt.pubadsReady, scriptTags: safe(() => tagsIn(fd, id), 'f.tags', []), slotCount: 0 };
          const fs = collectSlots(safe(() => fgt.pubads?.(), 'f.pa'), fd, rec.iframeId || id);
          rec.slotCount = fs.length; slots.push(...fs); frames.push(rec); scriptTags.push(...rec.scriptTags);
        }
        if (depth < 3) walk(f, depth + 1);
      }
    };
    walk(W, 1);
  }, 'frames');
  gptInfo.legacyHost = scriptTags.some(isLegacy); gptInfo.gptInstances = (hasGpt ? 1 : 0) + frames.length;
  if (!hasGpt && !frames.length) {
    const adElements = Array.from(document.querySelectorAll('div[id*="ad"], div[id*="gpt"], div[data-google-query-id], div[class*="ad-slot"]')).slice(0, 60).map(e => ({ elementId: e.id || null, className: e.className || null, hasQueryId: e.hasAttribute('data-google-query-id') }));
    return { meta, gpt: gptInfo, slots: [], frames, adElements, neighbours: { prebid: { present: typeof W.pbjs !== 'undefined' }, consent: {}, apstag: { present: typeof W.apstag !== 'undefined' } }, events: allEvents, errors };
  }
  const pb = W.pbjs, prebid = { present: typeof pb !== 'undefined', version: null, bidderTimeout: null, adUnits: [], bids: [], hbKeysOnSlots: hbKeysCount > 0 };
  if (prebid.present) safe(() => {
    prebid.version = pb.version || null; prebid.bidderTimeout = pb.getConfig?.('bidderTimeout') ?? null;
    prebid.adUnits = (pb.adUnits || []).slice(0, 60).map(u => ({ code: trunc(u.code, 100), sizes: u.mediaTypes?.banner?.sizes || u.sizes || [], bidders: (u.bids || []).slice(0, 20).map(b => trunc(b.bidder, 50)) }));
    for (const [c, e] of Object.entries(pb.getBidResponses?.() || {})) for (const b of (e?.bids || []).slice(0, 10)) prebid.bids.push({ adUnitCode: trunc(c, 100), bidder: trunc(b.bidder, 50), cpm: typeof b.cpm === 'number' ? b.cpm : null, status: trunc(b.statusMessage || b.status || '', 50), timeToRespond: typeof b.timeToRespond === 'number' ? b.timeToRespond : null });
  }, 'prebid');
  const tcf = { present: typeof W.__tcfapi === 'function', gdprApplies: null, tcString: null, tcStringLength: 0, purpose1: null, cmpId: null, cmpVersion: null, tcfPolicyVersion: null, eventStatus: null, cmpStatus: null, isServiceSpecific: null, publisherCC: null, purposeConsents: {}, purposeLegitimateInterests: {}, specialFeatureOptins: {}, googleVendorConsent: null, googleVendorLI: null, addtlConsent: null };
  const consent = { tcf, gpp: { present: typeof W.__gpp === 'function', sections: null }, usp: { present: typeof W.__uspapi === 'function' } };
  const ask = (fn, ms, f) => new Promise(res => { const t = setTimeout(res, ms); try { fn(() => { clearTimeout(t); res(); }); } catch (e) { errors.push({ field: f, message: e.message }); clearTimeout(t); res(); } });
  if (tcf.present) await ask(done => W.__tcfapi('getTCData', 2, (tc, ok) => {
    if (ok && tc) {
      Object.assign(tcf, pick(tc, ['cmpId', 'cmpVersion', 'tcfPolicyVersion', 'eventStatus', 'cmpStatus', 'publisherCC']), {
        gdprApplies: typeof tc.gdprApplies === 'boolean' ? tc.gdprApplies : null, isServiceSpecific: typeof tc.isServiceSpecific === 'boolean' ? tc.isServiceSpecific : null,
        tcString: typeof tc.tcString === 'string' && tc.tcString ? trunc(tc.tcString, 4000) : null, tcStringLength: (tc.tcString || '').length,
        purpose1: !!tc.purpose?.consents?.[1], addtlConsent: typeof tc.addtlConsent === 'string' ? trunc(tc.addtlConsent, 500) : null,
        googleVendorConsent: tc.vendor?.consents?.[755] !== undefined ? !!tc.vendor.consents[755] : null,
        googleVendorLI: tc.vendor?.legitimateInterests?.[755] !== undefined ? !!tc.vendor.legitimateInterests[755] : null
      });
      for (let i = 1; i <= 10; i++) { tcf.purposeConsents[i] = !!tc.purpose?.consents?.[i]; tcf.purposeLegitimateInterests[i] = !!tc.purpose?.legitimateInterests?.[i]; }
      for (let i = 1; i <= 2; i++) tcf.specialFeatureOptins[i] = !!tc.specialFeatureOptins?.[i];
    }
    done();
  }), 600, 'tcf');
  if (consent.gpp.present) await ask(done => W.__gpp('ping', (p, ok) => { if (ok && p) consent.gpp.sections = p.applicableSections || null; done(); }), 300, 'gpp');
  return { meta, gpt: gptInfo, slots, frames, neighbours: { prebid, consent, apstag: { present: typeof W.apstag !== 'undefined' } }, events: allEvents.slice(0, 200), errors };
}
if (typeof module !== 'undefined') module.exports = { collectGpt };
