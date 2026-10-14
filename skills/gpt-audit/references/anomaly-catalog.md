# Anomaly Catalog

Rule IDs are stable; the analyzer, the report, the test suite, and the demo fixture refer to them.
Severity levels: `high`, `medium`, `low`.
Evidence names the exact fields of `snapshot.json` (collector) and `network.json` (network-extract).
Since collector 0.2.0 `slots[]` also holds the slots of GPT instances in same-origin iframes (`slot.frame` = iframe id,
`null` for the main frame) and `frames[]` lists those instances; `gpt.mainFrameSlotCount` and `gpt.gptInstances` summarise them.

## Implemented Rules (R01–R10, R13, R16–R18)

| ID | Rule | Severity | Status | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- | --- |
| R01 | Slot defined but never requested or displayed | High | Implemented | Slot in `slots[]` has no `response`, no `dom.queryId`, no `slotRequested` events, and no `gampad/ads` display request mentions its ad unit or elementId | Call `googletag.display(id)` or remove the definition |
| R02 | Slot div missing in DOM or duplicated | High | Implemented | `dom.exists` is false, `dom.count > 1` (duplicate DOM `id`), or two or more slots in `slots[]` share the same `elementId` | Ensure a unique container div exists in DOM with matching id |
| R03 | Unfilled slot | Medium | Implemented | `slot.render.isEmpty === true`. (Note: filled slots with `lineItemId: null` and `isBackfill: true` are AdX/Open Bidding fills and are not flagged as unfilled) | Check line-item targeting, floor prices, and advertiser demand for the ad unit |
| R04 | No active size fits viewport or container | Medium | Implemented | Active `viewportSizes`, falling back to declared `sizes`, all exceed viewport or container width. An empty active mapping suppresses a slot; `1x1` and `fluid` are exempt | Configure sizes/mapping that fit the available width |
| R05 | Insufficient reservation or creative overflow | Medium | Implemented | Concrete `dom.reservation.height` on the slot or nearby wrapper is smaller than the rendered creative, or the creative exceeds the measured box. Larger reserved boxes and legacy `reservedHeight:false` alone are inconclusive | Reserve expected height per breakpoint or review clipping/overflow; measure layout shifts before claiming CLS |
| R06 | Multi-slot batching not observed | Low | Implemented | At least two distinct slot identities each requested individually; `dids`/encoded paths establish slot count. Repeat refreshes do not increase the distinct-slot count. Compressed transport does not establish configured SRA | Review whether compatible initial slots can be batched; separate lazy/refresh requests may be intentional |
| R07 | Mixed correlators in one page view | High | Implemented | More than one distinct `correlator` across `kind: "display"` ad requests in one page view (video requests carry independent correlators). When each correlator also has its own `pvsid`, the evidence says so: the requests come from separate GPT instances (passback creatives, wrappers), see `frames[]` | Ensure initial slots are requested in a single batched call; eliminate repeated `display()` calls. Separate instances: define the slots once in the main frame and let passbacks call `refresh([slot])` |
| R08 | Initial load disabled but nothing ever refreshed | High | Implemented | `gpt.initialLoadDisabled === true`, zero `kind: "display"` requests fired, and no probe `slotRequested` events | Add a fallback timeout in header bidding to trigger `googletag.pubads().refresh()` |
| R09 | Consent signal mismatch | High / Medium | Implemented | GDPR requests with empty TC string or explicitly absent main-frame TCF API (High); contradictory custom GDPR keys, differing TC strings, or final CMP UI status with unverified request ordering (Medium). Missing `npa`/`ltd` alone does not establish a violation | Verify CMP signal and request timing/frames; GPT can apply CMP-based limited ads automatically |
| R10 | Legacy or duplicate gpt.js | Medium | Implemented | `gpt.legacyHost === true` (`googletagservices.com`), more than one gpt.js script tag (main frame and same-origin iframes, `scriptTags[].frame`), or a script tag without `async`; fallback for frames the collector cannot read: `network.libraries` shows gpt.js from the legacy host or more gpt.js loads than script tags | Load exactly one asynchronous tag from `https://securepubads.g.doubleclick.net/tag/js/gpt.js`; creatives and wrappers reuse `window.googletag` |
| R13 | Targeting value looks like PII or URL is oversized | High | Implemented | Regex matches email addresses, phone numbers, or explicit PII keys in slot/page `targeting`, `cust_params`, `scp`, or `prev_scp`; or ad request URL > 8 000 chars | Hash or remove PII keys; trim excessive targeting parameters |
| R17 | GPT loaded in the main frame but never used there | Low | Implemented | `gpt.present` and `gpt.mainFrameSlotCount === 0` (no slot without `frame`); the evidence names where GAM is reached instead: `frames[]` instances and their slots, video requests, or display requests from unreadable frames | Move the GAM slots into the main-frame instance (passbacks via `refresh()`), or remove the unused tag (~250 KB of JavaScript) |
| R18 | Several slots share one ad unit path | Low | Implemented | Two or more slots with different `elementId` and the same `adUnitPath`, unless a position key (`pos`, `position`, `slot`, `miSlot`, `contId`, `placement`, …) has a distinct value on every one of them | Give each position its own (child) ad unit or set a position key-value on every slot so reports and line items can target positions |
| R16 | Publisher mandatory parameter missing | High / Medium | Implemented | Snapshot or ad requests lack parameters specified in publisher config (`gpt-audit.config.json`): missing PPID, missing required `cust_params`, missing page targeting, or missing slot targeting | Ensure mandatory parameters are passed in GPT targeting or set via `pubads().setPublisherProvidedId(...)` |

## Planned / Stretch Rules (R11–R12, R14–R15)

| ID | Rule | Severity | Status | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- | --- |
| R11 | Command queue never flushed | High | Planned | `gpt.cmdQueueLength > 0` after page load, and `gpt.pubadsReady === false` | Verify `googletag.enableServices()` was invoked and check console for unhandled syntax errors in callbacks |
| R12 | Refresh interval under 30 s | Medium | Planned | Probe events record two `slotRequested` events for the same slot less than 30 s apart | Follow Google refresh guidance and verify applicable GAM inventory declarations |
| R14 | Prebid keys without a bid, or timeout below response times | Medium | Planned | `hb_*` targeting keys present on a slot without a corresponding winning bid in `neighbours.prebid.bids`; or `bidderTimeout` lower than median `timeToRespond` | Review `pbjs.setTargetingForGPTAsync()` timing; raise `bidderTimeout` |
| R15 | Slot never viewable | Low | Planned | Probe events record no `impressionViewable` after full scroll pass; slot located far below the fold without GPT lazy-loading enabled | Enable GPT lazy loading (`googletag.pubads().enableLazyLoad()`) for below-the-fold slots |

## Finding Format (`findings.json`)

```json
{
  "id": "R05",
  "severity": "medium",
  "slot": "advert_tmg_ban",
  "evidence": "container #advert_tmg_ban height (100px) differs from creative height (250px) by 150px",
  "fix": "reserve container min-height matching creative height (250px) to eliminate layout shift"
}
```
