# Anomaly Catalog

Rule IDs are stable; the analyzer, the report, the test suite, and the demo fixture refer to them.
Severity levels: `high`, `medium`, `low`.
Evidence names the exact fields of `snapshot.json` (collector) and `network.json` (network-extract).

## Implemented Rules (R01–R10)

| ID | Rule | Severity | Status | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- | --- |
| R01 | Slot defined but never requested or displayed | High | Implemented | Slot in `slots[]` has no `response`, no `dom.queryId`, no `slotRequested` events, and no `gampad/ads` display request mentions its ad unit or elementId | Call `googletag.display(id)` or remove the definition |
| R02 | Slot div missing in DOM or duplicated | High | Implemented | `dom.exists` is false, or two or more slots in `slots[]` share the same `elementId` | Ensure a unique container div exists in DOM with matching id |
| R03 | Unfilled slot | Medium | Implemented | `slot.render.isEmpty === true`. (Note: filled slots with `lineItemId: null` and `isBackfill: true` are AdX/Open Bidding fills and are not flagged as unfilled) | Check line-item targeting, floor prices, and advertiser demand for the ad unit |
| R04 | No requested size fits the viewport | Medium | Implemented | Every entry of `sizes` is wider than `meta.viewport.w`. (`1x1` and `fluid` sizes fit any container and are exempt) | Configure responsive `sizeMapping` or include smaller creative sizes for narrow screens |
| R05 | Container size differs from rendered creative | Medium | Implemented | Rendered creative height differs from container `dom.boundingRect.height` by > 2 px, or `dom.reservedHeight` is false. (`1x1` and `fluid` exempt) | Reserve container min-height per breakpoint via CSS matching creative height to prevent CLS |
| R06 | Single Request Architecture off | Low | Implemented | Number of `kind: "display"` `gampad/ads` requests ≥ requested slot count (≥ 2) and no request contains `iu_parts` or `enc_prev_ius` (video requests excluded) | Call `googletag.pubads().enableSingleRequest()` before `enableServices()` |
| R07 | Mixed correlators in one page view | High | Implemented | More than one distinct `correlator` across `kind: "display"` ad requests in one page view (video requests carry independent correlators) | Ensure initial slots are requested in a single batched call; eliminate repeated `display()` calls |
| R08 | Initial load disabled but nothing ever refreshed | High | Implemented | `gpt.initialLoadDisabled === true`, zero `kind: "display"` requests fired, and no probe `slotRequested` events | Add a fallback timeout in header bidding to trigger `googletag.pubads().refresh()` |
| R09 | Consent mismatch | High | Implemented | `gdpr=1` with empty/missing `gdpr_consent` (length 0); or `gdpr=1` without `window.__tcfapi` present; or TCF purpose 1 consent false while ad requests omit both `npa=1` and `ltd=1` | Verify CMP wiring passes a valid TC string before GPT requests, or set `npa=1`/`ltd=1` when Purpose 1 consent is denied |
| R10 | Legacy or duplicate gpt.js | Medium | Implemented | `gpt.legacyHost === true` (`googletagservices.com`), more than one gpt.js script tag, or a script tag without `async` | Load exactly one asynchronous tag from `https://securepubads.g.doubleclick.net/tag/js/gpt.js` |

## Planned / Stretch Rules (R11–R15)

| ID | Rule | Severity | Status | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- | --- |
| R11 | Command queue never flushed | High | Planned | `gpt.cmdQueueLength > 0` after page load, and `gpt.pubadsReady === false` | Verify `googletag.enableServices()` was invoked and check console for unhandled syntax errors in callbacks |
| R12 | Refresh interval under 30 s | Medium | Planned | Probe events record two `slotRequested` events for the same slot less than 30 s apart | Respect the 30-second minimum auto-refresh interval mandated by policy |
| R13 | Targeting value looks like PII or is oversized | High | Planned | Regex matches email addresses, phone numbers, or UUID/hex hashes in slot/page `targeting` or `cust_params`; or ad request URL > 8 000 chars | Hash or remove PII keys; trim excessive targeting parameters |
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
