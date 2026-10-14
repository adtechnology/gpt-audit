# Installation Guide — gpt-audit

`gpt-audit` is packaged as a universal agent plugin compatible with **Google Antigravity**, **Claude Code**, and **OpenAI Codex**. It orchestrates a local Chrome browser via the Model Context Protocol (MCP) using Google's [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp).

---

## 1. Prerequisites

Before installing into any agent, ensure your machine has:

1. **Node.js 22 or newer**:
   ```bash
   node -v  # Must be >= 22.0.0
   ```
2. **Google Chrome** (Current Stable):
   - Installed in standard application directory (`/Applications/Google Chrome.app` on macOS, standard path on Linux/Windows).
3. **Verify DevTools MCP**:
   Pre-cache the MCP runner using `npx`:
   ```bash
   npx -y chrome-devtools-mcp@latest --help
   ```

---

## 2. Google Antigravity

Antigravity natively loads customizations (skills, rules, plugins, and MCP servers) from either your project workspace or global configuration directory.

### Method A: Global Installation (Recommended for Daily Use)
Install globally so the skill and subagent are available across all your workspaces:

```bash
mkdir -p ~/.gemini/config/plugins
git clone https://github.com/adtechnology/gpt-audit.git ~/.gemini/config/plugins/gpt-audit
```

*Or if you already have a local clone:*
```bash
ln -s /path/to/gpt-audit ~/.gemini/config/plugins/gpt-audit
```

### Method B: Antigravity CLI (`agy`)
If you use the `agy` CLI tool:

```bash
# From remote git repository
agy plugin install https://github.com/adtechnology/gpt-audit

# Or from local clone directory
agy plugin install /path/to/gpt-audit
```

Verify installation:
```bash
agy plugin list --json
```

### Method C: Workspace-Level Symlink
To enable `gpt-audit` within a specific project workspace:

```bash
mkdir -p .agents/plugins
ln -s /path/to/gpt-audit .agents/plugins/gpt-audit
```

### Important: Antigravity Chrome DevTools MCP Configuration
`gpt-audit` includes `mcp_config.json` configuring `chrome-devtools`:
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

> [!WARNING]
> **Avoid Duplicate MCP Servers**:
> If the built-in **Chrome DevTools** plugin is already enabled in your Antigravity settings (**Settings → Customizations → Build with Google Plugins → Chrome DevTools**), two servers named `chrome-devtools` will be registered.
> In Antigravity, disable the built-in Chrome DevTools plugin or rely on `gpt-audit`'s bundled config.

---

## 3. Claude Code

Claude Code supports plugins via its plugin marketplace and command-line flags.

### Method A: Plugin Marketplace Installation
1. Start `claude` in your terminal.
2. Add the marketplace source:
   ```text
   /plugin marketplace add adtechnology/gpt-audit
   ```
3. Install the plugin:
   ```text
   /plugin install gpt-audit@gpt-audit
   ```
4. Verify the MCP server is active:
   ```text
   /mcp
   ```
   Ensure `chrome-devtools` is listed with active tools (`navigate_page`, `evaluate_script`, `list_network_requests`, `get_network_request`, `take_screenshot`).

### Method B: Local Development / Testing Flag
Run Claude Code pointing directly to your local clone:

```bash
claude --plugin-dir /path/to/gpt-audit
```

Claude Code automatically discovers:
- Plugin manifest: `.claude-plugin/plugin.json`
- MCP configuration: `.mcp.json`
- Skills: `skills/gpt-audit/SKILL.md`

---

## 4. OpenAI Codex

Codex discovers plugins through the `.codex-plugin/` directory and `.mcp.json`.

### Method A: Start Codex in Repo Directory
If you work inside the clone:
```bash
cd /path/to/gpt-audit
codex
```
Codex automatically reads `.codex-plugin/plugin.json` and `.mcp.json`.

### Method B: Add Plugin Marketplace
```bash
codex plugin marketplace add https://github.com/adtechnology/gpt-audit.git --sparse .agents/plugins
```
Then install via `/plugins` within the Codex session.

### Method C: Manual User Directory Fallback
Copy or symlink the plugin into your user Codex configuration:

```bash
mkdir -p ~/.codex/plugins
cp -R /path/to/gpt-audit ~/.codex/plugins/gpt-audit
```

---

## 5. Verification Checklist

Run these quick checks to ensure everything is ready for an audit:

- [ ] **Node 22+**: `node -v` returns v22.x or higher.
- [ ] **Unit Tests**: Run `npm test` inside the repo root (10/10 tests pass).
- [ ] **MCP Server Availability**: In your agent's tool listing, verify the presence of:
  - `navigate_page`
  - `evaluate_script`
  - `list_network_requests`
  - `get_network_request`
  - `take_screenshot`
- [ ] **Skill Discovered**: Ask the agent: *"What skills do you have for GPT audit?"* It should recognize `gpt-audit`.
