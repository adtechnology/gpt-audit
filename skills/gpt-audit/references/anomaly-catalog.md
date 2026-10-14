# Anomaly Catalog

Rule IDs are stable; the analyzer, the report, the test suite, and the demo fixture refer to them.
Severity levels: `high`, `medium`, `low`.
`status: "needs-validation"` distinguishes observations requiring publisher context from confirmed failures.
Evidence names the exact fields of `snapshot.json` (collector) and `network.json` (network-extract).

## Implemented Rules (R01–R10)

| ID | Rule | Severity | Status | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- | --- |
| R01 | Slot has no observed request | High / Low validation | Implemented | No response, queryId, request event or matching network identity. Explicit `slotElementIds`/`dids` outrank shared ad-unit paths; MCM separators normalized. Hidden/inactive slots are low, needs-validation | Check activation, breakpoint and request lifecycle before changing display registration |
| R02 | Slot div missing in DOM or duplicated | High | Implemented | `dom.exists` is false, or two or more slots in `slots[]` share the same `elementId` | Ensure a unique container div exists in DOM with matching id |
| R03 | Unfilled slot | Medium | Implemented | `slot.render.isEmpty === true`. (Note: filled slots with `lineItemId: null` and `isBackfill: true` are AdX/Open Bidding fills and are not flagged as unfilled) | Check line-item targeting, floor prices, and advertiser demand for the ad unit |
| R04 | No requested size fits the viewport | Medium | Implemented | Every entry of `sizes` is wider than `meta.viewport.w`. (`1x1` and `fluid` sizes fit any container and are exempt) | Configure responsive `sizeMapping` or include smaller creative sizes for narrow screens |
| R05 | Fixed-size creative exceeds visible placement geometry | Medium | Implemented | Positive fixed creative dimensions exceed a visible slot or clipping ancestor. Hidden, fluid/native, tracking and wrapper-reserved cases are excluded; extra container height alone is not a defect | Check intended overflow/clipping and available placement space; measure CLS separately |
| R06 | Individual requests offer a batching opportunity | Low | Implemented | Multiple distinct display identities are requested without observed SRA encoding; refresh-only/video traffic excluded | Consider `googletag.setConfig({singleRequest: true})` before enabling services when batching fits publisher needs |
| R07 | Multiple correlators observed | Low validation | Implemented | Distinct display correlators with request-group evidence; refresh can legitimately change correlators | Validate refresh/page-view boundaries and ordering; do not infer duplicate display calls from correlators alone |
| R08 | Initial load disabled but nothing ever refreshed | High | Implemented | `gpt.initialLoadDisabled === true`, zero `kind: "display"` requests fired, and no probe `slotRequested` events | Add a fallback timeout in header bidding to trigger `googletag.pubads().refresh()` |
| R09 | Consent signaling needs validation | Medium validation | Implemented | `gdpr=1` with a missing/empty captured TC string unless explicit limited-ads mode applies. P1 denial or an absent top-level CMP alone is insufficient | Validate request timing, applicable mode and CMP integration; this is not a legal compliance verdict |
| R10 | Legacy or duplicate gpt.js | Medium | Implemented | `gpt.legacyHost === true` (`googletagservices.com`), more than one gpt.js script tag, or a script tag without `async` | Load exactly one asynchronous tag from `https://securepubads.g.doubleclick.net/tag/js/gpt.js` |
| R16 | Publisher mandatory parameter missing | High / Medium | Implemented | Snapshot or ad requests lack parameters specified in publisher config (`gpt-audit.config.json`): missing PPID, missing required `cust_params`, missing page targeting, or missing slot targeting | Ensure mandatory parameters are passed in GPT targeting or set via `pubads().setPublisherProvidedId(...)` |

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
  "evidence": "fixed creative exceeds its visible clipping container",
  "fix": "check the active creative placement and clipping styles; measure CLS separately"
}
```

See [evidence-review.md](evidence-review.md) for contextual review and primary references. Unknown
configuration, status and timing stay unknown in reports. The HTML rule score excludes validation
observations and does not establish complete site health or compliance.
