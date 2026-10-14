# GPT Audit — Hackathon Build Plan (Antigravity, Claude Code, Codex)

Oct 14, 2026 · @Carlos Bracho

Implementation note: the original phase tables below describe the prototype plan. Current evidence
classification and capture behavior are maintained in `skills/gpt-audit/SKILL.md` and
`skills/gpt-audit/references/anomaly-catalog.md`; those supersede the initial severity heuristics.

## Goal and pitch

One repo that installs as a plugin in Antigravity, Claude Code and OpenAI Codex and, given a URL, audits the Google Publisher Tag (GPT) setup on that page: it opens the page in a real Chrome through Chrome DevTools for agents (`chrome-devtools-mcp`), reads the live `googletag` state and every Ad Manager ad request, runs a fixed set of anomaly rules and writes a report of all slots plus the findings.

- **Who it is for:** ad-ops and ad-tech engineers who already use one of these agents and want "audit the GPT setup on \<url>" to be a one-line command.
- **Output per run:** `report.md` (slot table + findings with fixes), `report.json` (machine-readable), two screenshots (the page, the GPT Publisher Console).
- **Pitch line for the judges:** "The same audit skill runs in whichever agent your ad-ops team already uses, on Google's own browser tooling."
- **Hackathon scope:** display GPT on one page per run, desktop viewport, the CMP is always accepted. Video/IMA, AMP and app SDKs are out.

## Architecture

```
Agent (Antigravity / Claude Code / Codex; reads SKILL.md, orchestrates only)
  -> Chrome DevTools MCP (chrome-devtools-mcp, a local Node process started by npx)
    -> Chrome, isolated profile (the audited page; collect-gpt.js runs in-page)
      -> out/<host>/ (snapshot.json, network.json, page.png, console.png; written by the agent)
        -> analyze.js (rules R01-R15, deterministic) -> findings.json
          -> report.js -> report.md + report.json (+ comparison.md for several URLs)
Everything runs on the laptop: no server, no deployment.
```

The agent reads `SKILL.md` and calls MCP tools (`navigate_page`, `evaluate_script`, `list_network_requests`, `get_network_request`, `take_screenshot`); the MCP, a Node process that `npx` starts on the laptop, drives an isolated Chrome in which `collect-gpt.js` runs; the agent saves the snapshot and the ad-request log to `out/`, then runs `analyze.js` and `report.js`, plain Node scripts that hold all the judgement. One folder is the plugin for all three agents: a shared `skills/` directory and three small manifests. Nothing is deployed and no API key is needed beyond the agent's own login.

## Manual setup checklist (you, before Antigravity writes code)

About 45 minutes of hand work; after this, everything is a prompt in Antigravity. Do them in this order.

