# /gampad/ads query parameters

Ad requests go to `https://securepubads.g.doubleclick.net/gampad/ads?...` (older setups also `pubads.g.doubleclick.net`).
`network-extract.js` parses these; `analyze.js` reads them. Parameters not listed here are kept in `raw` and otherwise ignored.

| Parameter | Meaning | Used by |
| --- | --- | --- |
| `output` | Output response format: `vast*` or `xml_vast*` indicates video; `ldjh` or default indicates display | Kind classification (`video` vs `display`), R06, R07 |
| `iu` | Ad unit path of the slot (non-SRA request) | Slot matching, R01, R06 |
| `iu_parts`, `enc_prev_ius` | SRA request: ad unit path parts and encoded path per slot | SRA detection, slot matching, R06 |
| `dids` | Comma-separated slot DOM element IDs included in request | Slot matching, R01 |
| `sz` | Requested sizes of the slot, e.g. `300x250\|300x600` (non-SRA) | R04, slot table |
| `prev_iu_szs` | SRA: requested sizes per slot, slots separated by `\|`, sizes by `,` | R04, slot table |
| `cust_params` | URL-encoded page-level key-values (`k=v&k2=v2`) | Targeting analysis, R13 |
| `scp` | URL-encoded slot-level key-values (SRA) | Slot targeting, R13, R14 (`hb_*`) |
| `correlator` | Page-view ID shared by all requests of one page load | R07 (mixed correlators) |
| `gdpr` | `1` when GDPR / IAB TCF applies, `0` otherwise | R09 (consent mismatch), report |
| `gdpr_consent` | IAB TCF consent string (stored as character length) | R09, report |
| `addtl_consent` | Google Additional Consent string | Report privacy signals |
| `us_privacy` | IAB US Privacy (CCPA) string (e.g. `1---` or `1YNN`) | Report privacy signals |
| `gpp`, `gpp_sid` | Global Privacy Platform string and applicable section IDs | Report privacy signals |
| `npa` | `1` = non-personalised ads requested | R09, report |
| `ltd` | `1` = limited ads mode enabled | R09, report |
| `rdp` | `1` = restricted data processing (CCPA) | Report privacy signals |
| `tfcd` | `1` = COPPA child-directed treatment | Report privacy signals |
| `tfua` | `1` = Under age of consent treatment | Report privacy signals |
| `ppid` | Publisher-Provided Identifier (boolean flag: present/absent) | Report |
| `pvsid` | Page-view session identifier | Report |
| `eid` | GPT experiment IDs | Report |
| `ifi` | Iframe index of the slot (`1`, `2`, ...) | Slot matching |
| `biw`, `bih`, `u_sd` | Browser inner width/height, device pixel ratio | R04 cross-check |
| `sfv` | SafeFrame container version | Report |

## Library Loads
- `/tag/js/gpt.js`: Current standard host is `securepubads.g.doubleclick.net/tag/js/gpt.js` (legacy: `googletagservices.com`, flagged by R10).
- `pubads_impl*.js`: The Google Ad Manager implementation script loaded asynchronously by `gpt.js`. Recorded with status and load timing.

## Added in network-extract 0.2.0

| Parameter | Field in `network.json` | Meaning |
| --- | --- | --- |
| `prev_scp` | `prev_scp` (array, one object per slot) | slot-level key-values of every slot in the request, segments separated by `\|`; the place where ad-server passbacks copy their own targeting (e.g. `GDPR_APPLIES`, `miSlot`) |
| `dids` | `dids` | div ids of the slots in the request, in order |
| `impl` | `impl` | render implementation: `fif` friendly iframe, `ifr` iframe, `s` (video) |
| `frm` | `frm` | frame context bit field; > 0 when GPT runs inside an iframe |
| response header `google-lineitem-id` | `fill.lineItemIds` | line item(s) that filled the request; `-1` = AdX / Open Bidding backfill |
| response header `google-creative-id` | `fill.creativeIds` | creative(s) served; `-1` for backfill |
| response header `google-mediationgroup-id` | `fill.mediationGroupId` | yield group that won (Open Bidding / mediation), `-2` when none |
| response header `content-length`, `date` | `fill.contentLength`, `fill.date` | size of the response (an empty ldjh response is ~1–2 KB, a filled one tens of KB) and the server time |

`fill` is `null` for rows that came from a list line without a `get_network_request` block.
