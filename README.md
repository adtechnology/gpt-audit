# gpt-audit

Audit the Google Publisher Tag (GPT / Google Ad Manager) setup of a web page in a live Chrome browser: every slot (in the main frame and in same-origin iframes that run their own GPT, such as ad-server passbacks), every ad request, the consent signals, a fixed set of anomaly rules, and a clean markdown report.

Packaged as a single cross-platform plugin that installs in **Google Antigravity**, **Claude Code**, and **OpenAI Codex**. The browser layer is Google's [Chrome DevTools for agents](https://github.com/ChromeDevTools/chrome-devtools-mcp) (`chrome-devtools-mcp`).

---

## Quick Links

- 🌐 **[Interactive HTML Docs](docs/index.html)** — View the interactive web documentation portal (`npm run docs`).
- 📖 **[Installation Guide](docs/INSTALL.md)** — Step-by-step installation for Google Antigravity, Claude Code, and OpenAI Codex.
- 🚀 **[Usage Guide](docs/USAGE.md)** — Natural language prompt examples, subagent commands, output artifacts, and CLI instructions.
- 📋 **[Anomaly Catalog](skills/gpt-audit/references/anomaly-catalog.md)** — Description, severity, evidence, and remediation for rules R01–R18.
- 🔍 **[GAM Query Parameters](skills/gpt-audit/references/gampad-params.md)** — Breakdown of parsed `/gampad/ads` parameters.
- 🎯 **[Demo Targets](docs/TARGETS.md)** — Reference URLs and sample test properties.
- 🛠 **[Build Plan](docs/PLAN.md)** — Technical architecture and hackathon phase roadmap.

---

## How It Works

```text
Agent (reads skills/gpt-audit/SKILL.md, orchestrates only)
  └─► Chrome DevTools MCP (chrome-devtools-mcp, isolated local Node process via npx)
        └─► Chrome, isolated profile (the audited page; collect-gpt.js runs in-page)
              ├─► out/<host>/snapshot.json + network.json (+ page.png, console.png)
              └─► analyze.js (rules R01-R10, R16-R18, deterministic) ──► findings.json
                    └─► report.js ──► report.md + report.json (+ comparison.md for multiple URLs)
```

Everything runs locally on your laptop. Nothing is deployed, and no external API keys or cloud services are required. The agent only drives the browser and runs the scripts; the analysis is 100% deterministic code, guaranteeing identical findings regardless of which agent you use.

---

## Quick Install

See the **[Installation Guide](docs/INSTALL.md)** for full instructions, prerequisites, and troubleshooting.

### 1. Google Antigravity
```bash
# Global plugin install
mkdir -p ~/.gemini/config/plugins
git clone https://github.com/adtechnology/gpt-audit.git ~/.gemini/config/plugins/gpt-audit

# Or via agy CLI
agy plugin install https://github.com/adtechnology/gpt-audit
```
*(Note: If the built-in Chrome DevTools plugin is also enabled in Antigravity, disable one to avoid duplicate server names).*

### 2. Claude Code
```bash
# Local testing / development
claude --plugin-dir /path/to/gpt-audit

# Or install from marketplace
/plugin marketplace add adtechnology/gpt-audit
/plugin install gpt-audit@gpt-audit
```

### 3. OpenAI Codex
```bash
# Start Codex inside the repo directory
cd /path/to/gpt-audit && codex

# Or add the plugin marketplace
codex plugin marketplace add https://github.com/adtechnology/gpt-audit.git --sparse .agents/plugins
```

---

## How to Use It

See the **[Usage Guide](docs/USAGE.md)** for prompt variations, subagent invocation, and CI usage.

### Single Page Audit
In any of the three agents, prompt:

> *"Audit the GPT setup on https://www.telegraph.co.uk/ and write the report to out/"*

The agent navigates to the page in an isolated Chrome instance, accepts the CMP consent banner, captures screenshots, extracts slots and network requests, applies rules R01–R10, and answers with:
1. The report header (URL, GPT version, slot count, ad request count, consent state, and anomaly summary).
2. All high-severity findings with clear remediation steps.
3. The link to `out/<host>/report.md`.

### Multi-URL Comparative Audit
To compare multiple URLs (or staging vs production):

> *"Audit the GPT setup on https://site-a.com and https://site-b.com, compare them, and write reports to out/"*

In addition to individual reports, the agent outputs `out/comparison.md` summarizing slots, requests, configured SRA, observed batching, Prebid version, consent signals, unfilled slots, and anomaly counts in a single table.

### Standalone CLI Pipeline (CI / Headless)
You can also run the deterministic analysis pipeline without an interactive agent:

```bash
# Extract network data
npm run extract -- out/<host>/network-raw.txt -o out/<host>/network.json

# Run rule engine
npm run analyze -- out/<host>/snapshot.json out/<host>/network.json -o out/<host>/findings.json

# Generate reports
npm run report -- out/<host>/snapshot.json out/<host>/network.json out/<host>/findings.json -o out/<host>/

# Generate comparison
node skills/gpt-audit/scripts/report.js --compare out/*/report.json -o out/comparison.md
```

---

## Output Artifacts

For each audited URL, files are saved in `out/<host>/` (git-ignored):

