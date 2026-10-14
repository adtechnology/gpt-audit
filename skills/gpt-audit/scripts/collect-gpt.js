// Passive in-page snapshot (below 10 KiB).
async function collectGpt(opts={}){const errors=[],safe=(fn,field,fallback=null)=>{
try{
return fn()??fallback}
catch(e){return errors.length<60&&errors.push({field,message:String(e?.message||e).slice(0,200)}),
fallback}},
cap=(v,n=200,depth=0)=>typeof v=="string"?v.slice(0,n):depth>3?null:Array.isArray(v)?v.slice(0,20).map(x=>cap(x,n,depth+1)):v&&typeof v=="object"?Object.fromEntries(Object.entries(v).slice(0,20).map(([k,x])=>[k.slice(0,100),
cap(x,n,depth+1)])):v,render=e=>e?Object.fromEntries(["isEmpty","size","isBackfill","lineItemId","creativeId","advertiserId","campaignId","sourceAgnosticLineItemId","sourceAgnosticCreativeId","yieldGroupIds","companyIds"].map(k=>[k,cap(e[k]??null)])):null;
try{
const a=window.__gptAudit=window.__gptAudit||{};
Array.isArray(a.events)||(a.events=[]),
a.events=a.events.slice(0,200);
const vp=safe(()=>({w:window.innerWidth||0,h:window.innerHeight||0,dpr:window.devicePixelRatio||1}),
"viewport",{});
a.initial||(a.initial={viewport:vp,timestamp:new Date().toISOString(),
slots:Object.create(null)});
const firstPass=!a.passes;
a.passes=(a.passes||0)+1,safe(()=>{
opts?.probe&&!a.listenersAttached&&!a.listenersPending&&window.googletag?.cmd&&(a.source=a.source||"late-probe",a.startedAt=a.startedAt||Date.now(),
a.listenersPending=!0,window.googletag.cmd.push(()=>{
try{
const pa2=window.googletag.pubads();
["slotRequested","slotResponseReceived","slotRenderEnded","impressionViewable","slotOnload","slotVisibilityChanged"].forEach(name=>pa2.addEventListener(name,e=>{
try{
if(a.events.length>=200){a.eventsDropped=(a.eventsDropped||0)+1;
return}a.events.push({name,timestamp:Date.now(),
slotElementId:cap(e.slot?.getSlotElementId?.()||null),
serviceName:cap(e.serviceName||null),
...render(e)})}
catch{}})),
a.listenersAttached=!0,a.attachedAt=Date.now()}
catch{}
finally{a.listenersPending=!1}}))},
"probe");
const meta={url:safe(()=>cap(location.href,500),
"url"),
title:safe(()=>cap(document.title),
"title"),
viewport:vp,initialViewport:a.initial.viewport,initialTimestamp:a.initial.timestamp,userAgent:safe(()=>cap(navigator.userAgent,300),
"userAgent"),
timestamp:new Date().toISOString(),
collectorVersion:"0.2.0"},
probe={source:a.source||"none",listenersAttached:!!a.listenersAttached,attachedAt:a.attachedAt||null,startedAt:a.startedAt||null,eventLimit:200,eventsDropped:a.eventsDropped||0,resourceTimingLimit:200},
networkTimings=safe(()=>performance.getEntriesByType("resource").filter(e=>{
const u=new URL(e.name);
return/^https?:$/.test(u.protocol)&&(/^(securepubads|pubads)\.g\.doubleclick\.net$/.test(u.hostname)&&/^\/(gampad\/ads|tag\/js\/gpt\.js|pagead\/managed\/js\/gpt\/.*\/pubads_impl\.js)$/.test(u.pathname)||u.hostname==="www.googletagservices.com"&&/^\/tag\/js\/gpt\.js$/.test(u.pathname))}).slice(0,200).map(e=>({name:e.name.slice(0,16384),
startTime:e.startTime,duration:e.duration,source:"resource-timing"})),
"networkTimings",[]),
scripts=safe(()=>Array.from(document.querySelectorAll('script[src*="/tag/js/gpt.js"], script[src*="googletagservices.com"]')).slice(0,20),
"scripts",[]),
scriptTags=scripts.map(s=>safe(()=>({src:cap(s.src,300),
async:!!s.async,defer:!!s.defer,inHead:s.parentNode===document.head}),
"script")),
gt=safe(()=>window.googletag,"gpt"),
gpt={present:!!(gt?.apiReady||scriptTags.length||gt?.getVersion),
version:null,apiReady:!1,pubadsReady:!1,scriptTags,legacyHost:scripts.some(s=>safe(()=>s.src.includes("googletagservices.com"),
"script.src",!1)),
cmdQueueLength:0,config:{},
initialLoadDisabled:null,pageTargeting:{}},
slots=[],events=a.events.slice(0,200),
nb={prebid:{present:!!window.pbjs},
consent:{},
apstag:{present:!!window.apstag}};
if(!gpt.present)return{meta,gpt,slots,neighbours:nb,events,probe,networkTimings,errors,adElements:safe(()=>Array.from(document.querySelectorAll('div[id*="ad"], div[id*="gpt"], div[data-google-query-id], div[class*="ad-slot"]')).slice(0,60).map(e=>({elementId:cap(e.id),
className:cap(e.className),
hasQueryId:e.hasAttribute("data-google-query-id")})),
"adElements",[])};
gpt.version=safe(()=>gt.getVersion?.(),
"gpt.version"),
gpt.apiReady=safe(()=>!!gt.apiReady,"gpt.apiReady",!1),
gpt.pubadsReady=safe(()=>!!gt.pubadsReady,"gpt.pubadsReady",!1),
gpt.cmdQueueLength=safe(()=>Array.isArray(gt.cmd)?gt.cmd.length:0,"gpt.cmdQueueLength",0),
gpt.config=safe(()=>cap(gt.getConfig?.(["adsenseAttributes","disableInitialLoad","targeting"])||{}),
"gpt.config",{});
const pa=safe(()=>gt.pubads?.(),
"gpt.pubads");
gpt.initialLoadDisabled=gpt.config.disableInitialLoad??safe(()=>pa?.isInitialLoadDisabled?.(),
"gpt.initialLoadDisabled"),
safe(()=>{
gpt.pageTargeting=gt.getConfig?gpt.config.targeting||{}:Object.fromEntries((pa?.getTargetingKeys?.()||[]).slice(0,20).map(k=>[k,cap(pa.getTargeting(k))]))},
"gpt.pageTargeting");
const sizesOf=v=>(Array.isArray(v)?v:[v]).slice(0,20).map(x=>x==="fluid"?x:Array.isArray(x)?cap(x):x?.getWidth&&x?.getHeight?[x.getWidth(),
x.getHeight()]:null).filter(Boolean);
let hbKeysCount=0;
for(const s of safe(()=>pa?.getSlots?.()||[],"slots",[]).slice(0,60)){const id=safe(()=>cap(s.getSlotElementId?.()),
"slot.id"),
config=safe(()=>s.getConfig?.(["targeting","categoryExclusion"]),
"slot.config"),
targeting=config?config.targeting||{}:safe(()=>Object.fromEntries((s.getTargetingKeys?.()||[]).slice(0,20).map(k=>[k,cap(s.getTargeting(k))])),
"slot.targeting",{});
hbKeysCount+=Object.keys(targeting).filter(k=>k.startsWith("hb_")).length;
const response=safe(()=>{
const r=s.getResponseInformation?.();
return r?Object.fromEntries(["advertiserId","campaignId","lineItemId","creativeId","creativeTemplateId"].map(k=>[k,r[k]??null])):null},
"slot.response"),
el=safe(()=>id?document.getElementById(id):null,"slot.element"),
dom={exists:!!el,boundingRect:null,inViewportOnLoad:null,initialStateKnown:!1,inViewportNow:!1,cssDisplay:null,hidden:null,hiddenBy:null,reservedHeight:!1,reservation:{own:!1,ancestor:!1,evidence:[]},
clippingAncestor:null,queryId:null},
iframe={present:!1,w:0,h:0,safeFrame:!1,name:""};
el&&safe(()=>{
const b=el.getBoundingClientRect();
dom.boundingRect=Object.fromEntries(["x","y","width","height","top","right","bottom","left"].map(k=>[k,Math.round(b[k])])),
dom.inViewportNow=b.top<vp.h&&b.bottom>0&&b.left<vp.w&&b.right>0,dom.hidden=!1;
for(let n=el,depth=0;
n&&depth<12;
n=n.parentElement,depth++){const cs=window.getComputedStyle(n),
own=n===el;
own&&(dom.cssDisplay=cs.display,dom.overflowX=cs.overflowX,dom.overflowY=cs.overflowY),
!dom.hiddenBy&&(cs.display==="none"||/^(hidden|collapse)$/.test(cs.visibility)||cs.contentVisibility==="hidden"||n.hidden)&&(dom.hidden=!0,dom.hiddenBy={elementId:cap(n.id||null),
display:cs.display,visibility:cs.visibility,contentVisibility:cs.contentVisibility,hiddenAttribute:!!n.hidden});
const minHeight=parseFloat(cs.minHeight)||0,height=parseFloat(n.style?.height)||0,aspectRatio=cs.aspectRatio&&cs.aspectRatio!=="auto"?cap(cs.aspectRatio,40):null;
if((minHeight>0||height>0||aspectRatio)&&(dom.reservation[own?"own":"ancestor"]=!0,dom.reservation.evidence.push({elementId:cap(n.id||null),
source:own?"own":"ancestor",minHeight,height,aspectRatio})),
!own&&!dom.clippingAncestor&&(/^(hidden|clip)$/.test(cs.overflowX)||/^(hidden|clip)$/.test(cs.overflowY))){const r=n.getBoundingClientRect();
r.width>0&&r.height>0&&(dom.clippingAncestor={elementId:cap(n.id||null),
width:r.width,height:r.height,overflowX:cs.overflowX,overflowY:cs.overflowY})}}dom.reservedHeight=dom.reservation.own||dom.reservation.ancestor,dom.queryId=cap(el.getAttribute("data-google-query-id")||null);
const f=el.querySelector("iframe");
f&&Object.assign(iframe,{present:!0,w:f.offsetWidth||+f.width||0,h:f.offsetHeight||+f.height||0,safeFrame:`${f.src} ${f.id} ${f.name}`.toLowerCase().includes("safeframe"),
name:cap(f.name||f.id||"",100)})},
"slot.dom"),
firstPass&&(a.initial.slots[id]=dom.inViewportNow),
Object.hasOwn(a.initial.slots,id)&&(dom.inViewportOnLoad=a.initial.slots[id],dom.initialStateKnown=!0),
slots.push({elementId:id,adUnitPath:safe(()=>cap(s.getAdUnitPath?.(),
300),
"slot.path"),
sizes:safe(()=>sizesOf(s.getSizes?.()),
"slot.sizes",[]),
targeting:cap(targeting),
categoryExclusions:safe(()=>cap(config?config.categoryExclusion||[]:s.getCategoryExclusions?.()||[]),
"slot.exclusions",[]),
response,render:render(events.filter(e=>e.name==="slotRenderEnded"&&e.slotElementId===id).pop()),
dom,iframe})}const pb=window.pbjs;
nb.prebid={present:!!pb,version:null,bidderTimeout:null,adUnits:[],bids:[],hbKeysOnSlots:hbKeysCount>0},
pb&&safe(()=>{
const p=nb.prebid;
p.version=cap(pb.version||null),
p.bidderTimeout=pb.getConfig?.("bidderTimeout")??null,p.adUnits=(pb.adUnits||[]).slice(0,60).map(u=>({code:cap(u.code,100),
sizes:cap(u.mediaTypes?.banner?.sizes||u.sizes||[]),
bidders:(u.bids||[]).slice(0,20).map(b=>cap(b.bidder,50))}));
for(const[c,e]of Object.entries(pb.getBidResponses?.()||{}).slice(0,60))for(const b of(e?.bids||[]).slice(0,10))p.bids.push({adUnitCode:cap(c,100),
bidder:cap(b.bidder,50),
cpm:typeof b.cpm=="number"?b.cpm:null,status:cap(b.statusMessage||b.status||"",50),
timeToRespond:b.timeToRespond??null})},
"prebid");
const consent=nb.consent={tcf:{present:typeof window.__tcfapi=="function",gdprApplies:null,tcStringLength:null,purpose1:null,cmpId:null},
gpp:{present:typeof window.__gpp=="function",sections:null},
usp:{present:typeof window.__uspapi=="function"}},
query=async(fn,timeout,accept)=>{
try{
await new Promise(resolve=>{
const t=setTimeout(resolve,timeout);
try{
fn((data,ok)=>{
clearTimeout(t),
safe(()=>{
ok&&data&&accept(data)},
"consent"),
resolve()})}
catch{clearTimeout(t),
resolve()}})}
catch{}};
return consent.tcf.present&&await query(cb=>window.__tcfapi("getTCData",2,cb),
600,t=>Object.assign(consent.tcf,{gdprApplies:typeof t.gdprApplies=="boolean"?t.gdprApplies:null,tcStringLength:(t.tcString||"").length,cmpId:t.cmpId??null,purpose1:typeof t.purpose?.consents?.[1]=="boolean"?t.purpose.consents[1]:null})),
consent.gpp.present&&await query(cb=>window.__gpp("ping",cb),
300,p=>{
consent.gpp.sections=cap(p.applicableSections||null)}),
{meta,gpt,slots,neighbours:nb,events,probe,networkTimings,errors}}
catch(e){return safe(()=>{
throw e},
"collector"),
{errors}}}