- [ ] **Machine:** Node.js 22 or newer and current Chrome stable; `chrome-devtools-mcp` needs both; Node is only a runtime on this laptop, nothing runs on a server ([Chrome DevTools MCP repo](https://github.com/ChromeDevTools/chrome-devtools-mcp)). Check with `node -v`, then run `npx -y chrome-devtools-mcp@latest --help` once so npx caches the package.
- [ ] **Antigravity app:** install from [antigravity.google/download](https://antigravity.google/download), sign in with the Google account you use for the hackathon. Then Settings → Customizations → Build with Google Plugins → enable **Chrome DevTools** ([Build with Google](https://antigravity.google/docs/build-with-google/)). This gives Antigravity the Chrome DevTools MCP plus Google's Puppeteer skills.
- [ ] **Antigravity CLI (`agy`):** install it too ([CLI install](https://antigravity.google/docs/cli/install/)); you need it for `agy plugin install` and `agy plugin list` in the demo.
- [ ] **GitHub repo:** it already exists at [github.com/adtechnology/gpt-audit](https://github.com/adtechnology/gpt-audit). Clone it with `git clone https://github.com/adtechnology/gpt-audit.git`, make sure it is public (judges install with `agy plugin install https://github.com/adtechnology/gpt-audit`), and add an MIT `LICENSE`, a Node `.gitignore` and a README if they are missing.
- [ ] **Open the clone in Antigravity:** File → Open Folder. Add `out/` and `node_modules/` to `.gitignore`; commit `.agents/` (it holds the workspace skills and MCP config the plugin itself uses), never anything with keys.
- [ ] **Permissions:** in Antigravity's agent settings, review the terminal execution mode and the browser allowlist/denylist ([Allowlist and denylist](https://antigravity.google/docs/ide/allowlist-denylist/)) so the agent can run `npm`/`node` and open your demo URLs without a prompt per action. Keep the denylist on everything else.
- [ ] **Demo agents on the same laptop (Phase 4 only, no coding there):** Claude Code (`npm install -g @anthropic-ai/claude-code`, then `claude` and log in; [docs](https://docs.claude.com/en/docs/claude-code/overview)) and Codex CLI (`npm install -g @openai/codex`, then `codex` and log in).
- [ ] **Demo targets, decided now:** (1) the local fixture page from Phase 3, (2) Google's GPT sample pages (GitHub repo `googleads/google-publisher-tag-samples`), (3) the property you control, (4) two or three foreign GPT properties (other publishers) picked for variety: one with Prebid, one with SRA on, one with lazy loading. List the URLs in `docs/TARGETS.md` now. Each audit is one page load with the CMP accepted, like any visitor; the only clicks the agent ever makes are the consent buttons.
- [ ] **Hackathon logistics:** confirm the submission format (repo link, video, slides), that every teammate has Antigravity credits, and the time box, then set the phase durations below accordingly (they assume roughly one working day).

## Repo layout and manifests

One folder is a valid plugin for all three agents at once: the audit logic lives once under `skills/gpt-audit/`, and only the three small manifests plus two MCP config files differ. Antigravity reads a root `plugin.json` and `mcp_config.json` ([Plugins](https://antigravity.google/docs/plugins/)); Codex reads `.codex-plugin/plugin.json` pointing at `skills/` and `.mcp.json` ([Codex plugins](https://developers.openai.com/plugins/build/plugins.md)); Claude Code reads `.claude-plugin/plugin.json` and the same `.mcp.json`.

```
gpt-audit/
├── plugin.json                  # Antigravity manifest
├── mcp_config.json              # Antigravity → chrome-devtools-mcp
├── .claude-plugin/plugin.json   # Claude Code manifest
├── .claude-plugin/marketplace.json  # one-entry marketplace (lets judges install from the repo)
├── .codex-plugin/plugin.json    # Codex manifest
├── .mcp.json                    # Claude Code + Codex → chrome-devtools-mcp
├── skills/gpt-audit/
│   ├── SKILL.md                 # the audit procedure (Phase 3)
│   ├── scripts/collect-gpt.js   # runs inside the page via evaluate_script (Phase 1)
│   ├── scripts/analyze.js       # Node CLI: snapshot + network log → findings (Phase 2)
│   ├── scripts/report.js        # Node CLI: findings → report.md / report.json (Phase 2)
│   └── references/
│       ├── anomaly-catalog.md   # rule ids, severity, evidence, fix
│       └── gampad-params.md     # glossary of /gampad/ads query params
├── rules/no-ad-interaction.md   # Antigravity rule: never click or hover creatives
├── agents/gpt-auditor.md        # Antigravity subagent (optional)
├── fixtures/
│   ├── broken-page.html         # demo page with planted anomalies
│   └── serve.sh                 # python3 -m http.server 8787 --directory fixtures
├── .agents/skills/gpt-audit -> ../../skills/gpt-audit   # symlink so Antigravity dogfoods the skill while you build
├── package.json                 # "type":"module", scripts: analyze, report, fixture
└── README.md
```

Manifest contents, exactly:

`plugin.json` (Antigravity allows only `name` and `description`; anything else is rejected by its schema):

```json
{
  "$schema": "https://antigravity.google/schemas/v1/plugin.json",
  "name": "gpt-audit",
  "description": "Audit the Google Publisher Tag setup of a page in a live Chrome: slots, ad requests, consent, anomalies, report."
}
```

`mcp_config.json` (Antigravity):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--isolated"]
    }
  }
}
```

`.mcp.json` (Claude Code and Codex; same server):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--isolated"]
    }
  }
}
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "gpt-audit",
  "version": "0.1.0",
  "description": "Audit the Google Publisher Tag setup of a page: slots, ad requests, consent, anomalies, report."
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "gpt-audit",
  "owner": { "name": "adtechnology" },
  "plugins": [{ "name": "gpt-audit", "source": "./", "description": "GPT setup audit" }]
}
```

`.codex-plugin/plugin.json`:

```json
{
  "name": "gpt-audit",
  "version": "0.1.0",
  "description": "Audit the Google Publisher Tag setup of a page: slots, ad requests, consent, anomalies, report.",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

Keep the plugin name, the skill folder name and the `name:` in the SKILL.md frontmatter identical (`gpt-audit`); all three agents match on that. `--isolated` gives the MCP a throwaway Chrome profile, so your own tabs and logins stay untouched; drop it when a demo page needs an existing login.

## Phase 0 — scaffold and smoke test (30 min)

Goal: the repo skeleton exists and Antigravity has proven it can drive Chrome and read `googletag` on a live page. Nothing else.

The scaffold zip from the chat already contains everything in this phase: `docs/PLAN.md` (this file), the manifests, `package.json`, `SKILL.md`, the rules, the fixtures and placeholder scripts. Unzip it into the clone and run `bash apply.sh` (creates the `.agents/skills` symlink, commits, pushes). Antigravity then only checks the skeleton and runs the smoke test.

In Antigravity, open the agent panel, switch to Planning mode (CLI: `/plan`), and paste:

```
Read docs/PLAN.md and AGENTS.md. The repo skeleton is already in place: check it against the section
"Repo layout and manifests", add anything missing, do not rewrite files that exist. Run `npm test`; the
placeholder tests must pass.

Then smoke-test the browser tooling with the Chrome DevTools tools: open <URL>, wait until the network
is idle, accept the consent dialog if one appears, run `googletag.getVersion()` and
`googletag.pubads().getSlots().length` via evaluate_script, list the network requests whose URL contains
"gampad/ads", and report the version, the slot count and the number of ad requests. Do not click anything
else on the page. Commit as "phase 0: smoke test".
```

For `<URL>` use a page you know carries GPT: one of Google's sample pages (linked from the README of the `googleads/google-publisher-tag-samples` repo) or a property you control.

Review the implementation plan Antigravity proposes, approve it, and watch the first terminal commands so the permission prompts are answered once.

Done when:

- [ ] `tree -a -L 3` matches the layout; `node -e "import('./package.json', {with:{type:'json'}})"` runs without error.
- [ ] Antigravity reports a GPT version string, a slot count > 0 and at least one `gampad/ads` request from the test page.
- [ ] The Chrome DevTools tools appear in the agent's tool list (hammer icon). If not: Settings → Customizations → Build with Google Plugins → Chrome DevTools is on, then restart the agent session.
- [ ] Commit "phase 0: smoke test" is on `main`.

## Phase 1 — collector (2 h)

Goal: `collect-gpt.js` is one self-contained async function the agent pastes into `evaluate_script`; it reads the page and returns one JSON object, the snapshot. A second small Node script turns the MCP's network listing into `network.json`. Both are read-only: no `display()`, no `refresh()`, no clicks.

Rules for the collector:

- No imports, no globals left behind except `window.__gptAudit`; under 12 KB so it fits in one tool call.
- Every field in its own try/catch; failures land in `errors[]`, the function never throws. If `googletag` is missing, return `{ gpt: { present: false } }` plus whatever DOM evidence exists (ad-looking divs, gpt.js script tags).
- Async, resolves within 1 500 ms (consent APIs are callback-based); caps: 60 slots, 20 targeting keys per slot, strings cut at 200 chars.
- `opts.probe === true` attaches listeners for `slotRequested`, `slotResponseReceived`, `slotRenderEnded`, `impressionViewable`, `slotOnload` into `window.__gptAudit.events`; the agent then scrolls (via `evaluate_script`, `window.scrollTo`) and calls the collector a second time to read them.

Snapshot fields:

| Group | Field | Source |
| --- | --- | --- |
| meta | url, title, viewport w/h/dpr, userAgent, timestamp, collectorVersion | `location`, `window`, `navigator` |
| gpt | present, version, apiReady, pubadsReady | `googletag.getVersion()`, `googletag.apiReady`, `googletag.pubadsReady` |
| gpt | scriptTags \[{src, async, defer, inHead}\], legacyHost | every `<script>` whose src ends in `/tag/js/gpt.js`; legacy = `googletagservices.com` |
| gpt | cmdQueueLength | `googletag.cmd.length` (> 0 after load = callbacks never ran) |
| gpt | config | `googletag.getConfig()` and `googletag.pubads().getConfig()` where available (singleRequest, lazyLoad, collapseDiv, centering, privacyTreatments, pps, targeting) |
| gpt | initialLoadDisabled | `googletag.pubads().isInitialLoadDisabled()` |
| gpt | pageTargeting | `pubads().getTargetingKeys()` → `{ key: values }` |
| slots\[\] | elementId, adUnitPath, sizes, targeting, categoryExclusions | `getSlotElementId()`, `getAdUnitPath()`, `getSizes()` normalised to `[[w,h]]` or `"fluid"`, `getTargetingKeys()` + `getTargeting(k)` |
| slots\[\] | response | `getResponseInformation()` → advertiserId, campaignId, lineItemId, creativeId, creativeTemplateId, or null |
| slots\[\] | dom | exists, boundingRect, inViewportOnLoad, cssDisplay, reservedHeight (min-height/height set), queryId (`data-google-query-id`) |
| slots\[\] | iframe | present, w, h, safeFrame (src contains `safeframe`) or friendly, name |
| neighbours.prebid | present, version, bidderTimeout, adUnits \[{code, sizes, bidders}\], bids per adUnit \[{bidder, cpm, status, timeToRespond}\], hbKeysOnSlots | `pbjs.version`, `pbjs.getConfig()`, `pbjs.adUnits`, `pbjs.getBidResponses()` |
| neighbours.consent | tcf {present, gdprApplies, tcStringLength, purpose1, cmpId}, gpp {present, sections}, usp {present} | `__tcfapi('getTCData', 2, cb)`, `__gpp('ping', cb)`, `__uspapi` |
| neighbours.apstag | present | `window.apstag` |
| errors\[\] | field, message | try/catch |

`network-extract.js` (Node) takes the saved output of `list_network_requests` + `get_network_request` and writes `out/<host>/network.json`: one row per request to `securepubads.g.doubleclick.net/gampad/ads` (plus `pubads.g.doubleclick.net`) with status, start time, duration, URL length and the parsed query: `iu` or `iu_parts`+`enc_prev_ius` (SRA), `sz`/`prev_iu_szs`, `cust_params` decoded to key/values, `correlator`, `gdpr`, `gdpr_consent` (length only), `addtl_consent`, `us_privacy`, `gpp`, `gpp_sid`, `npa`, `ltd`, `rdp`, `tfcd`, `tfua`, `ppid` (present/absent), `pvsid`, `eid`. It also records every gpt.js and `pubads_impl` load with its timing.

Prompt for Antigravity (Planning mode):

```
Read docs/PLAN.md, section "Phase 1 — collector". Implement skills/gpt-audit/scripts/collect-gpt.js
exactly as specified: one async function `collectGpt(opts)` with no imports that runs inside a web page
and returns the snapshot object with every field listed, each in its own try/catch, the caps and the
probe mode. Implement skills/gpt-audit/scripts/network-extract.js (Node, ESM) that converts saved
list_network_requests/get_network_request output into out/<host>/network.json with the parsed
parameters listed in the plan. Add unit tests for the query parser (SRA and non-SRA URLs).

Then test end to end with the Chrome DevTools tools: open <URL>, wait for network idle, run the
collector via evaluate_script, save the result to out/<host>/snapshot.json, list the network requests,
fetch each gampad/ads request in full, run network-extract.js, and show me a markdown table of the slots
(elementId, adUnitPath, sizes, lineItemId, rendered iframe size) plus the count of ad requests and
whether they share one correlator. Accept the consent dialog if one appears; do not click anything else
on the page. Commit as "collector".
```

Done when:

- [ ] On the test page the snapshot's slot count equals the number of `div[data-google-query-id]` elements and `errors` is empty.
- [ ] `snapshot.json` is under 200 KB; the collector file is under 12 KB.
- [ ] `network.json` has every `gampad/ads` request with its `correlator` and consent parameters parsed.
- [ ] Parser tests pass with `npm test`.

## Phase 2 — analyzer and report (2 h)

Goal: `analyze.js` reads `snapshot.json` + `network.json` and writes `findings.json`; `report.js` turns snapshot + findings into `report.md` and `report.json`. Both are plain Node, deterministic, no LLM involved, so the same input gives the same report in every agent. Build the rules in the order of the table; stop at R10 if time runs out, the rest are stretch.

| ID | Rule | Severity | Evidence (snapshot / network) | Fix in the report |
| --- | --- | --- | --- | --- |
| R01 | Slot defined but never requested or displayed | High | slot has no `response`, no `queryId`, no `gampad/ads` row names its ad unit | call `googletag.display(id)` or remove the definition |
| R02 | Slot div missing in DOM or duplicated | High | `dom.exists` false, or two slots share `elementId` | fix the container ids |
| R03 | Unfilled slot | Medium | `response` null after request, or iframe absent / 0 height | check line-item targeting, sizes, floor prices |
| R04 | No requested size fits the viewport | Medium | all `sizes` wider than `viewport.w` or than `dom.rect.w` | add a size mapping or a smaller size |
| R05 | Container size differs from rendered creative | Medium | `dom.rect` vs `iframe.w/h` differ by more than 2 px, or `reservedHeight` false | reserve min-height per breakpoint (CLS) |
| R06 | Single Request Architecture off | Low | number of `gampad/ads` rows ≥ number of slots and no `iu_parts` | `googletag.pubads().enableSingleRequest()` |
| R07 | Mixed correlators in one page view | High | more than one distinct `correlator` across the rows of one load | check for repeated `display()` or page-level resets |
| R08 | Initial load disabled but nothing ever refreshed | High | `initialLoadDisabled` true, zero `gampad/ads` rows, no `refresh` in probe events | add the header-bidding timeout fallback that calls `refresh()` |
| R09 | Consent mismatch | High | `gdpr=1` with empty `gdpr_consent`; `gdpr=1` but no `__tcfapi`; `npa` absent while `purpose1` consent false | fix the CMP wiring or set `npa`/`ltd` |
| R10 | Legacy or duplicate gpt.js | Medium | `legacyHost` true, more than one script tag, or `async` false | one async tag from `securepubads.g.doubleclick.net/tag/js/gpt.js` |
| R11 | Command queue never flushed | High | `cmdQueueLength` > 0 after load, `pubadsReady` false | `googletag.enableServices()` missing or throws earlier |
| R12 | Refresh interval under 30 s | Medium | probe events: two `slotRequested` for one slot less than 30 s apart | respect the 30 s minimum |
| R13 | Targeting value looks like PII or is oversized | High | regex for email / phone / long hex ids in `targeting` or `cust_params`; URL length > 8 000 | hash or drop the key, trim key-values |
| R14 | Prebid keys without a bid, or timeout below response times | Medium | `hb_*` present on a slot with no bid in `bidResponses`; `bidderTimeout` lower than median `timeToRespond` | check `setTargetingForGPTAsync`, raise the timeout |
| R15 | Slot never viewable | Low | probe: no `impressionViewable` after scroll, slot far below the fold without lazy load | lazy-load below-the-fold slots |

Finding format (`findings.json`): `{ "id": "R05", "severity": "medium", "slot": "div-gpt-ad-1", "evidence": "container 300×250, iframe 300×600", "fix": "..." }`. Severity order: high, medium, low; the report header counts them.

`report.md` layout, in this order:

1. Header: URL, timestamp, GPT version, slot count, request count, consent state (gdpr / tcString present / npa), one line per severity count.
2. Slot table: elementId · ad unit path · sizes · rendered size · lineItemId · creativeId · advertiserId · SafeFrame y/n · in viewport on load y/n · targeting keys.
3. Findings, grouped by severity, each with evidence and fix.
4. Request table: one row per `gampad/ads` call: correlator · ad units (count) · status · duration ms · gdpr · consent present · npa/ltd/rdp.
5. Appendix: page-level targeting, Prebid summary, the two screenshots (`page.png`, `console.png`).

`report.json` carries the same data as one object (`meta`, `slots`, `requests`, `findings`), so a CI job or a second agent can consume it.

Compare mode, for several URLs: `report.js --compare out/*/report.json -o out/comparison.md` writes one table with one row per host: GPT version · slots · ad requests · SRA on/off · lazy load · initial load disabled · Prebid version · consent (gdpr, tcString present, npa) · unfilled slots · findings by severity. This is the "my property vs. foreign properties" view for the demo.

Prompt for Antigravity (Planning mode):

```
Read docs/PLAN.md, section "Phase 2 — analyzer and report". Implement skills/gpt-audit/scripts/analyze.js
(Node, ESM, CLI: analyze.js <snapshot.json> <network.json> -o findings.json) with rules R01 to R10 as
separate functions in skills/gpt-audit/scripts/rules/, each returning findings in the given format, plus
skills/gpt-audit/scripts/report.js (CLI: report.js <snapshot> <network> <findings> -o out/<host>/) that
writes report.md and report.json in the given layout, plus the compare mode
(report.js --compare out/*/report.json -o out/comparison.md, one row per host). Keep both files
dependency-free. Review and complete
skills/gpt-audit/references/anomaly-catalog.md from the rules table and gampad-params.md from the
network-extract parameter list. Add tests with a hand-written snapshot/network fixture that triggers
R01, R05, R06, R07 and R09.
Run it on out/<host>/ from Phase 1 and show me report.md. Commit as "analyzer".
```

Done when:

- [ ] `npm run analyze -- out/<host>/snapshot.json out/<host>/network.json -o out/<host>/findings.json` works and `npm test` passes.
- [ ] `report.md` from the Phase 1 page lists every slot and at least the SRA and consent state correctly (check by hand against the Publisher Console).
- [ ] R11 to R15 are listed in `anomaly-catalog.md` as planned even if not implemented.

## Phase 3 — SKILL.md, rules, fixture, packaging (1.5 h)

Goal: the skill tells any agent the exact procedure, the fixture page guarantees findings for the demo, and the folder validates as a plugin in all three agents.

`skills/gpt-audit/SKILL.md` frontmatter (the Agent Skills format all three read; `name` must equal the folder name):

```
---
name: gpt-audit
description: Audit the Google Publisher Tag (GPT / Google Ad Manager) setup of a web page in a live Chrome. Use when asked to check, audit, debug or report the ad slots, ad requests, consent signals or ad setup of a URL. Requires the chrome-devtools MCP tools.
---
```

Procedure in the body, numbered, each step naming the tool:

1. Check that `navigate_page`, `evaluate_script`, `list_network_requests`, `get_network_request` and `take_screenshot` exist. If not, stop and tell the user to enable the Chrome DevTools plugin (Antigravity) or add `npx -y chrome-devtools-mcp@latest` as MCP server.
2. Create `out/<host>/`. Open the URL in a new page, wait for network idle (about 3 s after the last `gampad/ads` call).
3. Consent: if a CMP dialog is visible, click "accept all" (always accept, never reject) and record it in the report header. These are the only clicks allowed in the whole run.
4. `take_screenshot` → `out/<host>/page.png`.
5. Read `scripts/collect-gpt.js`, run it via `evaluate_script` with `{probe: true}`, save → `snapshot-initial.json`.
6. Scroll to the bottom in 600 px steps with 500 ms pauses (`evaluate_script`, `window.scrollBy`), wait 2 s, run the collector again → `snapshot.json`.
7. `list_network_requests`, then `get_network_request` for every `gampad/ads` and `gpt.js` row; save → `network-raw.json`; run `node scripts/network-extract.js`.
8. Run `node scripts/analyze.js` and `node scripts/report.js`.
9. `evaluate_script` → `googletag.openConsole()`, wait 1 s, `take_screenshot` → `console.png`.
10. Reply with the report header and the high-severity findings per URL, plus comparison.md when several URLs were audited, then the path to `report.md`. Never paste snapshot or network JSON into the chat.

Guardrails, repeated in SKILL.md and in `rules/no-ad-interaction.md` (Antigravity reads the rule file, Claude Code and Codex only the skill): never click, hover or interact with anything inside a `google_ads_iframe_*` frame; never call `display()` or `refresh()` on a page you do not own; one page load per URL; no login, no form input.

`agents/gpt-auditor.md` (Antigravity subagent, optional): frontmatter `name: gpt-auditor`, `description: runs the gpt-audit skill for a URL and returns the report path`, body: "Use the gpt-audit skill. Input: one or more URLs. Output: the report header per URL, the comparison when there are several, and the path to report.md."

`fixtures/broken-page.html`, built on Google's sample network `/6355419/...` ad units from the `google-publisher-tag-samples` repo, with these anomalies planted on purpose:

| Planted | Triggers |
| --- | --- |
| Slot A defined and displayed correctly (control) | nothing |
| Slot B defined, `display()` never called | R01 |
| Slot C's div id used twice | R02 |
| Slot D requests 300×250 into a box forced to 300×100 (overflow hidden), no min-height | R05 |
| Slot E's only size is 970×250 inside a 300 px column | R04 |
| No `enableSingleRequest()` | R06 |
| Two gpt.js tags, one from `www.googletagservices.com` | R10 |
| Page targeting `email=test@example.com` | R13 |
| A 10-line `__tcfapi` stub answering `gdprApplies: true` with no tcString | R09 |

A second file `fixtures/broken-page-hb.html` sets `disableInitialLoad()` and never calls `refresh()` (R08); it must be separate because it stops every request on the page. Serve both with `fixtures/serve.sh` (`python3 -m http.server 8787 --directory fixtures`) at `http://localhost:8787/broken-page.html`.

Packaging checks, run from the repo root:

- Antigravity: the symlink `.agents/skills/gpt-audit` makes the skill active in this workspace; `agy plugin install .` then `agy plugin list --json` must show `skills: ["gpt-audit"]` and `mcpServers: ["chrome-devtools"]`.
- Claude Code: `claude plugin validate .`, then `claude --plugin-dir .`; inside, `/mcp` must list `chrome-devtools` and the skill appears as `gpt-audit`.
- Codex: add `.agents/plugins/marketplace.json` to the repo with `{ "name": "gpt-audit-local", "plugins": [{ "name": "gpt-audit", "path": "./" }] }`; `codex` started inside the repo should list it under `/plugins`; fallback is copying the folder to `~/.codex/plugins/gpt-audit`.

Prompt for Antigravity (Planning mode):

```
Read docs/PLAN.md, section "Phase 3". skills/gpt-audit/SKILL.md, rules/no-ad-interaction.md,
agents/gpt-auditor.md, fixtures/broken-page.html, fixtures/broken-page-hb.html and
.agents/plugins/marketplace.json already exist as drafts: review them against the plan, fix what is wrong,
and make sure the SKILL.md procedure matches the real CLIs of the scripts. Then dogfood: start
fixtures/serve.sh, follow the gpt-audit skill yourself on http://localhost:8787/broken-page.html and show me
report.md. Every planted anomaly must appear as a finding; if one is missing, fix the rule or the fixture,
not the expectation. Run `claude plugin validate .` and `agy plugin list --json` and paste the output.
Commit as "skill".
```

Done when:

- [ ] The fixture run reports R01, R02, R04, R05, R06, R09, R10 and R13; the `-hb` fixture reports R08.
- [ ] Antigravity, started fresh in the workspace, picks the skill up from the one-line prompt "audit the GPT setup on http://localhost:8787/broken-page.html" without being told the skill name.
- [ ] `claude plugin validate .` passes; `agy plugin list --json` shows the skill and the MCP server.

## Phase 4 — install in all three agents and demo (1 h)

Goal: the same one-line prompt produces the same report in Antigravity, Claude Code and Codex, live, in under three minutes per agent. Push the repo first (`git push`), then install from the local folder on the demo laptop; judges can install from the GitHub link.

| Agent | Install (local folder, on your laptop) | Install (judges, from GitHub) | Check the MCP is up | Invoke |
| --- | --- | --- | --- | --- |
| Antigravity app / IDE | copy or symlink the repo into `.agents/plugins/gpt-audit` (workspace) or `~/.gemini/config/plugins/gpt-audit` (global); or enable it under Customizations → Installed | `agy plugin install https://github.com/adtechnology/gpt-audit` | Customizations panel shows the plugin with 1 skill, 1 MCP server; hammer icon lists `chrome-devtools` tools | "Audit the GPT setup on \<url> and write the report to out/"; for several: "audit the GPT setup on \<url1>, \<url2> and \<url3> and compare them" |
| Antigravity CLI (`agy`) | `agy plugin install /path/to/gpt-audit`, then `agy plugin list --json` | same GitHub command | `agy plugin list --json` shows `mcpServers: ["chrome-devtools"]` | same prompt |
| Claude Code | `claude --plugin-dir /path/to/gpt-audit` (dev), or `/plugin marketplace add /path/to/gpt-audit` then `/plugin install gpt-audit@gpt-audit` | `/plugin marketplace add adtechnology/gpt-audit` then `/plugin install gpt-audit@gpt-audit` | `/mcp` lists `chrome-devtools` as connected | same prompt, or `/gpt-audit:gpt-audit <url>` |
| Codex CLI | start `codex` inside the repo (repo marketplace at `.agents/plugins/marketplace.json`) and install via `/plugins`; fallback `cp -R gpt-audit ~/.codex/plugins/gpt-audit` | `codex plugin marketplace add https://github.com/adtechnology/gpt-audit.git --sparse .agents/plugins` then install via `/plugins` | `/mcp` lists `chrome-devtools` | same prompt |

The first run in each agent asks for permission to start `npx chrome-devtools-mcp` and to run `node`; approve once before the demo so the recording has no prompts. Run `npx -y chrome-devtools-mcp@latest --help` beforehand so the package is cached and the first start takes seconds, not a minute.

Demo script (about 8 minutes):

1. 30 s: the problem. A GPT setup breaks silently: unfilled slots, wrong sizes, consent params missing. Ad ops find out from revenue, days later.
2. 1 min: what we built. One repo, three plugins, one skill, deterministic scripts; browser = Chrome DevTools for agents. Show the repo tree.
3. 2 min: Antigravity on the fixture page. Prompt: "audit the GPT setup on http://localhost:8787/broken-page.html". Show the planted anomalies appearing as R-findings, the slot table and the Publisher Console screenshot.
4. 1.5 min: Claude Code, same prompt, same report. Point out that the findings are identical because the rules are code, not model opinion.
5. 1.5 min: Codex on the property you control plus two foreign properties, CMP accepted. Show comparison.md side by side (SRA, lazy load, Prebid, consent parameters, findings) and the live line-item ids in your own slot table.
6. 1 min: what is next. Consent accept/reject diff, CLS attribution per slot, CI mode (`report.json` in a nightly job), ads.txt check.

Talking points for Google judges: built entirely with Antigravity; uses Google's own Chrome DevTools MCP; targets Google Ad Manager; distributable through the Antigravity Marketplace (interest form linked from the Marketplace docs) and the Build with Google pattern.

Done when:

- [ ] All three agents produce `report.md` for the fixture with the same finding ids.
- [ ] The real-property run finishes in under 3 minutes and the slot table shows live line-item / creative ids.
- [ ] README has the three install blocks and a 60-second GIF or screenshot of a run.

## Gotchas, risks and stretch goals

The two things most likely to eat an hour are the CMP and context size; both are handled in the skill, not left to the model.

- **CMP dialogs:** the MCP browser profile is isolated, so every EU page shows the consent dialog. The skill always clicks "accept all" and records it, so every audit shows the post-consent setup; an optional reject run (stretch) would turn the difference in `npa`, `ltd` and `gdpr_consent` into the consent-diff feature.
- **Context size:** `evaluate_script` and `list_network_requests` output goes straight into the agent's context. Summarise in the browser, write full JSON to `out/`, and let `analyze.js` do the reading. Never ask the agent to "look at" raw network JSON.
- **Invalid traffic:** an agent that clicks around a page can click an ad. The rules file and the SKILL.md guardrail forbid any interaction inside `google_ads_iframe_*`; keep it that way even when a judge asks for "more automation".
- **Real impressions:** each run on a production page fires real ad requests and counts as a page view in Ad Manager. Fine for a demo, so use the fixture for repeated test runs. On foreign properties behave like one visitor: one page load, CMP accepted, no retries. If a bot check (Cloudflare and the like) blocks the isolated profile, start the MCP without the --isolated flag so a normal Chrome profile is used.
- **Tool availability differs:** Antigravity gets the Chrome DevTools tools from the Build with Google plugin, Claude Code and Codex from the plugin's `.mcp.json`. If a tool name differs between versions, the skill's step 1 (check tools, else explain) is what keeps the demo alive.
- **Lazy loading and SPAs:** slots that appear after scroll or route changes only show up because of the scroll step and the second collector run; on a single-page app, audit one route per run.
- **Event timings:** `slotRenderEnded` and friends only exist for the probe window (after the collector attached listeners). Timings for the initial load come from `network.json`, not from events; say so in the report.
- **Antigravity plugin manifest:** `plugin.json` accepts only `name` and `description` (its schema sets `additionalProperties: false`); versions live in the Claude Code and Codex manifests only.

Stretch goals, in the order they pay off at the demo:

1. Optional reject run and an accept/reject diff as one table (two runs, parameters side by side).
2. Per-slot CLS attribution with `performance_start_trace` / `performance_stop_trace` and layout-shift entries that name the slot div.
3. `ads.txt` fetch: at least one `google.com` line, and the seller account matches the network code from the ad unit path.
4. CI mode: `analyze.js` + `report.js` on a saved snapshot, exit code 1 on any high finding.
5. Mobile viewport run via the MCP's device emulation, compared with desktop.

Sources: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) · [Antigravity plugins](https://antigravity.google/docs/plugins/) · [Antigravity Marketplace](https://antigravity.google/docs/marketplace/) · [Antigravity Build with Google](https://antigravity.google/docs/build-with-google/) · [Antigravity skills](https://antigravity.google/docs/skills/) · [Codex plugins](https://developers.openai.com/plugins/build/plugins.md) · [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview).
