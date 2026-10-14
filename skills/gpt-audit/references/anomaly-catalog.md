# Anomaly catalog

Rule ids are stable; the report, the tests and the fixture refer to them. Severity: high, medium, low.
Evidence names the fields of `snapshot.json` (collector) and `network.json` (network-extract).

| ID | Rule | Severity | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- |
| R01 | Slot defined but never requested or displayed | High | slot has no `response`, no `dom.queryId`, and no `gampad/ads` row names its ad unit | call `googletag.display(id)` or remove the definition |
| R02 | Slot div missing in DOM or duplicated | High | `dom.exists` false, or the element id occurs more than once in the DOM | fix the container ids |
| R03 | Unfilled slot | Medium | request was made (queryId or network row) but `response` null, or iframe absent / 0 height | check line-item targeting, sizes, floor prices |
| R04 | No requested size fits the viewport | Medium | every entry of `sizes` is wider than `meta.viewport.w` or than `dom.rect.w` | add a size mapping or a smaller size |
| R05 | Container size differs from rendered creative | Medium | `dom.rect` vs `iframe.w/h` differ by more than 2 px, or `dom.reservedHeight` false | reserve min-height per breakpoint (CLS) |
| R06 | Single Request Architecture off | Low | number of `gampad/ads` rows ≥ number of requested slots and no row has `iu_parts` | `googletag.pubads().enableSingleRequest()` |
| R07 | Mixed correlators in one page view | High | more than one distinct `correlator` across the rows of one load | check for repeated `display()` or page-level resets |
| R08 | Initial load disabled but nothing ever refreshed | High | `gpt.initialLoadDisabled` true, zero `gampad/ads` rows, no refresh in probe events | add the header-bidding timeout fallback that calls `refresh()` |
| R09 | Consent mismatch | High | `gdpr=1` with empty `gdpr_consent`; `gdpr=1` but no `__tcfapi`; `npa` absent while TCF purpose 1 consent is false | fix the CMP wiring or set `npa`/`ltd` |
| R10 | Legacy or duplicate gpt.js | Medium | `gpt.legacyHost` true, more than one gpt.js script tag, or a tag without `async` | one async tag from `securepubads.g.doubleclick.net/tag/js/gpt.js` |
| R11 | Command queue never flushed | High | `gpt.cmdQueueLength` > 0 after load, `gpt.pubadsReady` false | `googletag.enableServices()` missing or an earlier callback throws |
| R12 | Refresh interval under 30 s | Medium | probe events: two `slotRequested` for one slot less than 30 s apart | respect the 30 s minimum |
| R13 | Targeting value looks like PII or is oversized | High | regex for email / phone / long hex ids in slot or page `targeting` or `cust_params`; request URL longer than 8 000 chars | hash or drop the key, trim key-values |
| R14 | Prebid keys without a bid, or timeout below response times | Medium | `hb_*` targeting on a slot with no bid in `neighbours.prebid.bids`; `bidderTimeout` lower than the median `timeToRespond` | check `setTargetingForGPTAsync`, raise the timeout |
| R15 | Slot never viewable | Low | probe: no `impressionViewable` after the scroll pass, slot far below the fold without lazy load | lazy-load below-the-fold slots |

Finding format: `{ "id": "R05", "severity": "medium", "slot": "div-gpt-ad-d", "evidence": "container 300×100, iframe 300×250", "fix": "..." }`.
