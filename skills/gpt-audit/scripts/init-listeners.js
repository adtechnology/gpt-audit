// Optional navigation probe; pending is not attached, events are bounded.
(function(){try{
const state=window.__gptAudit=window.__gptAudit||{};
if(Array.isArray(state.events)||(state.events=[]),
state.events=state.events.slice(0,200),
state.listenersAttached||state.listenersPending)return;
state.listenersAttached=!1,state.listenersPending=!0,state.source="navigation",state.startedAt=Date.now(),
window.googletag=window.googletag||{},
window.googletag.cmd=window.googletag.cmd||[],window.googletag.cmd.push(function(){try{
const pubads=window.googletag.pubads(),
cap=v=>typeof v=="string"?v.slice(0,200):Array.isArray(v)?v.slice(0,20):v;
["slotRequested","slotResponseReceived","slotRenderEnded","impressionViewable","slotOnload","slotVisibilityChanged"].forEach(function(name){pubads.addEventListener(name,function(event){try{
if(state.events.length>=200){state.eventsDropped=(state.eventsDropped||0)+1;
return}const row={name,timestamp:Date.now(),
slotElementId:cap(event.slot?.getSlotElementId?.()||null),
serviceName:cap(event.serviceName||null)};
for(const key of["isEmpty","size","isBackfill","lineItemId","creativeId","advertiserId","campaignId","sourceAgnosticLineItemId","sourceAgnosticCreativeId","yieldGroupIds","companyIds"])row[key]=cap(event[key]??null);
state.events.push(row)}
catch{}})}),
state.listenersAttached=!0,state.attachedAt=Date.now()}
catch(e){state.events.length<200&&state.events.push({name:"listenerError",error:String(e?.message||e).slice(0,200)})}
finally{state.listenersPending=!1}})}
catch{}})();
