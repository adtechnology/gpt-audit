# /gampad/ads query parameters

Ad requests go to `https://securepubads.g.doubleclick.net/gampad/ads?...` (older setups also `pubads.g.doubleclick.net`).
`network-extract.js` parses these; `analyze.js` reads them. Parameters not listed here are kept in `raw` and otherwise ignored.

| Parameter | Meaning | Used by |
| --- | --- | --- |
| `iu` | ad unit path of the slot (non-SRA request) | slot matching, R01, R06 |
| `iu_parts`, `enc_prev_ius` | SRA request: ad unit path parts and the encoded path per slot | SRA detection, slot matching, R06 |
| `sz` | sizes of the slot, e.g. `300x250\|300x600` (non-SRA) | R04 |
| `prev_iu_szs` | SRA: sizes per slot, slots separated by `\|`, sizes by `,` | R04 |
| `cust_params` | URL-encoded page-level key-values (`k=v&k2=v2`) | R13 |
| `scp` | URL-encoded slot-level key-values (SRA) | R13, R14 (`hb_*`) |
| `correlator` | page-view id shared by all requests of one page view | R07 |
| `gdpr` | `1` when the TCF applies, `0` otherwise | R09 |
| `gdpr_consent` | TC string (store its length only) | R09 |
| `addtl_consent` | Google Additional Consent string | report |
| `us_privacy` | US Privacy (CCPA) string | report |
| `gpp`, `gpp_sid` | Global Privacy Platform string and applicable section ids | report |
| `npa` | `1` = non-personalised ads | R09 |
| `ltd` | `1` = limited ads | R09 |
| `rdp` | `1` = restricted data processing | report |
| `tfcd` | `1` = child-directed treatment | report |
| `tfua` | `1` = under the age of consent | report |
| `ppid` | publisher-provided id (store present/absent only) | report |
| `pvsid` | page-view session id | report |
| `eid` | GPT experiment ids | report |
| `ifi` | iframe index of the slot | slot matching |
| `biw`, `bih`, `u_sd` | browser inner width/height, device pixel ratio | R04 cross-check |
| `sfv` | SafeFrame version | report |

Library loads to record with their timing: `/tag/js/gpt.js` from `securepubads.g.doubleclick.net` or `pagead2.googlesyndication.com` (current) or `www.googletagservices.com` (legacy, R10), and `pubads_impl*.js` (the GPT implementation module).
