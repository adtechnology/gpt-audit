// collect-gpt.js — in-page snapshot collector (main frame + same-origin iframes).
async function collectGpt(opts = {}) {
  const errors = [];
  const safe = (fn, f, d = null) => {
    try { const r = fn(); return r !== undefined ? r : d; }
    catch (e) { errors.push({ field: f, message: e.message }); return d; }
  };
  const trunc = (v, m = 200) => typeof v === 'string' ? (v.length > m ? v.slice(0, m) : v) : Array.isArray(v) ? v.slice(0, 20).map(x => trunc(x, m)) : v;

  const pickRender = e => e ? ({
    isEmpty: typeof e.isEmpty === 'boolean' ? e.isEmpty : null, size: e.size || null,
    isBackfill: typeof e.isBackfill === 'boolean' ? e.isBackfill : null,
    lineItemId: e.lineItemId ?? null, creativeId: e.creativeId ?? null,
    advertiserId: e.advertiserId ?? null, campaignId: e.campaignId ?? null,
    sourceAgnosticLineItemId: e.sourceAgnosticLineItemId ?? null,
    sourceAgnosticCreativeId: e.sourceAgnosticCreativeId ?? null,
    yieldGroupIds: e.yieldGroupIds || null, companyIds: e.companyIds || null
  }) : null;

  safe(() => {
    window.__gptAudit = window.__gptAudit || { events: [] };
    if (opts.probe && !window.__gptAudit.listenersAttached && window.googletag?.cmd) {
      window.googletag.cmd.push(() => {
        try {
          const pa = window.googletag.pubads();
          ['slotRequested', 'slotResponseReceived', 'slotRenderEnded', 'impressionViewable', 'slotOnload'].forEach(n =>
            pa.addEventListener(n, e => {
              try {
                window.__gptAudit.events.push({ name: n, timestamp: Date.now(), slotElementId: e.slot?.getSlotElementId?.() || null, serviceName: e.serviceName || null, ...pickRender(e) });
              } catch (_) {}
            })
          );
          window.__gptAudit.listenersAttached = true;
        } catch (_) {}
      });
    }
  }, 'probe');

  const vp = { w: window.innerWidth || 0, h: window.innerHeight || 0, dpr: window.devicePixelRatio || 1 };
  const meta = { url: trunc(location.href, 500), title: trunc(document.title, 200), viewport: vp, userAgent: trunc(navigator.userAgent, 300), timestamp: new Date().toISOString(), collectorVersion: '0.2.0' };

  const tagsIn = (doc, frame) => Array.from(doc.querySelectorAll('script[src*="/tag/js/gpt.js"], script[src*="googletagservices.com/tag/"]')).map(s => ({ src: trunc(s.src, 300), async: !!s.async, defer: !!s.defer, inHead: s.parentNode === doc.head, frame }));
  const scriptTags = safe(() => tagsIn(document, null), 'gpt.scriptTags', []);
  const isLegacy = t => (t.src || '').includes('googletagservices.com/tag/');

  const gt = window.googletag;
  const hasGpt = typeof gt !== 'undefined';
  const gptInfo = { present: hasGpt, version: null, apiReady: false, pubadsReady: false, scriptTags, legacyHost: scriptTags.some(isLegacy), cmdQueueLength: 0, config: {}, initialLoadDisabled: false, pageTargeting: {}, mainFrameSlotCount: 0 };
  const allEvents = window.__gptAudit?.events || [];
  const normSizes = s => !s || s === 'fluid' ? s || [] : !Array.isArray(s) ? [] : s.map(x => x === 'fluid' ? 'fluid' : Array.isArray(x) ? (+x[0] === x[0] ? [x[0], x[1]] : normSizes(x)) : (x?.getWidth && x?.getHeight ? [x.getWidth(), x.getHeight()] : x)).filter(Boolean);
  let hbKeysCount = 0;

  // Slots of one GPT instance; frame = iframe id or null.
  const collectSlots = (pubads, doc, frame) => {
    const out = [];
    for (const s of (safe(() => pubads?.getSlots?.() || [], 'slots', []) || []).slice(0, 60)) {
      const elementId = safe(() => s.getSlotElementId?.(), 'slot.elementId');
      const adUnitPath = safe(() => s.getAdUnitPath?.(), `slot[${elementId}].adUnitPath`);
      const sizes = safe(() => normSizes(s.getSizes?.()), `slot[${elementId}].sizes`, []);
      const targeting = {};
      safe(() => {
        for (const k of (s.getTargetingKeys?.() || []).slice(0, 20)) {
          if (k.startsWith('hb_')) hbKeysCount++;
          targeting[k] = trunc(s.getTargeting(k), 200);
        }
      }, `slot[${elementId}].targeting`);
      const categoryExclusions = safe(() => s.getCategoryExclusions?.() || [], `slot[${elementId}].categoryExclusions`, []);
      const response = safe(() => {
        const r = s.getResponseInformation?.();
        return r ? { advertiserId: r.advertiserId ?? null, campaignId: r.campaignId ?? null, lineItemId: r.lineItemId ?? null, creativeId: r.creativeId ?? null, creativeTemplateId: r.creativeTemplateId ?? null, isBackfill: r.isBackfill ?? null, yieldGroupIds: r.yieldGroupIds ?? null } : null;
      }, `slot[${elementId}].response`);
      let render = pickRender(allEvents.filter(e => e.name === 'slotRenderEnded' && e.slotElementId === elementId).pop());
      // no probe events in iframes: derive render from response.
      const el = elementId ? doc.getElementById(elementId) : null;
      const dom = { exists: !!el, boundingRect: null, inViewportOnLoad: false, cssDisplay: null, reservedHeight: false, queryId: null };
      const iframeInfo = { present: false, w: 0, h: 0, safeFrame: false, name: '' };
      if (el) {
        safe(() => {
          const b = el.getBoundingClientRect();
          dom.boundingRect = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), left: Math.round(b.left) };
          dom.inViewportOnLoad = !frame && b.top < vp.h && b.bottom > 0 && b.left < vp.w && b.right > 0;
          const cs = doc.defaultView.getComputedStyle(el);
          dom.cssDisplay = cs.display;
          dom.reservedHeight = (parseFloat(cs.minHeight) || parseFloat(el.style.height) || 0) > 0;
          dom.queryId = el.getAttribute('data-google-query-id') || null;
          const ifr = el.querySelector('iframe');
          if (ifr) {
            iframeInfo.present = true;
            iframeInfo.w = ifr.offsetWidth || +ifr.width || 0;
            iframeInfo.h = ifr.offsetHeight || +ifr.height || 0;
            iframeInfo.safeFrame = `${ifr.src} ${ifr.id} ${ifr.name}`.toLowerCase().includes('safeframe');
            iframeInfo.name = trunc(ifr.name || ifr.id || '', 100);
          }
        }, `slot[${elementId}].dom`);
      }
      if (!render && frame && response) render = { ...pickRender({}), isEmpty: false, size: iframeInfo.present ? [iframeInfo.w, iframeInfo.h] : null, isBackfill: response.isBackfill, lineItemId: response.lineItemId, creativeId: response.creativeId, advertiserId: response.advertiserId, campaignId: response.campaignId, yieldGroupIds: response.yieldGroupIds };
      out.push({ elementId, adUnitPath, sizes, targeting, categoryExclusions, response, render, dom, iframe: iframeInfo, frame });
    }
    return out;
  };

  let slots = [];
  if (hasGpt) {
    gptInfo.version = safe(() => gt.getVersion?.(), 'gpt.version');
    gptInfo.apiReady = safe(() => !!gt.apiReady, 'gpt.apiReady', false);
    gptInfo.pubadsReady = safe(() => !!gt.pubadsReady, 'gpt.pubadsReady', false);
    gptInfo.cmdQueueLength = safe(() => (Array.isArray(gt.cmd) ? gt.cmd.length : 0), 'gpt.cmdQueueLength', 0);
    const pubads = safe(() => gt.pubads?.(), 'gpt.pubads');
    if (pubads) {
      gptInfo.initialLoadDisabled = safe(() => pubads.isInitialLoadDisabled?.(), 'gpt.initialLoadDisabled', false);
      gptInfo.config = safe(() => pubads.getConfig?.() || gt.getConfig?.() || {}, 'gpt.config', {});
      safe(() => {
        for (const k of (pubads.getTargetingKeys?.() || []).slice(0, 20)) gptInfo.pageTargeting[k] = trunc(pubads.getTargeting(k), 200);
      }, 'gpt.pageTargeting');
    }
    slots = collectSlots(pubads, document, null);
    gptInfo.mainFrameSlotCount = slots.length;
  }

  // Same-origin iframes with their own googletag (passbacks, wrappers): depth 3, max 40.
  const frames = [];
  safe(() => {
    let seen = 0;
    const walk = (win, depth) => {
      for (let i = 0; i < win.frames.length && seen < 40; i++) {
        const f = win.frames[i];
        let fd, fgt;
        try { fd = f.document; fgt = f.googletag; } catch (_) { continue; }
        if (fgt && typeof fgt.getVersion === 'function') {
          seen++;
          const el = safe(() => f.frameElement, 'frames.element');
          const rec = { iframeId: trunc(el?.id || '', 100), iframeName: trunc(el?.name || '', 100), href: trunc(safe(() => f.location.href, 'frames.href', ''), 200), depth, version: safe(() => fgt.getVersion(), 'frames.version'), pubadsReady: !!fgt.pubadsReady, scriptTags: safe(() => tagsIn(fd, el?.id || `frame${seen}`), 'frames.scriptTags', []), slotCount: 0 };
          const fs = collectSlots(safe(() => fgt.pubads?.(), 'frames.pubads'), fd, rec.iframeId || `frame${seen}`);
          rec.slotCount = fs.length;
          slots.push(...fs);
          frames.push(rec);
          scriptTags.push(...rec.scriptTags);
        }
        if (depth < 3) walk(f, depth + 1);
      }
    };
    walk(window, 1);
  }, 'frames');
  gptInfo.legacyHost = scriptTags.some(isLegacy);
  gptInfo.gptInstances = (hasGpt ? 1 : 0) + frames.length;

  if (!hasGpt && frames.length === 0) {
    const adElements = Array.from(document.querySelectorAll('div[id*="ad"], div[id*="gpt"], div[data-google-query-id], div[class*="ad-slot"]')).slice(0, 60).map(e => ({ elementId: e.id || null, className: e.className || null, hasQueryId: e.hasAttribute('data-google-query-id') }));
    return { meta, gpt: gptInfo, slots: [], frames, adElements, neighbours: { prebid: { present: typeof window.pbjs !== 'undefined' }, consent: {}, apstag: { present: typeof window.apstag !== 'undefined' } }, events: allEvents, errors };
  }

  const pb = window.pbjs;
  const prebid = { present: typeof pb !== 'undefined', version: null, bidderTimeout: null, adUnits: [], bids: [], hbKeysOnSlots: hbKeysCount > 0 };
  if (prebid.present) {
    safe(() => {
      prebid.version = pb.version || null;
      prebid.bidderTimeout = pb.getConfig?.('bidderTimeout') ?? null;
      prebid.adUnits = (pb.adUnits || []).slice(0, 60).map(u => ({ code: trunc(u.code, 100), sizes: u.mediaTypes?.banner?.sizes || u.sizes || [], bidders: (u.bids || []).slice(0, 20).map(b => trunc(b.bidder, 50)) }));
      for (const [c, e] of Object.entries(pb.getBidResponses?.() || {})) {
        for (const b of (e?.bids || []).slice(0, 10)) {
          prebid.bids.push({ adUnitCode: trunc(c, 100), bidder: trunc(b.bidder, 50), cpm: typeof b.cpm === 'number' ? b.cpm : null, status: trunc(b.statusMessage || b.status || '', 50), timeToRespond: typeof b.timeToRespond === 'number' ? b.timeToRespond : null });
        }
      }
    }, 'neighbours.prebid');
  }

  const consent = {
    tcf: { present: typeof window.__tcfapi === 'function', gdprApplies: null, tcStringLength: 0, purpose1: null, cmpId: null },
    gpp: { present: typeof window.__gpp === 'function', sections: null },
    usp: { present: typeof window.__uspapi === 'function' }
  };
  const ask = (fn, ms, field) => new Promise(res => {
    const t = setTimeout(res, ms);
    try { fn(() => { clearTimeout(t); res(); }); } catch (e) { errors.push({ field, message: e.message }); clearTimeout(t); res(); }
  });
  if (consent.tcf.present) await ask(done => window.__tcfapi('getTCData', 2, (tc, ok) => {
    if (ok && tc) {
      consent.tcf.gdprApplies = typeof tc.gdprApplies === 'boolean' ? tc.gdprApplies : null;
      consent.tcf.tcStringLength = (tc.tcString || '').length;
      consent.tcf.cmpId = tc.cmpId ?? null;
      consent.tcf.purpose1 = !!tc.purpose?.consents?.[1];
    }
    done();
  }), 600, 'neighbours.consent.tcf');
  if (consent.gpp.present) await ask(done => window.__gpp('ping', (p, ok) => { if (ok && p) consent.gpp.sections = p.applicableSections || null; done(); }), 300, 'neighbours.consent.gpp');

  return {
    meta, gpt: gptInfo, slots, frames,
    neighbours: { prebid, consent, apstag: { present: typeof window.apstag !== 'undefined' } },
    events: allEvents.slice(0, 200),
    errors
  };
}

if (typeof module !== 'undefined') module.exports = { collectGpt };
