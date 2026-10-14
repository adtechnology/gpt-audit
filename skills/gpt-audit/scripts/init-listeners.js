(function (fromNavigation) {
  window.__gptAudit = window.__gptAudit || { events: [], listenersAttached: false };
  window.googletag = window.googletag || {};
  window.googletag.cmd = window.googletag.cmd || [];

  window.googletag.cmd.push(function () {
    if (window.__gptAudit.listenersAttached) return;
    try {
      const pubads = window.googletag.pubads();
      const eventNames = [
        'slotRequested',
        'slotResponseReceived',
        'slotRenderEnded',
        'impressionViewable',
        'slotOnload',
        'slotVisibilityChanged'
      ];
      eventNames.forEach(function (name) {
        pubads.addEventListener(name, function (event) {
          try {
            window.__gptAudit.events.push({
              name: name,
              timestamp: Date.now(),
              slotElementId: event.slot ? event.slot.getSlotElementId() : null,
              isEmpty: typeof event.isEmpty === 'boolean' ? event.isEmpty : null,
              size: event.size || null,
              isBackfill: typeof event.isBackfill === 'boolean' ? event.isBackfill : null,
              lineItemId: event.lineItemId ?? null,
              creativeId: event.creativeId ?? null,
              advertiserId: event.advertiserId ?? null,
              campaignId: event.campaignId ?? null,
              sourceAgnosticLineItemId: event.sourceAgnosticLineItemId ?? null,
              sourceAgnosticCreativeId: event.sourceAgnosticCreativeId ?? null,
              yieldGroupIds: event.yieldGroupIds || null,
              companyIds: event.companyIds || null,
              serviceName: event.serviceName || null
            });
          } catch (_) {}
        });
      });
      window.__gptAudit.listenersAttached = true;
      window.__gptAudit.listenersFromNavigation = fromNavigation;
    } catch (e) {
      window.__gptAudit.events.push({ name: 'listenerError', error: e.message });
    }
  });
})(window.__gptAuditFromNavigation === true);
