# gpt-audit

Audit the Google Publisher Tag (GPT / Google Ad Manager) setup of a web page in a live Chrome browser: every slot, every ad request, the consent signals, a fixed set of anomaly rules, and a clean markdown report.

Packaged as a single cross-platform plugin that installs in **Google Antigravity**, **Claude Code**, and **OpenAI Codex**. The browser layer is Google's [Chrome DevTools for agents](https://github.com/ChromeDevTools/chrome-devtools-mcp) (`chrome-devtools-mcp`).

---

## Quick Links

- 📖 **[Installation Guide](docs/INSTALL.md)** — Step-by-step installation for Google Antigravity, Claude Code, and OpenAI Codex.
- 🚀 **[Usage Guide](docs/USAGE.md)** — Natural language prompt examples, subagent commands, output artifacts, and CLI instructions.
- 📋 **[Anomaly Catalog](skills/gpt-audit/references/anomaly-catalog.md)** — Description, severity, evidence, and remediation for rules R01–R15.
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
              └─► analyze.js (rules R01-R10, deterministic) ──► findings.json
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

In addition to individual reports, the agent outputs `out/comparison.md` summarizing slots, requests, SRA, Prebid version, consent signals, unfilled slots, and anomaly counts in a single table.

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
| `snapshot.json` | In-page DOM and pubads state (version, slots, targeting, events) |
| `network-raw.txt` | Verbatim MCP tool output from Chrome DevTools |
| `network.json` | Parsed `/gampad/ads` ad calls (SRA, params, consent, display/video kind) |
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

## Development & Testing

```bash
# Run unit test suite (10/10 tests)
npm test

# Syntax-check all Node scripts
npm run check

# Serve local planted anomaly fixture pages
npm run fixture
```

---

## License

MIT