| File | Purpose |
| --- | --- |
| `snapshot.json` | In-page DOM and pubads state (version, slots, targeting, events); `frames[]` and `slot.frame` for GPT instances in same-origin iframes |
| `network-raw.txt` | Verbatim MCP tool output from Chrome DevTools (list rows and request blocks, mixed) |
| `network.json` | Parsed `/gampad/ads` ad calls (SRA, params, `prev_scp`, consent, display/video kind, GAM fill headers) |
| `findings.json` | Rule engine output (id, severity, slot, evidence, fix) |
| `report.md` | Complete human-readable markdown audit report |
| `report.json` | Machine-readable summary for CI/CD ingestion |
| `page.png` | Full-page initial viewport screenshot |
| `console.png` | Google Publisher Console screenshot |
| `out/comparison.md` | Multi-host comparison matrix (when auditing > 1 URL) |

---

## Strict Safety Guardrails

`gpt-audit` adheres strictly to browser safety guardrails (`rules/no-ad-interaction.md`):

- **No Ad Interaction**: The agent NEVER clicks, hovers, focuses, or scrolls into ad creative iframes (`google_ads_iframe_*`). Ad clicks are invalid traffic and can penalize the publisher.
- **Read-Only**: The agent never calls `googletag.display()`, `pubads().refresh()`, or `destroySlots()` on third-party pages.
- **One Page Load**: Single navigation per URL. No automated reload loops.
- **Consent Banner**: Automatically clicks "Accept all" on the CMP banner. That is the only click permitted during an audit.

---

## What changed in 0.2.0

Lessons from auditing an ad-tech-heavy homepage (bild.de), where GPT in the main frame defined no slot and
GAM was reached only through ad-server passback creatives:

- **Collector reads GPT instances in same-origin iframes** (passbacks, wrappers): their slots join `slots[]`
  with a `frame` field, the instances are listed in `frames[]`, and `gpt.gptInstances` / `gpt.mainFrameSlotCount`
  summarise the split. The Publisher Console only sees the main frame; the report now sees both.
- **New rules** R17 (GPT loaded in the main frame but idle) and R18 (several slots share one ad unit path
  without a position key). R07 tells repeated `display()` calls apart from separate GPT instances (one `pvsid`
  per correlator), R09 flags a custom `GDPR_APPLIES=0` next to `gdpr=1`, R10 counts legacy-host loads per
  iframe and falls back to the network log, R05 no longer demands reserved height inside iframes.
- **network-extract** accepts list rows and request blocks in one file, drops rows the tool truncated, parses
  `prev_scp` per slot and keeps the GAM fill headers (`google-lineitem-id`, `google-creative-id`,
  `google-mediationgroup-id`) as `fill`.
- **SKILL.md** waits for idle with a `PerformanceObserver` (the resource buffer stops at 250 entries), finds
  CMP buttons inside cross-origin iframes with a verbose snapshot, and fetches the `gpt.js` / `pubads_impl`
  request details right after consent, before the DevTools request buffer evicts them.

## What changed in 0.2.1

- **TCF v2 decoder** (`scripts/tcf.js`): decodes the TC string core segment (purpose consents and
  legitimate interests 1–10, special features, Google vendor 755), merges it with the live `__tcfapi`
  state and the `gdpr_consent` seen on the network, and rates GAM eligibility (personalized,
  non-personalized, limited ads). The report gets a "TCF v2 Consent & Purpose Analysis" section with
  CMP details and health checks; `report.json` carries `tcf`, `consent.purposeConsents`, `prebid` and
  the `sra` / `lazyLoad` / `initialLoadDisabled` flags.
- **R13 implemented**: targeting values that look like e-mail addresses, phone numbers or explicit PII
  keys in slot/page targeting, `cust_params`, `scp` or `prev_scp`, and ad request URLs over 8 000 chars.
- **R09** adds two checks: ad requests fired while `eventStatus` is `cmpuishown` (High) and a network
  `gdpr_consent` that differs from the `__tcfapi` `tcString` (Medium); Purpose 1 is read from the
  decoded purposes as well.
- **R02** flags duplicate DOM ids (`dom.count > 1`), not only slots sharing an `elementId`.
- **R04** also fires when every fixed size is wider than the slot container (`dom.boundingRect.width`),
  and no longer needs a viewport width to run.
- Multi-URL comparison report fixed.

## Audit evidence corrections

- The collector records active viewport sizes, nearby CSS reservations, capture-time viewport position, and targeting keys beyond the previous 20-key limit, including header-bidding and position keys. Capture/truncation limits are explicit.
- R05 distinguishes insufficient reservation and creative overflow from intentional larger containers; it does not claim measured CLS. R06 distinguishes compressed request transport, actual multi-slot batching, and configured SRA.
- Reports keep absent privacy flags and unavailable HTTP statuses unknown, show unverified fill as unknown, preserve request timing/batching fields, and withhold a numerical health score. Comparisons use the same evidence.
- TCF checks do not equate absent NPA/LTD parameters with a Purpose 1 violation. A final CMP dialog snapshot does not establish when earlier requests were sent.
- The skill verifies consent acceptance and scrolling progress. Optional [BrowserOS capture](skills/gpt-audit/references/browseros-capture.md) preserves partial initial coverage and supports saved Resource Timing input.

## Development & Testing

```bash
# Run the regression test suite
npm test

# Syntax-check all Node scripts
npm run check

# Serve local planted anomaly fixture pages
npm run fixture
```

---

## License

MIT
