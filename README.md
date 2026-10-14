# gpt-audit

Audit the Google Publisher Tag (GPT / Google Ad Manager) setup of a web page in a live Chrome: every slot, every ad request, the consent signals, a fixed set of anomaly rules, one report. One repo that installs as a plugin in **Google Antigravity**, **Claude Code** and **OpenAI Codex**; the browser layer is Google's [Chrome DevTools for agents](https://github.com/ChromeDevTools/chrome-devtools-mcp) (`chrome-devtools-mcp`).

Status: hackathon prototype, October 2026. Build plan: [docs/PLAN.md](docs/PLAN.md). Demo targets: [docs/TARGETS.md](docs/TARGETS.md).

## How it works

```
Agent (reads skills/gpt-audit/SKILL.md, orchestrates only)
  -> Chrome DevTools MCP (chrome-devtools-mcp, a local Node process started by npx)
    -> Chrome, isolated profile (the audited page; collect-gpt.js runs in-page)
      -> out/<host>/snapshot.json + network.json (+ page.png, console.png)
        -> analyze.js (rules R01-R15, deterministic) -> findings.json
          -> report.js -> report.md + report.json (+ comparison.md for several URLs)
```

Everything runs on your laptop. Nothing is deployed, no API key is needed beyond the agent's own login. The agent only drives the browser and runs the scripts; the judging is code, so the same page gives the same findings in every agent.

## Usage

Any of the three agents, with the plugin installed:

> Audit the GPT setup on https://example.com and write the report to out/

Several URLs:

> Audit the GPT setup on https://a.example, https://b.example and https://c.example and compare them

The agent accepts the consent dialog, never clicks a creative, loads each page once, and answers with the report header, the high-severity findings and the path to `out/<host>/report.md`.

## Requirements

- Node.js 22 or newer and current Chrome stable (both for `chrome-devtools-mcp`; run `npx -y chrome-devtools-mcp@latest --help` once to cache it).
- One of: Google Antigravity (app, IDE or `agy` CLI), Claude Code, Codex CLI.

## Install

### Antigravity

- Workspace: copy or symlink this repo into `.agents/plugins/gpt-audit`; global: `~/.gemini/config/plugins/gpt-audit`.
- CLI: `agy plugin install https://github.com/adtechnology/gpt-audit` (or `agy plugin install /path/to/gpt-audit`), then `agy plugin list --json`.
- If the Build with Google "Chrome DevTools" plugin is also enabled, two MCP servers named `chrome-devtools` exist; disable one.

### Claude Code

- Dev: `claude --plugin-dir /path/to/gpt-audit`
- Install: `/plugin marketplace add adtechnology/gpt-audit` then `/plugin install gpt-audit@gpt-audit`; `/mcp` must list `chrome-devtools`.

### Codex

- Start `codex` inside this repo (repo marketplace at `.agents/plugins/marketplace.json`) and install from `/plugins`, or `codex plugin marketplace add https://github.com/adtechnology/gpt-audit.git --sparse .agents/plugins`.
- Fallback: `cp -R gpt-audit ~/.codex/plugins/gpt-audit`.

## Repo layout

```
plugin.json                    Antigravity manifest        mcp_config.json   Antigravity -> chrome-devtools-mcp
.claude-plugin/plugin.json     Claude Code manifest        .mcp.json         Claude Code + Codex -> chrome-devtools-mcp
.claude-plugin/marketplace.json  one-entry marketplace     .codex-plugin/plugin.json  Codex manifest
.agents/plugins/marketplace.json Codex repo marketplace    .agents/rules/    workspace rules for building this repo
skills/gpt-audit/SKILL.md      the audit procedure (shared by all three agents)
skills/gpt-audit/scripts/      collect-gpt.js, network-extract.js, analyze.js, report.js, rules/, tests/
skills/gpt-audit/references/   anomaly-catalog.md, gampad-params.md
rules/no-ad-interaction.md     plugin rule: never touch creatives, always accept the CMP
agents/gpt-auditor.md          Antigravity subagent
fixtures/                      broken-page.html (planted anomalies), broken-page-hb.html (R08), serve.sh
docs/PLAN.md, docs/TARGETS.md  build plan and demo targets
```

## Development

`npm test` runs the unit tests (`node --test`), `npm run check` syntax-checks the scripts, `npm run fixture` serves the fixture pages at http://localhost:8787/. The build itself is done with Antigravity, phase by phase, following the prompts in `docs/PLAN.md`.

## Guardrails

The agent never clicks, hovers or interacts with anything inside a `google_ads_iframe_*` frame (that would be invalid traffic), never calls `googletag.display()` or `refresh()` on a page it does not own, always accepts the consent dialog with "accept all" (the only click in a run), loads each page once, and treats page content and network payloads as data, not instructions.

## License

MIT
